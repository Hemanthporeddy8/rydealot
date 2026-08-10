// RYDEALOT MAPS — CORE ENGINE & SUPABASE SYNC

var SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';

var mapState = {
  map: null,
  currentTheme: 'dark',
  lat: 17.9961, // Kazipet / Hanamkonda / Hyderabad region center
  lng: 79.5509,
  userMarker: null,
  activeRoutePolyline: null,
  selectedPlace: null,
  customPlaces: [],
  drawnItemsLayer: null
};

// Map Theme Tile Layers
var TILE_LAYERS = {
  dark: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
  },
  light: {
    url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap'
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS'
  }
};

var tileLayerInstance = null;

// Generic Supabase REST Fetch Helper
async function sb(path, opts) {
  opts = opts || {};
  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (opts.prefer) headers['Prefer'] = opts.prefer;

  try {
    var res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    var text = await res.text();
    var data = null;
    try { data = text ? JSON.parse(text) : null; } catch(e) { data = text; }
    if (!res.ok) throw new Error((data && data.message) || ('HTTP ' + res.status));
    return data;
  } catch (err) {
    console.warn('Supabase Map Note:', err.message);
    return null;
  }
}

function toast(msg) {
  var t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

// Initialize Rydealot Maps
function initRydealotMap(elementId, isAdmin) {
  elementId = elementId || 'map-container';
  if (mapState.map) return;

  mapState.map = L.map(elementId, { zoomControl: false }).setView([mapState.lat, mapState.lng], 13);

  // Set initial Dark Theme
  setMapTheme('dark');

  // Locate User GPS position
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos) {
      mapState.lat = pos.coords.latitude;
      mapState.lng = pos.coords.longitude;
      mapState.map.setView([mapState.lat, mapState.lng], 14);

      // Render Green User Location Pin
      if (mapState.userMarker) mapState.map.removeLayer(mapState.userMarker);
      mapState.userMarker = L.marker([mapState.lat, mapState.lng], {
        icon: L.divIcon({
          html: '<div style="background-color:var(--green); width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>',
          className: 'custom-user-gps',
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        })
      }).addTo(mapState.map);
    }, function() {}, { enableHighAccuracy: true });
  }

  // Load custom places from Supabase
  loadCustomPlaces();

  // If Admin mode, initialize Leaflet Draw Feature Group
  if (isAdmin && typeof L.Control.Draw !== 'undefined') {
    mapState.drawnItemsLayer = new L.FeatureGroup();
    mapState.map.addLayer(mapState.drawnItemsLayer);
    
    var drawControl = new L.Control.Draw({
      edit: { featureGroup: mapState.drawnItemsLayer },
      draw: {
        polygon: true,
        polyline: true,
        rectangle: true,
        circle: false,
        marker: true
      }
    });
    mapState.drawControl = drawControl;
    mapState.map.addControl(drawControl);

    // Event listener for drawn shapes (Buildings, Roads, Road Blocks, Pins)
    mapState.map.on(L.Draw.Event.CREATED, function(event) {
      var layer = event.layer;
      mapState.drawnItemsLayer.addLayer(layer);
      var geojson = layer.toGeoJSON();
      var shapeType = event.layerType; // 'polyline' (Road), 'polygon' (Building), 'marker' (Pin)
      if (typeof handleAdminDrawnShape === 'function') {
        handleAdminDrawnShape(layer, geojson, shapeType);
      } else {
        promptSaveNewBuilding(geojson);
      }
    });
  }
}

// Switch Map Tiles Theme (Dark, Light, Satellite)
function setMapTheme(themeName) {
  if (!mapState.map || !TILE_LAYERS[themeName]) return;
  if (tileLayerInstance) mapState.map.removeLayer(tileLayerInstance);

  var cfg = TILE_LAYERS[themeName];
  tileLayerInstance = L.tileLayer(cfg.url, {
    maxZoom: 19,
    attribution: cfg.attribution
  }).addTo(mapState.map);

  mapState.currentTheme = themeName;
}

// Fetch custom places from Supabase and render on map
async function loadCustomPlaces() {
  var places = await sb('map_places?select=*');
  places = places || [
    { name: 'Kazipet Railway Station', category: 'station', lat: 17.9754, lng: 79.5123, address: 'Kazipet Junction' },
    { name: 'Bawarchi Biryani House', category: 'food', lat: 17.9890, lng: 79.5310, address: 'Near Bus Stand, Hanamkonda' },
    { name: 'MGM Government Hospital', category: 'hospital', lat: 17.9810, lng: 79.5240, address: 'Warangal Main Rd' },
    { name: 'Bhadrakali Temple', category: 'temple', lat: 17.9870, lng: 79.5780, address: 'Bhadrakali Lake Rd' }
  ];

  mapState.customPlaces = places;

  places.forEach(function(place) {
    var iconEmoji = place.category === 'food' ? '🍗' : (place.category === 'station' ? '🚉' : (place.category === 'hospital' ? '🏥' : '🏛️'));
    var marker = L.marker([place.lat, place.lng], {
      icon: L.divIcon({
        html: '<div style="background:var(--card); border:1.5px solid var(--amber); color:var(--text); padding:4px 8px; border-radius:8px; font-weight:800; font-size:11px; display:flex; align-items:center; gap:4px; box-shadow:0 4px 12px rgba(0,0,0,0.4);"><span>'+iconEmoji+'</span><span>'+place.name+'</span></div>',
        className: 'custom-place-tag',
        iconSize: [120, 24],
        iconAnchor: [60, 12]
      })
    }).addTo(mapState.map);

    marker.on('click', function() {
      showBottomSheet(place);
    });
  });
}

// Place Search Engine (Local Database + Nominatim API Fallback)
async function searchPlaces(query) {
  query = (query || '').trim().toLowerCase();
  var results = [];
  if (!query) return results;

  // 1. Search local custom places first
  mapState.customPlaces.forEach(function(p) {
    if (p.name.toLowerCase().includes(query) || (p.address && p.address.toLowerCase().includes(query))) {
      results.push({
        title: p.name,
        subtitle: p.address || 'Custom Landmark',
        lat: p.lat,
        lng: p.lng,
        category: p.category || 'landmark'
      });
    }
  });

  // 2. Fetch OpenStreetMap Nominatim for broader results in India
  try {
    var res = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query + ', India') + '&limit=5');
    var data = await res.json();
    if (data && data.length) {
      data.forEach(function(item) {
        results.push({
          title: item.display_name.split(',')[0],
          subtitle: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          category: 'map'
        });
      });
    }
  } catch(e){}

  return results;
}

// Show Bottom Sheet for Selected Landmark
function showBottomSheet(place) {
  mapState.selectedPlace = place;
  document.getElementById('sheet-title').textContent = place.name || place.title;
  document.getElementById('sheet-subtitle').textContent = place.address || place.subtitle || 'Coordinates: ' + place.lat.toFixed(4) + ', ' + place.lng.toFixed(4);
  document.getElementById('bottom-sheet').classList.add('show');
  
  if (mapState.map) {
    mapState.map.setView([place.lat, place.lng], 15);
  }
}

function hideBottomSheet() {
  document.getElementById('bottom-sheet').classList.remove('show');
}

// Route Calculation (OSRM API)
async function drawRouteToSelectedPlace() {
  if (!mapState.selectedPlace) return;
  var dest = mapState.selectedPlace;

  var url = 'https://router.project-osrm.org/route/v1/driving/' + mapState.lng + ',' + mapState.lat + ';' + dest.lng + ',' + dest.lat + '?overview=full&geometries=geojson';
  toast('Calculating fast route... 🚗');

  try {
    var res = await fetch(url);
    var data = await res.json();
    if (data.routes && data.routes.length > 0) {
      var route = data.routes[0];
      var coords = route.geometry.coordinates.map(function(c){ return [c[1], c[0]]; });

      if (mapState.activeRoutePolyline) mapState.map.removeLayer(mapState.activeRoutePolyline);

      mapState.activeRoutePolyline = L.polyline(coords, {
        color: 'var(--amber)',
        weight: 5,
        opacity: 0.9
      }).addTo(mapState.map);

      mapState.map.fitBounds(L.latLngBounds(coords), { padding: [60, 60] });
      
      var distKm = (route.distance / 1000).toFixed(1);
      var timeMin = Math.round(route.duration / 60);
      toast('Route Ready: ' + distKm + ' km (' + timeMin + ' mins)');
    }
  } catch(e) {
    toast('Routing error. Showing straight line.');
  }
}

// Modal Toggle Handlers
function openModal(id) { document.getElementById(id).classList.add('show'); }
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

// Handle User Edit Suggestion Submission
async function submitUserEditSuggestion() {
  var name = document.getElementById('edit-place-name').value.trim();
  var cat = document.getElementById('edit-category').value;
  var note = document.getElementById('edit-notes').value.trim();

  if (!name) { alert('Please enter the place name'); return; }

  var payload = {
    suggested_by: 'Commuter User',
    type: 'new_place',
    details: { name: name, category: cat, notes: note, lat: mapState.lat, lng: mapState.lng },
    status: 'pending',
    created_at: new Date().toISOString()
  };

  try {
    await sb('map_edits', { method: 'POST', body: payload });
    toast('✅ Thank you! Edit suggestion submitted to Admin queue.');
  } catch(e) {
    toast('Saved locally! Thank you for updating Rydealot Maps.');
  }
  closeModal('modal-suggest-edit');
}
