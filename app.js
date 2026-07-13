// ===================== app switcher =====================
(function(){
  function showApp(which){
    document.getElementById('rider-app-root').classList.toggle('active', which === 'rider');
    document.getElementById('user-app-root').classList.toggle('active', which === 'user');
  }
  document.getElementById('switch-to-rider-btn').addEventListener('click', function(){ showApp('rider'); });
  document.getElementById('switch-to-user-btn').addEventListener('click', function(){ showApp('user'); });
})();

// ===================== RIDER APP (own IIFE, kept separate from user app) =====================
(function(){
  var SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';

  async function sbFetch(path, options){
    options = options || {};
    var headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if(options.prefer) headers['Prefer'] = options.prefer;
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await res.text();
    var data = null;
    try{ data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
    if(!res.ok){
      var err = new Error((data && data.message) || ('HTTP ' + res.status));
      err.raw = data;
      throw err;
    }
    return data;
  }

  var state = {
    riderId: localStorage.getItem('ridelot_rider_id') || null,
    online: false,
    watchId: null,
    testLocationTimer: null,
    pollTimer: null,
    heartbeatTimer: null,
    map: null,
    driverMarker: null,
    passengerMarker: null
  };

  function toast(msg, ms){
    var t = document.getElementById('rd-toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.classList.remove('show'); }, ms || 2500);
  }

  function setPill(status){
    var pill = document.getElementById('rd-status-pill');
    pill.className = 'pill ' + status;
    pill.textContent = status === 'available' ? 'Available' : (status === 'busy' ? 'On a trip' : 'Offline');
  }

  // ---------- profile setup ----------
  function loadProfileFromCache(){
    var name = localStorage.getItem('ridelot_rider_name');
    var vtype = localStorage.getItem('ridelot_rider_vtype');
    var vlabel = localStorage.getItem('ridelot_rider_vlabel');
    var plate = localStorage.getItem('ridelot_rider_plate');
    var phone = localStorage.getItem('ridelot_rider_phone');
    if (name) document.getElementById('rd-rider-name').value = name;
    if (vtype) document.getElementById('rd-rider-vtype').value = vtype;
    if (vlabel) document.getElementById('rd-rider-vlabel').value = vlabel;
    if (plate) document.getElementById('rd-rider-plate').value = plate;
    if (phone) document.getElementById('rd-rider-phone').value = phone;
  }

  function loadProfileIntoForm(profile){
    document.getElementById('rd-rider-name').value = profile.name || '';
    document.getElementById('rd-rider-vtype').value = profile.vehicle_type || 'bike';
    document.getElementById('rd-rider-vlabel').value = profile.vehicle_label || '';
    document.getElementById('rd-rider-plate').value = profile.plate || '';
    document.getElementById('rd-rider-phone').value = profile.phone || '';
  }

  function showMain(profile){
    document.getElementById('rd-setup-section').style.display = 'none';
    document.getElementById('rd-main-section').style.display = 'block';
    document.getElementById('rd-display-name').textContent = profile.name;
    document.getElementById('rd-display-vehicle').textContent = profile.vehicle_label + ' (' + profile.vehicle_type + ')';
    setPill(profile.status || 'offline');
  }

  document.getElementById('rd-save-profile-btn').addEventListener('click', async function(){
    var name = document.getElementById('rd-rider-name').value.trim();
    var vtype = document.getElementById('rd-rider-vtype').value;
    var vlabel = document.getElementById('rd-rider-vlabel').value.trim();
    var plate = document.getElementById('rd-rider-plate').value.trim();
    var phone = document.getElementById('rd-rider-phone').value.trim();
    if(!name || !vlabel || !plate){
      toast('Please fill in name, vehicle model, and plate');
      return;
    }
    var payload = { name: name, vehicle_type: vtype, vehicle_label: vlabel, plate: plate, phone: phone, status: 'offline' };

    try{
      var result, row;
      if(state.riderId){
        result = await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body: payload, prefer:'return=representation' });
      } else {
        result = await sbFetch('riders', { method:'POST', body: payload, prefer:'return=representation' });
      }
      row = Array.isArray(result) ? result[0] : result;
      state.riderId = row.id;
      localStorage.setItem('ridelot_rider_id', state.riderId);
      localStorage.setItem('ridelot_rider_name', name);
      localStorage.setItem('ridelot_rider_vtype', vtype);
      localStorage.setItem('ridelot_rider_vlabel', vlabel);
      localStorage.setItem('ridelot_rider_plate', plate);
      localStorage.setItem('ridelot_rider_phone', phone);
      showMain(row);
      toast('Profile saved');
    } catch(err){
      console.error(err);
      toast('Could not save profile: ' + (err.message || 'unknown error'));
    }
  });

  document.getElementById('rd-edit-profile-btn').addEventListener('click', function(){
    document.getElementById('rd-main-section').style.display = 'none';
    document.getElementById('rd-setup-section').style.display = 'block';
  });

  // ---------- location sharing ----------

  // Fixed test coordinates so testers don't need to share real GPS. Match
  // the same points used in the user app so a rider and a user testing
  // together actually show up near each other.
  var TEST_LOCATIONS = {
    A: { lat: 12.9716, lng: 77.5946 },
    B: { lat: 12.9740, lng: 77.5970 },
    C: { lat: 12.9690, lng: 77.5920 }
  };
  var locationMode = 'real';

  Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(btn){
    btn.addEventListener('click', function(){
      locationMode = btn.getAttribute('data-mode');
      Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(b){
        b.classList.toggle('selected', b === btn);
      });
      var isTest = locationMode === 'test';
      document.getElementById('rd-test-location-select').style.display = isTest ? 'block' : 'none';
      document.getElementById('rd-test-loc-help').style.display = isTest ? 'block' : 'none';
    });
  });

  function startSharingLocation(){
    if(locationMode === 'test'){
      var pointKey = document.getElementById('rd-test-location-select').value;
      var point = TEST_LOCATIONS[pointKey];
      document.getElementById('rd-display-location').textContent = 'Test Point ' + pointKey + ' (not real GPS)';
      async function pushTestLocation(){
        try{
          await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ lat: point.lat, lng: point.lng, updated_at: new Date().toISOString() } });
        } catch(err){ console.error('test location update failed', err); }
      }
      pushTestLocation();
      state.testLocationTimer = setInterval(pushTestLocation, 5000);
      return true;
    }
    if(!('geolocation' in navigator)){
      toast('This browser cannot share location');
      return false;
    }
    state.watchId = navigator.geolocation.watchPosition(async function(pos){
      var lat = pos.coords.latitude, lng = pos.coords.longitude;
      document.getElementById('rd-display-location').textContent = lat.toFixed(4) + ', ' + lng.toFixed(4);
      try{
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ lat: lat, lng: lng, updated_at: new Date().toISOString() } });
      } catch(err){ console.error('location update failed', err); }
    }, function(err){
      console.error(err);
      toast('Location error: ' + err.message);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
    return true;
  }

  function stopSharingLocation(){
    if(state.watchId !== null){
      navigator.geolocation.clearWatch(state.watchId);
      state.watchId = null;
    }
    clearInterval(state.testLocationTimer);
    document.getElementById('rd-display-location').textContent = 'Not sharing';
  }

  function startHeartbeat(){
    clearInterval(state.heartbeatTimer);
    state.heartbeatTimer = setInterval(async function(){
      if (state.riderId && state.online) {
        try {
          await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ updated_at: new Date().toISOString() } });
        } catch(err){ console.error('heartbeat update failed', err); }
      }
    }, 45000); // 45 seconds heartbeat ping
  }

  function stopHeartbeat(){
    clearInterval(state.heartbeatTimer);
  }

  // ---------- online/offline toggle ----------
  var toggleBtn = document.getElementById('rd-toggle-online-btn');
  toggleBtn.addEventListener('click', async function(){
    if(!state.online){
      var ok = startSharingLocation();
      if(!ok) return;
      try{
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'available', updated_at: new Date().toISOString() } });
        state.online = true;
        toggleBtn.textContent = 'Go offline';
        toggleBtn.className = 'btn btn-toggle-on';
        setPill('available');
        toast('You are online and visible to nearby users');
        startPollingBookings();
        startHeartbeat();
      } catch(err){
        toast('Could not go online: ' + err.message);
      }
    } else {
      stopSharingLocation();
      stopHeartbeat();
      destroyRiderMap();
      try{
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'offline' } });
      } catch(err){ console.error(err); }
      state.online = false;
      toggleBtn.textContent = 'Go online';
      toggleBtn.className = 'btn btn-toggle-off';
      setPill('offline');
      stopPollingBookings();
      toast('You are offline');
    }
  });

  // ---------- booking requests ----------
  function startPollingBookings(){
    fetchBookings();
    state.pollTimer = setInterval(fetchBookings, 4000);
  }
  function stopPollingBookings(){
    clearInterval(state.pollTimer);
  }

  function destroyRiderMap() {
    if (state.map) {
      try {
        state.map.remove();
      } catch (e) { console.error('Error removing rider map:', e); }
      state.map = null;
      state.driverMarker = null;
      state.passengerMarker = null;
    }
  }

  async function showRiderTracking(b) {
    document.getElementById('rd-main-section').style.display = 'none';
    document.getElementById('rd-tracking-section').style.display = 'flex';

    document.getElementById('rd-track-user-name').textContent = b.user_name || 'Passenger';
    document.getElementById('rd-track-pickup').textContent = b.pickup_label || '-';
    document.getElementById('rd-track-drop').textContent = b.drop_label || '-';
    document.getElementById('rd-track-fare').textContent = 'Rs ' + (b.fare || '-');

    var actionsEl = document.getElementById('rd-track-actions');
    var buttonHtml = '';
    if (b.status === 'accepted') {
      buttonHtml = 
        '<div class="maps-link-box" style="margin: 0 0 10px 0; background: var(--bg); border-radius: 12px; padding: 10px; font-size: 13px;">' +
          'Navigate to pickup: <a href="' + mapsLinkFor(b) + '" target="_blank" rel="noopener" style="display:block; text-align:center; background:#fff; border:1.5px solid var(--border); border-radius:10px; padding:8px; font-weight:700; color:#1a73e8; text-decoration:none; margin-top:6px;">Open in Google Maps</a>' +
        '</div>' +
        '<button class="btn" style="background:var(--green); border-color:var(--green); color:#fff;" id="rd-btn-arrived">I have arrived</button>';
    } else if (b.status === 'arrived') {
      buttonHtml = '<button class="btn" style="background:var(--signal); border-color:var(--accent); color:var(--accent);" id="rd-btn-start">Start trip</button>';
    } else if (b.status === 'in_progress') {
      buttonHtml = '<button class="btn" style="background:var(--red); border-color:var(--red); color:#fff;" id="rd-btn-complete">Complete trip</button>';
    }
    actionsEl.innerHTML = buttonHtml;

    var arrivedBtn = document.getElementById('rd-btn-arrived');
    var startBtn = document.getElementById('rd-btn-start');
    var completeBtn = document.getElementById('rd-btn-complete');
    
    if (arrivedBtn) arrivedBtn.addEventListener('click', function() { handleBookingAction('arrived', b.id); });
    if (startBtn) startBtn.addEventListener('click', function() { handleBookingAction('start', b.id); });
    if (completeBtn) completeBtn.addEventListener('click', function() { handleBookingAction('complete', b.id); });

    try {
      var riderRows = await sbFetch('riders?id=eq.' + state.riderId);
      var r = riderRows[0];
      var dLat = (r && r.lat != null) ? r.lat : b.pickup_lat;
      var dLng = (r && r.lng != null) ? r.lng : b.pickup_lng;
      
      var pLat = b.pickup_lat;
      var pLng = b.pickup_lng;

      if (!state.map) {
        state.map = L.map('rd-map', {
          zoomControl: false,
          attributionControl: false
        }).setView([dLat, dLng], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(state.map);

        var driverIcon = L.divIcon({
          html: '<div style="background-color:#16181c; color:#fff; width:22px; height:22px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; box-shadow:0 1px 4px rgba(0,0,0,0.4);">R</div>',
          className: 'custom-rider-icon',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        state.driverMarker = L.marker([dLat, dLng], { icon: driverIcon }).addTo(state.map);

        if (pLat != null && pLng != null) {
          var passengerIcon = L.divIcon({
            html: '<div style="background-color:#1d9e75; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
            className: 'custom-passenger-icon',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
          state.passengerMarker = L.marker([pLat, pLng], { icon: passengerIcon }).addTo(state.map);
        }
      } else {
        if (state.driverMarker) state.driverMarker.setLatLng([dLat, dLng]);
        if (state.passengerMarker && pLat != null && pLng != null) state.passengerMarker.setLatLng([pLat, pLng]);
      }

      if (state.map) {
        if (dLat != null && dLng != null && pLat != null && pLng != null) {
          var bounds = L.latLngBounds([[dLat, dLng], [pLat, pLng]]);
          state.map.fitBounds(bounds, { padding: [20, 20] });
        } else {
          state.map.setView([dLat, dLng], 15);
        }
      }
    } catch (err) {
      console.error('Failed to update driver map:', err);
    }
  }

  async function fetchBookings(){
    if(!state.riderId) return;
    try{
      var rows = await sbFetch('bookings?rider_id=eq.' + state.riderId + '&status=in.(requested,accepted,arrived,in_progress)&order=created_at.desc');
      
      var activeBooking = (rows || []).find(function(b){
        return b.status === 'accepted' || b.status === 'arrived' || b.status === 'in_progress';
      });

      if (activeBooking) {
        showRiderTracking(activeBooking);
      } else {
        document.getElementById('rd-tracking-section').style.display = 'none';
        document.getElementById('rd-main-section').style.display = 'block';
        destroyRiderMap();
        
        var requests = (rows || []).filter(function(b){ return b.status === 'requested'; });
        renderBookings(requests);
      }
    } catch(err){
      console.error('fetch bookings failed', err);
    }
  }

  function mapsLinkFor(b){
    if(b.pickup_lat && b.pickup_lng){
      return 'https://www.google.com/maps/dir/?api=1&destination=' + b.pickup_lat + ',' + b.pickup_lng + '&travelmode=driving';
    }
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.pickup_label || '');
  }

  function renderBookings(list){
    var el = document.getElementById('rd-bookings-list');
    if(!list.length){
      el.innerHTML = '<div class="empty-state">No requests yet. Stay online to receive them.</div>';
      return;
    }
    el.innerHTML = list.map(function(b){
      var actions = '';
      if(b.status === 'requested'){
        actions = '<div class="booking-actions">' +
          '<button class="btn btn-decline" data-action="decline" data-id="'+b.id+'">Decline</button>' +
          '<button class="btn" data-action="accept" data-id="'+b.id+'">Accept</button>' +
        '</div>';
      }
      return '<div class="booking-card">' +
        '<h3>'+(b.user_name || 'Rider request')+' \u2014 '+(b.vehicle_type||'')+'</h3>' +
        '<div class="meta">Pickup: '+(b.pickup_label||'-')+'<br>Drop: '+(b.drop_label||'-')+'<br>Fare: Rs '+(b.fare||'-')+'</div>' +
        actions +
      '</div>';
    }).join('');

    Array.prototype.forEach.call(el.querySelectorAll('button[data-action]'), function(btn){
      btn.addEventListener('click', function(){ handleBookingAction(btn.getAttribute('data-action'), btn.getAttribute('data-id')); });
    });
  }

  async function handleBookingAction(action, bookingId){
    var statusMap = { accept:'accepted', decline:'cancelled', arrived:'arrived', start:'in_progress', complete:'completed' };
    var newStatus = statusMap[action];
    try{
      await sbFetch('bookings?id=eq.' + bookingId, { method:'PATCH', body:{ status: newStatus } });
      if(action === 'accept'){
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'busy' } });
        setPill('busy');
      }
      if(action === 'complete' || action === 'decline'){
        await sbFetch('riders?id=eq.' + state.riderId, { method:'PATCH', body:{ status: 'available' } });
        setPill('available');
      }
      toast('Updated');
      fetchBookings();
    } catch(err){
      toast('Could not update: ' + err.message);
    }
  }

  // ---------- init ----------
  async function init(){
    loadProfileFromCache();
    if(state.riderId){
      try{
        var rows = await sbFetch('riders?id=eq.' + state.riderId);
        var row = rows && rows[0];
        if(!row){
          localStorage.removeItem('ridelot_rider_id');
          state.riderId = null;
        } else {
          loadProfileIntoForm(row);
          showMain(row);
          if(row.status === 'available'){
            state.online = true;
            toggleBtn.textContent = 'Go offline';
            toggleBtn.className = 'btn btn-toggle-on';
            startSharingLocation();
            startPollingBookings();
            startHeartbeat();
          }
          return;
        }
      } catch(err){ console.error(err); }
    }
  }
  init();
})();

// ===================== USER APP (own IIFE, kept separate from rider app) =====================
(function(){
  var SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';

  // No SDK — talks to Supabase's REST API directly with plain fetch. The
  // SDK's UMD build was throwing a DataCloneError on some devices; this
  // sidesteps that class of bug entirely and is what we confirmed actually
  // works end to end in the connection test.
  async function sbFetch(path, options){
    options = options || {};
    var headers = {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      'Content-Type': 'application/json'
    };
    if(options.prefer) headers['Prefer'] = options.prefer;
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    var text = await res.text();
    var data = null;
    try{ data = text ? JSON.parse(text) : null; } catch(e){ data = text; }
    if(!res.ok){
      var err = new Error((data && data.message) || ('HTTP ' + res.status));
      err.raw = data;
      throw err;
    }
    return data;
  }

  // ---------------- inline icon library (no external font dependency) ----------------
  var ICONS = {
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    'bell': '<path d="M6 8a6 6 0 1112 0c0 3 1 4 1.5 5.5H4.5C5 12 6 11 6 8z"/><path d="M9.5 17a2.5 2.5 0 005 0"/>',
    'car': '<path d="M3 13l1.5-4.5A2 2 0 016.4 7h11.2a2 2 0 011.9 1.5L21 13"/><rect x="2.5" y="13" width="19" height="5.5" rx="1.5"/><circle cx="7" cy="18.5" r="1.5"/><circle cx="17" cy="18.5" r="1.5"/>',
    'cash': '<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 9v0M18 15v0"/>',
    'check': '<path d="M5 12l5 5L20 7"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'circle-check': '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.3 2.3L16 10"/>',
    'clock': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    'credit-card': '<rect x="2.5" y="5.5" width="19" height="13" rx="2"/><path d="M2.5 10h19"/><path d="M6 14.5h4"/>',
    'headset': '<path d="M4 13a8 8 0 0116 0"/><rect x="3" y="13" width="4" height="6" rx="1.5"/><rect x="17" y="13" width="4" height="6" rx="1.5"/><path d="M19 19v1a3 3 0 01-3 3h-3"/>',
    'home': '<path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v9.5a1 1 0 001 1h10a1 1 0 001-1V10"/><path d="M10 20v-5h4v5"/>',
    'logout': '<path d="M9 7V5.5A1.5 1.5 0 0110.5 4h6A1.5 1.5 0 0118 5.5v13a1.5 1.5 0 01-1.5 1.5h-6A1.5 1.5 0 019 18.5V17"/><path d="M3 12h11.5"/><path d="M11.5 8.5L15 12l-3.5 3.5"/>',
    'map-pin': '<path d="M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    'message-circle': '<path d="M4 12a8 8 0 1114.5 4.6L20 20l-4-1.2A8 8 0 014 12z"/>',
    'motorbike': '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l3-7h4l1 3M13 10l2.5 7M9 17h9"/><circle cx="15.5" cy="7" r="1.2"/>',
    'phone': '<path d="M5 4.5h3.5L10 9l-2 1.5a11 11 0 005.5 5.5L15 14l4.5 1.5V19a1.5 1.5 0 01-1.5 1.5C10.5 20.5 3.5 13.5 3.5 6A1.5 1.5 0 015 4.5z"/>',
    'qrcode': '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2M14 19h2v2M19 19h2v2"/>',
    'user': '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/>',
    'user-circle': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="10" r="2.7"/><path d="M6.5 18a6 6 0 0111 0"/>',
    'x': '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function iconSvg(name){
    var inner = ICONS[name] || '';
    return '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-0.15em;">'+inner+'</svg>';
  }

  function replaceIconPlaceholders(){
    Array.prototype.forEach.call(document.querySelectorAll('i.ti'), function(el){
      var cls = el.className.match(/ti-([a-z0-9-]+)/);
      if(!cls) return;
      var name = cls[1];
      var holder = document.createElement('span');
      holder.className = el.className;
      if(el.getAttribute('style')) holder.setAttribute('style', el.getAttribute('style'));
      holder.innerHTML = iconSvg(name);
      holder.style.color = 'inherit';
      if(el.hasAttribute('aria-hidden')) holder.setAttribute('aria-hidden','true');
      el.replaceWith(holder);
    });
  }
  replaceIconPlaceholders();

  // ---------------- app state ----------------
  var state = {
    userName: '',
    pickup: 'Pickup point',
    drop: 'Drop point',
    lat: null,
    lng: null,
    selectedRideType: 'bike',
    realRiderCount: 0,
    activeBookingId: null,
    activeRider: null,
    activeType: null,
    activePrice: null,
    currentRider: null,
    currentType: null,
    currentFare: null,
    lastKnownStatus: null,
    exitAnimationPlayed: false,
    trackAnimPlayed: false,
    bookingPollTimer: null,
    map: null,
    driverMarker: null,
    passengerMarker: null
  };

  function toast(msg, ms){
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.classList.remove('show'); }, ms || 2200);
  }

  // ---------------- screen navigation ----------------
  function showScreen(id){
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function(s){
      s.classList.remove('active');
    });
    document.getElementById(id).classList.add('active');
  }

  function setActiveTab(name){
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(t){
      t.classList.toggle('active', t.getAttribute('data-tab') === name);
    });
  }

  // Fixed test coordinates so testers don't need to share their real GPS.
  // Close together (a few hundred metres apart) so a rider and a user who
  // both pick the same test point actually show up near each other.
  var TEST_LOCATIONS = {
    A: { lat: 12.9716, lng: 77.5946 },
    B: { lat: 12.9740, lng: 77.5970 },
    C: { lat: 12.9690, lng: 77.5920 }
  };
  var locationMode = 'real';

  Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(btn){
    btn.addEventListener('click', function(){
      locationMode = btn.getAttribute('data-mode');
      Array.prototype.forEach.call(document.querySelectorAll('.loc-mode-btn'), function(b){
        b.classList.toggle('selected', b === btn);
      });
      var isTest = locationMode === 'test';
      document.getElementById('test-location-select').style.display = isTest ? 'block' : 'none';
      document.getElementById('test-loc-help').style.display = isTest ? 'block' : 'none';
      document.getElementById('login-btn').textContent = isTest
        ? 'Use test location and find riders'
        : 'Share my location and find riders';
    });
  });

  document.getElementById('login-btn').addEventListener('click', async function(){
    var name = document.getElementById('login-name').value.trim();
    var pickup = document.getElementById('pickup-input').value.trim();
    var drop = document.getElementById('drop-input').value.trim();
    if(!name){
      toast('Please enter your name');
      return;
    }
    state.userName = name;
    state.pickup = pickup || 'Pickup point';
    state.drop = drop || 'Drop point';

    function proceedToLot(){
      document.getElementById('lot-title').textContent = state.pickup + ' \u2192 ' + state.drop;
      document.getElementById('lot-place-name').textContent = state.pickup;
      showScreen('screen-lot');
      resetLot();
    }

    if(locationMode === 'test'){
      var pointKey = document.getElementById('test-location-select').value;
      var point = TEST_LOCATIONS[pointKey];
      state.lat = point.lat;
      state.lng = point.lng;
      toast('Using Test Point ' + pointKey + ' (not your real location)');
      proceedToLot();
      return;
    }

    if(!('geolocation' in navigator)){
      toast('This browser cannot access location');
      return;
    }
    document.getElementById('loc-status').textContent = 'Getting your location...';
    navigator.geolocation.getCurrentPosition(function(pos){
      state.lat = pos.coords.latitude;
      state.lng = pos.coords.longitude;
      proceedToLot();
    }, function(err){
      toast('Location error: ' + err.message);
      document.getElementById('loc-status').textContent = 'Could not get your location. Check permissions and try again.';
    }, { enableHighAccuracy: true, timeout: 15000 });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.ride-type-card'), function(card){
    card.addEventListener('click', function(){
      var type = card.getAttribute('data-type');
      state.selectedRideType = type;
      Array.prototype.forEach.call(document.querySelectorAll('.ride-type-card'), function(c){
        c.classList.toggle('selected', c === card);
      });
      updateBookButton();
    });
  });

  document.getElementById('lot-back').addEventListener('click', function(){
    clearInterval(pollTimer);
    showScreen('screen-login');
  });

  // ---------------- parking lot (vehicle icons + booking) ----------------

  function bikeMarkup(id, colorBody, colorAccent){
    return (
      '<g class="vehicle-shape" data-id="'+id+'" data-type="bike" tabindex="0" role="button" aria-label="Bike, tap for rider details">' +
        '<rect x="-6.5" y="20" width="13" height="22" rx="5" fill="#202225"/>' +
        '<rect x="-5" y="21.5" width="10" height="19" rx="4" fill="#3a3d42"/>' +
        '<rect x="-9" y="-4" width="18" height="28" rx="7" fill="'+colorBody+'"/>' +
        '<ellipse cx="0" cy="-14" rx="8.5" ry="11" fill="'+colorBody+'"/>' +
        '<ellipse cx="0" cy="-15" rx="5.5" ry="7" fill="rgba(255,255,255,0.25)"/>' +
        '<rect x="-13" y="-26" width="26" height="5.5" rx="2.5" fill="'+colorAccent+'"/>' +
        '<rect x="-1.6" y="-28" width="3.2" height="10" rx="1.4" fill="'+colorAccent+'"/>' +
        '<rect x="-6.5" y="-36" width="13" height="14" rx="4.5" fill="#202225"/>' +
        '<rect x="-5" y="-34.5" width="10" height="11" rx="3.5" fill="#3a3d42"/>' +
      '</g>'
    );
  }

  function carMarkup(id, colorBody, colorGlass){
    return (
      '<g class="vehicle-shape" data-id="'+id+'" data-type="car" tabindex="0" role="button" aria-label="Car, tap for rider details">' +
        '<rect x="-22" y="-44" width="44" height="88" rx="13" fill="#2b2e33"/>' +
        '<rect x="-19.5" y="-41" width="39" height="82" rx="11" fill="'+colorBody+'"/>' +
        '<rect x="-15" y="-30" width="30" height="22" rx="5" fill="'+colorGlass+'" opacity="0.85"/>' +
        '<rect x="-15" y="9" width="30" height="20" rx="5" fill="'+colorGlass+'" opacity="0.85"/>' +
        '<rect x="-22.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<rect x="18.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<line x1="-19.5" y1="0" x2="19.5" y2="0" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>' +
      '</g>'
    );
  }

  function autoMarkup(id, colorBody){
    return (
      '<g class="vehicle-shape" data-id="'+id+'" data-type="auto" tabindex="0" role="button" aria-label="Auto rickshaw, tap for rider details">' +
        '<rect x="-15" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<rect x="4" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<rect x="-13" y="16" width="9" height="11" rx="3" fill="#3a3d42"/>' +
        '<rect x="6" y="16" width="9" height="11" rx="3" fill="#3a3d42"/>' +
        '<path d="M-17 18 L-17 -10 A17 17 0 0117 -10 L17 18 Z" fill="'+colorBody+'"/>' +
        '<rect x="-13" y="-6" width="26" height="20" rx="4" fill="rgba(255,255,255,0.3)"/>' +
        '<rect x="-3" y="-24" width="6" height="16" rx="2.5" fill="#202225"/>' +
        '<rect x="-15" y="-28" width="30" height="6" rx="3" fill="'+colorBody+'"/>' +
        '<circle cx="0" cy="-30" r="3" fill="'+colorBody+'"/>' +
      '</g>'
    );
  }

  var bikePalette = [
    { body:'#1f6fb0', accent:'#16181c' },
    { body:'#1d9e75', accent:'#16181c' },
    { body:'#c97a17', accent:'#16181c' },
    { body:'#d23c3c', accent:'#16181c' }
  ];
  var carPalette = [
    { body:'#3c3489', glass:'#aab4c2' },
    { body:'#16181c', glass:'#aab4c2' },
    { body:'#9a3b3b', glass:'#aab4c2' },
    { body:'#1f5f8b', glass:'#aab4c2' }
  ];
  var autoPalette = [
    { body:'#c9a227' },
    { body:'#3c8f5c' },
    { body:'#1f6fb0' },
    { body:'#9a3b3b' }
  ];

  // Two facing rows across a center aisle — bikes, autos, and cars can all
  // park in any slot in either row. Each slot just holds a position; the
  // vehicle type living there is decided when that slot gets filled.
  var slotXs = [40, 100, 160, 220, 280, 340];
  var topY = 76;
  var bottomY = 184;
  var REST_ROT = 0; // set per-row at render time (top row faces down, bottom row faces up)

  // Slots only hold a position + which row they're in. Each slot is filled
  // with a REAL rider fetched from Supabase, not fake data — if more riders
  // are online than there are slots, only the closest ones shown here are
  // displayed; the rest still exist and can be found by widening search.
  var slotDefs = [];
  slotXs.forEach(function(x, i){ slotDefs.push({ id:'top'+i, x:x, y:topY, row:'top' }); });
  slotXs.forEach(function(x, i){ slotDefs.push({ id:'bot'+i, x:x, y:bottomY, row:'bottom' }); });

  var present, riderAssign, slotType, pollTimer;
  var svg = document.getElementById('lot-svg');

  function haversineKm(lat1, lon1, lat2, lon2){
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)*Math.sin(dLon/2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  // Pulls real available riders from Supabase, sorts by real distance from
  // the user, and maps the closest ones onto the slot grid for display.
  function withTimeout(promise, ms){
    return Promise.race([
      promise,
      new Promise(function(_, reject){
        setTimeout(function(){ reject(new Error('Request timed out')); }, ms);
      })
    ]);
  }

  async function fetchRealRiders(){
    try{
      var rows = await withTimeout(sbFetch('riders?status=eq.available'), 8000);
      var tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      var nearby = (rows || []).filter(function(r){
        if (r.lat == null || r.lng == null) return false;
        if (r.updated_at) {
          var updatedAt = new Date(r.updated_at);
          if (updatedAt < tenMinutesAgo) return false;
        }
        return true;
      }).map(function(r){
        r._distanceKm = (state.lat != null) ? haversineKm(state.lat, state.lng, r.lat, r.lng) : 0;
        return r;
      }).sort(function(a, b){ return a._distanceKm - b._distanceKm; });
      return nearby;
    } catch(err){
      console.error('fetch riders failed', err);
      toast('Could not load nearby riders: ' + err.message);
      return [];
    }
  }

  function mapRidersOntoSlots(riders){
    present = {};
    riderAssign = {};
    slotType = {};
    slotDefs.forEach(function(s, i){
      var r = riders[i];
      if(r){
        present[s.id] = true;
        slotType[s.id] = r.vehicle_type;
        riderAssign[s.id] = {
          dbId: r.id,
          name: r.name,
          initials: (r.name || '?').trim().split(/\s+/).map(function(p){ return p[0]; }).slice(0,2).join('').toUpperCase(),
          vehicleLabel: r.vehicle_label,
          plate: r.plate,
          distance: r._distanceKm.toFixed(1) + ' km',
          eta: Math.max(1, Math.round(r._distanceKm * 4)) + ' min'
        };
      } else {
        present[s.id] = false;
      }
    });
  }

  async function resetLot(){
    var riders = await fetchRealRiders();
    state.realRiderCount = riders.length;
    mapRidersOntoSlots(riders);
    document.getElementById('bonus-banner').classList.remove('show');
    document.getElementById('book-btn').disabled = false;
    document.getElementById('book-btn').style.opacity = '1';
    render();
    updateStatus();
    refreshSurgeAndFares();
    clearInterval(pollTimer);
    pollTimer = setInterval(async function(){
      var freshRiders = await fetchRealRiders();
      state.realRiderCount = freshRiders.length;
      mapRidersOntoSlots(freshRiders);
      render();
      updateStatus();
      refreshSurgeAndFares();
    }, 4000);
  }

  function paletteFor(slotId, type){
    var idx = parseInt(slotId.replace(/\D/g,''), 10) || 0;
    if(type === 'bike') return bikePalette[idx % bikePalette.length];
    if(type === 'auto') return autoPalette[idx % autoPalette.length];
    return carPalette[idx % carPalette.length];
  }

  function drawLotFrame(){
    var bg = '';
    var dividerXs = [20, 70, 130, 190, 250, 310, 370];
    dividerXs.forEach(function(x){
      bg += '<line x1="'+x+'" y1="40" x2="'+x+'" y2="112" stroke="#6a6e74" stroke-width="2" stroke-dasharray="6 6" opacity="0.5"/>';
    });
    dividerXs.forEach(function(x){
      bg += '<line x1="'+x+'" y1="148" x2="'+x+'" y2="220" stroke="#6a6e74" stroke-width="2" stroke-dasharray="6 6" opacity="0.5"/>';
    });
    bg += '<line x1="10" y1="130" x2="390" y2="130" stroke="#f4f4f4" stroke-width="2" stroke-dasharray="10 8" opacity="0.5"/>';
    return bg;
  }

  function render(){
    var html = drawLotFrame();
    slotDefs.forEach(function(s){
      if(present[s.id]){
        var type = slotType[s.id];
        var rotation = s.row === 'top' ? 180 : 0;
        var pal = paletteFor(s.id, type);
        var inner = type === 'bike' ? bikeMarkup(s.id, pal.body, pal.accent)
                  : type === 'auto' ? autoMarkup(s.id, pal.body)
                  : carMarkup(s.id, pal.body, pal.glass);
        html += '<g transform="translate('+s.x+','+s.y+') rotate('+rotation+')" class="slot-wrap" data-slot="'+s.id+'" data-x="'+s.x+'" data-y="'+s.y+'" data-rot="'+rotation+'" style="opacity:1;">' + inner + '</g>';
      }
    });
    svg.innerHTML = html;

    Array.prototype.forEach.call(svg.querySelectorAll('.vehicle-shape'), function(el){
      el.addEventListener('click', function(){
        openDetail(el.getAttribute('data-id'));
      });
      el.addEventListener('keydown', function(e){
        if(e.key === 'Enter' || e.key === ' '){ openDetail(el.getAttribute('data-id')); }
      });
    });
  }

  function countPresent(){
    return Object.keys(present).filter(function(k){ return present[k]; }).length;
  }

  // Surge: scarcer vehicles of a type => higher multiplier, same idea as
  // peak-time price hikes in real bike-taxi apps. Real scarcity is the only
  // input here — no manual override, since the data is real now.
  var BASE_PRICE = { bike: 35, auto: 55, car: 89 };

  function surgeMultiplierFor(type){
    var count = countByType(type);
    var mult = 1;
    if(count <= 0) mult = 2.2;
    else if(count === 1) mult = 1.6;
    else if(count === 2) mult = 1.25;
    else mult = 1;
    return Math.round(mult * 100) / 100;
  }

  function basePriceFor(type){
    return BASE_PRICE[type] || BASE_PRICE.bike;
  }

  function currentPriceFor(type){
    var base = basePriceFor(type);
    var mult = surgeMultiplierFor(type);
    return Math.round(base * mult);
  }

  function refreshSurgeAndFares(){
    var types = ['bike', 'auto', 'car'];
    var anySurge = false;
    types.forEach(function(type){
      var count = countByType(type);
      var price = currentPriceFor(type);
      var mult = surgeMultiplierFor(type);
      if(mult > 1) anySurge = true;

      var countEl = document.getElementById('rt-count-' + type);
      var priceEl = document.getElementById('rt-price-' + type);
      if(countEl) countEl.textContent = count > 0 ? (count + ' waiting') : 'none waiting';
      if(priceEl){
        priceEl.textContent = 'Rs ' + price;
        priceEl.classList.toggle('surge', mult > 1);
      }
    });

    var surgeBanner = document.getElementById('surge-banner');
    var surgeText = document.getElementById('surge-text');
    if(anySurge){
      surgeBanner.classList.add('show');
      surgeText.textContent = 'Demand is high right now \u2014 prices have gone up';
    } else {
      surgeBanner.classList.remove('show');
    }

    updateBookButton();
  }

  function updateBookButton(){
    var btn = document.getElementById('book-btn');
    var type = state.selectedRideType || 'bike';
    var price = currentPriceFor(type);
    var count = countByType(type);
    if(count > 0){
      btn.textContent = 'Book nearest ' + type + ' \u2014 Rs ' + price;
    } else {
      btn.textContent = 'Find a ' + type + ' nearby \u2014 Rs ' + price;
    }
  }

  function updateStatus(){
    var n = countPresent();
    var label = document.getElementById('count-label');
    if(n > 0){
      label.textContent = n + (n === 1 ? ' vehicle waiting' : ' vehicles waiting');
      label.className = 'count ok';
    } else {
      label.textContent = 'No vehicles waiting';
      label.className = 'count empty';
    }
  }

  // Vehicles rest already facing right, so leaving is simple: back up to the
  // left first (a clear, slow beat), pause, then drive straight out to the
  // right and off the edge. No turning, so it can never cross into another
  // column's vehicles.
  // Vehicles rest facing the aisle (front pointing toward the center line).
  // Leaving: back out of the bay first (clear, slow beat), then cut diagonally
  // into the dedicated transit margin above the top row / below the bottom
  // row — fully clear of every other parked vehicle in either row — then
  // drive straight right and off the edge.
  function removeVehicle(id, onDone){
    var wrap = svg.querySelector('.slot-wrap[data-slot="'+id+'"]');
    present[id] = false;
    delete riderAssign[id];
    delete slotType[id];
    if(!wrap){
      updateStatus();
      if(onDone) onDone();
      return;
    }
    var x = parseFloat(wrap.getAttribute('data-x'));
    var y = parseFloat(wrap.getAttribute('data-y'));
    var rot = parseFloat(wrap.getAttribute('data-rot'));
    var facingDown = rot === 180; // top-row vehicles are rotated to face the aisle

    // Reverse far enough to fully clear the bay and land exactly on the
    // open transit line — so the pivot happens on that line, and everything
    // after the pivot is a pure straight horizontal drive, no diagonal drift.
    var clearY = facingDown ? 14 : 246;
    var reverseY = clearY;
    // The artwork's "front" points toward -y at rotation 0. Top-row vehicles
    // start at rot=180 (front toward +y, into the aisle); bottom-row vehicles
    // start at rot=0 (front toward -y, into the aisle). To end up facing
    // right with the front leading: top-row needs +90 from its base,
    // bottom-row needs -90.
    var rightFacingRot = facingDown ? 90 : -90;

    var keyframes = [
      // 1. Parked, facing into the aisle.
      { transform: 'translate('+x+'px,'+y+'px) rotate('+rot+'deg)', offset: 0 },
      // 2. Reverse straight back, fully out of the bay, until clear of the
      //    row entirely (still facing the original direction).
      { transform: 'translate('+x+'px,'+reverseY+'px) rotate('+rot+'deg)', offset: 0.32 },
      { transform: 'translate('+x+'px,'+reverseY+'px) rotate('+rot+'deg)', offset: 0.42 },
      // 3. Pivot in place to face right — a dead-stop turn, no movement.
      { transform: 'translate('+x+'px,'+reverseY+'px) rotate('+rightFacingRot+'deg)', offset: 0.52 },
      // 4. Drive dead straight to the right, off the edge — same y the
      //    whole way, since it's already on the clear line.
      { transform: 'translate(430px,'+reverseY+'px) rotate('+rightFacingRot+'deg)', offset: 1 }
    ];

    wrap.removeAttribute('transform');
    wrap.style.transformBox = 'view-box';

    var anim = wrap.animate(keyframes, {
      duration: 4200,
      easing: 'ease-in-out',
      fill: 'forwards'
    });

    anim.onfinish = function(){
      render();
      updateStatus();
      if(onDone) onDone();
    };
  }

  function nearestId(type){
    var ids = Object.keys(present).filter(function(k){ return present[k] && (!type || slotType[k] === type); });
    return ids.length ? ids[0] : null;
  }

  function countByType(type){
    return Object.keys(present).filter(function(k){ return present[k] && slotType[k] === type; }).length;
  }

  function openDetail(id){
    var rider = riderAssign[id];
    if(!rider) return;
    var type = slotType[id];
    var typeLabel = vehicleLabelOf(type);
    var price = currentPriceFor(type);
    var mult = surgeMultiplierFor(type);
    var card = document.getElementById('detail-card');
    card.innerHTML =
      '<div class="detail-top">' +
        '<span class="detail-vehicle-tag '+type+'">'+typeLabel+'</span>' +
        '<button class="close-x" id="close-detail" aria-label="Close">&#10005;</button>' +
      '</div>' +
      '<div class="rider-row">' +
        '<div class="avatar">'+rider.initials+'</div>' +
        '<div>' +
          '<p class="rider-name">'+rider.name+'</p>' +
        '</div>' +
      '</div>' +
      '<div class="detail-grid">' +
        '<div class="detail-stat"><p class="k">Vehicle</p><p class="v">'+rider.vehicleLabel+'</p></div>' +
        '<div class="detail-stat"><p class="k">Plate</p><p class="v">'+rider.plate+'</p></div>' +
        '<div class="detail-stat"><p class="k">Distance away</p><p class="v">'+rider.distance+'</p></div>' +
        '<div class="detail-stat"><p class="k">Arrives in</p><p class="v">~'+rider.eta+'</p></div>' +
      '</div>' +
      '<div class="fare-row" style="margin:0 0 16px;">' +
        '<p class="k">Fare for this ride'+(mult > 1 ? ' (surge '+mult+'x)' : '')+'</p>' +
        '<p class="v">Rs '+price+'</p>' +
      '</div>' +
      '<button class="btn" id="detail-book-btn">Request this rider &mdash; Rs '+price+'</button>';

    document.getElementById('overlay').classList.add('show');
    document.getElementById('close-detail').addEventListener('click', closeDetail);
    document.getElementById('detail-book-btn').addEventListener('click', function(){
      closeDetail();
      confirmBooking(id, rider, type, price);
    });
  }

  function closeDetail(){
    document.getElementById('overlay').classList.remove('show');
  }

  document.getElementById('overlay').addEventListener('click', function(e){
    if(e.target.id === 'overlay') closeDetail();
  });

  // Creates a REAL booking row in Supabase and waits for the rider's own
  // app to accept it — this no longer instantly jumps to "on the way" like
  // the demo did, because in real life the rider has to say yes first.
  async function confirmBooking(id, rider, type, price){
    var btn = document.getElementById('book-btn');
    btn.disabled = true;
    try{
      var rows = await sbFetch('bookings', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          rider_id: rider.dbId,
          user_name: state.userName,
          pickup_lat: state.lat,
          pickup_lng: state.lng,
          pickup_label: state.pickup,
          drop_label: state.drop,
          vehicle_type: type,
          fare: price,
          status: 'requested'
        }
      });
      var row = Array.isArray(rows) ? rows[0] : rows;
      state.activeBookingId = row.id;
      state.activeRider = rider;
      state.activeType = type;
      state.activePrice = price;
      clearInterval(pollTimer);
      toast('Request sent to ' + rider.name);
      goToTracking(rider, type, price);
    } catch(err){
      toast('Could not send request: ' + err.message);
      btn.disabled = false;
    }
  }

  document.getElementById('book-btn').addEventListener('click', function(){
    var type = state.selectedRideType || 'bike';
    var id = nearestId(type);
    if(!id){
      document.getElementById('bonus-text').textContent = 'No ' + type + 's nearby right now. Try a different vehicle type, or check back shortly.';
      document.getElementById('bonus-banner').classList.add('show');
      return;
    }
    var rider = riderAssign[id];
    var price = currentPriceFor(type);
    confirmBooking(id, rider, type, price);
  });

  // ---------------- tracking screen ----------------

  function vehicleIconSvg(type, color){
    var col = color || '#16181c';
    var bodyMarkup = '';
    if(type === 'bike'){
      bodyMarkup =
        '<rect x="-6.5" y="20" width="13" height="22" rx="5" fill="#202225" transform="translate(0,-2)"/>' +
        '<rect x="-5" y="21.5" width="10" height="19" rx="4" fill="#3a3d42" transform="translate(0,-2)"/>' +
        '<rect x="-9" y="-4" width="18" height="28" rx="7" fill="'+col+'" transform="translate(0,-2)"/>' +
        '<ellipse cx="0" cy="-16" rx="8.5" ry="11" fill="'+col+'"/>' +
        '<ellipse cx="0" cy="-17" rx="5.5" ry="7" fill="rgba(255,255,255,0.25)"/>' +
        '<rect x="-13" y="-28" width="26" height="5.5" rx="2.5" fill="'+col+'"/>' +
        '<rect x="-1.6" y="-30" width="3.2" height="10" rx="1.4" fill="'+col+'"/>' +
        '<rect x="-6.5" y="-38" width="13" height="14" rx="4.5" fill="#202225"/>' +
        '<rect x="-5" y="-36.5" width="10" height="11" rx="3.5" fill="#3a3d42"/>';
    } else if(type === 'auto'){
      bodyMarkup =
        '<rect x="-15" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<rect x="4" y="14" width="11" height="16" rx="4" fill="#202225"/>' +
        '<path d="M-17 18 L-17 -10 A17 17 0 0117 -10 L17 18 Z" fill="'+col+'"/>' +
        '<rect x="-13" y="-6" width="26" height="20" rx="4" fill="rgba(255,255,255,0.25)"/>' +
        '<rect x="-3" y="-24" width="6" height="16" rx="2.5" fill="#202225"/>' +
        '<rect x="-15" y="-28" width="30" height="6" rx="3" fill="'+col+'"/>';
    } else {
      bodyMarkup =
        '<rect x="-19.5" y="-41" width="39" height="82" rx="11" fill="'+col+'"/>' +
        '<rect x="-15" y="-30" width="30" height="22" rx="5" fill="#aab4c2" opacity="0.85"/>' +
        '<rect x="-15" y="9" width="30" height="20" rx="5" fill="#aab4c2" opacity="0.85"/>' +
        '<rect x="-22.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<rect x="18.5" y="-14" width="4" height="11" rx="2" fill="#1c1e21"/>' +
        '<line x1="-19.5" y1="0" x2="19.5" y2="0" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/>';
    }
    return '<svg viewBox="-26 -46 52 92" xmlns="http://www.w3.org/2000/svg">'+bodyMarkup+'</svg>';
  }

  function vehicleLabelOf(type){
    return type === 'bike' ? 'Bike' : (type === 'auto' ? 'Auto' : 'Car');
  }

  function destroyMap() {
    if (state.map) {
      try {
        state.map.remove();
      } catch (e) { console.error('Error removing map:', e); }
      state.map = null;
      state.driverMarker = null;
      state.passengerMarker = null;
    }
  }

  function goToTracking(rider, type, price){
    state.currentRider = rider;
    state.currentType = type;
    state.currentFare = price;
    document.getElementById('track-avatar').textContent = rider.initials;
    document.getElementById('track-name').textContent = rider.name;
    document.getElementById('track-vehicle-info').textContent = rider.vehicleLabel + ' \u00b7 ' + rider.plate;
    document.getElementById('confirm-vehicle-icon').innerHTML = vehicleIconSvg(type, '#1d9e75');
    document.getElementById('tracking-sub').textContent = 'Waiting for ' + rider.name + ' to accept...';
    document.getElementById('track-step-2').textContent = 'Waiting for rider to accept';
    document.getElementById('tracking-pay-btn').textContent = 'Trip complete \u2014 done';
    document.getElementById('tracking-pay-btn').style.display = 'none';
    document.getElementById('cancel-trip-btn').style.display = 'block';
    document.getElementById('cancel-trip-btn').disabled = false;
    showScreen('screen-tracking');

    // Initialize Leaflet Map
    try {
      destroyMap();
      if (state.lat != null && state.lng != null) {
        state.map = L.map('map', {
          zoomControl: false,
          attributionControl: false
        }).setView([state.lat, state.lng], 15);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          maxZoom: 19
        }).addTo(state.map);

        var passengerIcon = L.divIcon({
          html: '<div style="background-color:#1d9e75; width:12px; height:12px; border-radius:50%; border:2px solid white; box-shadow:0 0 4px rgba(0,0,0,0.5);"></div>',
          className: 'custom-passenger-icon',
          iconSize: [12, 12],
          iconAnchor: [6, 6]
        });
        state.passengerMarker = L.marker([state.lat, state.lng], { icon: passengerIcon }).addTo(state.map);
        
        var driverIcon = L.divIcon({
          html: '<div style="background-color:#16181c; color:#fff; width:22px; height:22px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold; box-shadow:0 1px 4px rgba(0,0,0,0.4);">' + (type === 'bike' ? 'B' : (type === 'auto' ? 'A' : 'C')) + '</div>',
          className: 'custom-driver-icon',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });
        state.driverMarker = L.marker([state.lat, state.lng], { icon: driverIcon }).addTo(state.map);
        
        state.map.fitBounds(L.latLngBounds([[state.lat, state.lng]]));
      }
    } catch (err) {
      console.error('Failed to initialize Leaflet Map:', err);
    }

    startBookingStatusPoll();
  }

  function startBookingStatusPoll(){
    clearInterval(state.bookingPollTimer);
    pollBookingStatus();
    state.bookingPollTimer = setInterval(pollBookingStatus, 3000);
  }

  async function pollBookingStatus(){
    if(!state.activeBookingId) return;
    try{
      var rows = await sbFetch('bookings?id=eq.' + state.activeBookingId);
      var b = rows[0];
      if(!b) return;
      state.lastKnownStatus = b.status;
      var sub = document.getElementById('tracking-sub');
      var step2 = document.getElementById('track-step-2');
      var payBtn = document.getElementById('tracking-pay-btn');

      if(b.status === 'requested'){
        sub.textContent = 'Waiting for ' + state.currentRider.name + ' to accept...';
      } else if(b.status === 'accepted'){
        sub.textContent = state.currentRider.name + ' accepted \u2014 heading to ' + state.pickup;
        step2.textContent = 'Rider heading to ' + state.pickup;
        if(!state.exitAnimationPlayed){
          state.exitAnimationPlayed = true;
          var slotId = Object.keys(riderAssign).filter(function(k){ return riderAssign[k] && riderAssign[k].dbId === state.currentRider.dbId; })[0];
          if(slotId) removeVehicle(slotId, function(){});
        }
        
        // Fetch and update driver live position
        try {
          var riderRows = await sbFetch('riders?id=eq.' + state.currentRider.dbId);
          var r = riderRows[0];
          if (r && r.lat != null && r.lng != null && state.map && state.driverMarker) {
            state.driverMarker.setLatLng([r.lat, r.lng]);
            var bounds = L.latLngBounds([[state.lat, state.lng], [r.lat, r.lng]]);
            state.map.fitBounds(bounds, { padding: [30, 30] });
          }
        } catch (e) { console.error('Failed to update driver marker location', e); }

      } else if(b.status === 'arrived'){
        sub.textContent = state.currentRider.name + ' has arrived at ' + state.pickup;
        if (state.map && state.driverMarker) {
          state.driverMarker.setLatLng([state.lat, state.lng]);
        }
      } else if(b.status === 'in_progress'){
        sub.textContent = 'Trip in progress to ' + state.drop;
        payBtn.style.display = 'block';
        // Continue displaying live driver coordinates
        try {
          var riderRows = await sbFetch('riders?id=eq.' + state.currentRider.dbId);
          var r = riderRows[0];
          if (r && r.lat != null && r.lng != null && state.map && state.driverMarker) {
            state.driverMarker.setLatLng([r.lat, r.lng]);
            state.map.panTo([r.lat, r.lng]);
          }
        } catch (e) { console.error(e); }

      } else if(b.status === 'completed'){
        sub.textContent = 'Trip completed. Thanks for riding with Rydealot.';
        payBtn.style.display = 'block';
        document.getElementById('cancel-trip-btn').style.display = 'none';
        clearInterval(state.bookingPollTimer);
      } else if(b.status === 'cancelled'){
        sub.textContent = 'This request was cancelled or declined.';
        clearInterval(state.bookingPollTimer);
      }
    } catch(err){
      console.error('poll booking failed', err);
    }
  }

  document.getElementById('cancel-trip-btn').addEventListener('click', async function(){
    clearInterval(state.bookingPollTimer);
    destroyMap();
    if(!state.activeBookingId){
      showScreen('screen-login');
      return;
    }
    try{
      await sbFetch('bookings?id=eq.' + state.activeBookingId, { method: 'PATCH', body: { status: 'cancelled' } });
    } catch(err){ console.error(err); }
    var feeApplies = state.lastKnownStatus === 'arrived' || state.lastKnownStatus === 'in_progress';
    toast(feeApplies ? 'Trip cancelled. A cancellation fee of Rs 20 applies.' : 'Trip cancelled \u2014 no charge.');
    document.getElementById('cancel-trip-btn').style.display = 'none';
    state.activeBookingId = null;
    state.exitAnimationPlayed = false;
    state.trackAnimPlayed = false;
    showScreen('screen-lot');
    await resetLot();
  });

  document.getElementById('tracking-close').addEventListener('click', function(){
    clearInterval(state.bookingPollTimer);
    destroyMap();
    showScreen('screen-login');
  });

  document.getElementById('tracking-pay-btn').addEventListener('click', function(){
    clearInterval(state.bookingPollTimer);
    destroyMap();
    state.activeBookingId = null;
    state.exitAnimationPlayed = false;
    state.trackAnimPlayed = false;
    toast('Thanks for riding with Rydealot!');
    showScreen('screen-login');
  });

  // init: fill in the static ride-type icons right away; the lot itself
  // only loads real data once the user submits their name and location.
  document.getElementById('rt-icon-bike').innerHTML = vehicleIconSvg('bike', '#16181c');
  document.getElementById('rt-icon-auto').innerHTML = vehicleIconSvg('auto', '#16181c');
  document.getElementById('rt-icon-car').innerHTML = vehicleIconSvg('car', '#16181c');
})();

// ===================== PWA Installation & Service Worker Registration =====================
(function() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('./sw.js').then(function(reg) {
        console.log('ServiceWorker registration successful with scope: ', reg.scope);
      }, function(err) {
        console.error('ServiceWorker registration failed: ', err);
      });
    });
  }

  var deferredPrompt = null;
  var installButtons = document.querySelectorAll('.pwa-install-btn');

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    installButtons.forEach(function(btn) {
      btn.style.display = 'inline-block';
    });
  });

  installButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(choiceResult) {
        if (choiceResult.outcome === 'accepted') {
          console.log('User accepted the install prompt');
        } else {
          console.log('User dismissed the install prompt');
        }
        deferredPrompt = null;
        installButtons.forEach(function(b) {
          b.style.display = 'none';
        });
      });
    });
  });

  window.addEventListener('appinstalled', function(e) {
    console.log('App successfully installed on home screen');
    installButtons.forEach(function(b) {
      b.style.display = 'none';
    });
  });
})();
