// ============================================================================
// RYDEALOT CAPTAIN ENGINE: ZERO-DISK IN-MEMORY LIVE GPS STREAMER (v2.0)
// 100% Cloudflare Edge RAM + WebSocket Pipeline • Zero Firebase • Zero D1 Writes
// Ready for Standalone Captain App Extraction (Account 3 / Standalone Fleet)
// ============================================================================

(function(window) {
  'use strict';

  // Master Configuration (Easily switchable for standalone Captain App extraction)
  var CONFIG = {
    // 1. Cloudflare Edge RAM Gateway (Sub-20ms memory broadcast, 0 D1 writes)
    edgeApiUrl: 'https://rydealot-api.rydealotoffical.workers.dev',
    edgeWsUrl: 'wss://rydealot-api.rydealotoffical.workers.dev',

    // 2. Telemetry Dynamics & Battery Safeguards
    minDistanceMeters: 2.0,            // Filter out stationary GPS drift/jitter
    minMovingIntervalMs: 1200,         // High-rate streaming (1.2s) when cruising > 5 km/h
    idleStationaryIntervalMs: 25000,   // 25s keepalive ping when parked/waiting
    maxAccuracyMeters: 65,             // Reject inaccurate cell-tower jumps > 65m
    enableHighAccuracy: true
  };

  // State Management
  var state = {
    isOnline: false,
    riderId: null,
    profile: {
      name: 'Captain',
      phone: '',
      vehicle_type: 'bike',
      vehicle_label: 'Bike Taxi',
      plate: ''
    },
    currentPosition: null,       // { lat, lng, heading, speed, accuracy, timestamp }
    lastBroadcastPos: null,      // { lat, lng, timestamp }
    lastBroadcastTime: 0,
    activeBooking: null,         // { id: '...', status: 'accepted'|'arrived'|'in_progress' }
    tripBreadcrumbs: [],         // [[lat, lng, timestamp], ...] in-memory route polyline buffer
    watchId: null,
    heartbeatTimer: null,
    wsClient: null,
    unloadHookAttached: false,
    locationCallbacks: []
  };

  // ==================== 1. MATHEMATICAL GEODESY HELPERS ====================

  // Calculate distance in meters using the Haversine formula
  function haversineMeters(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 999999;
    var R = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Calculate bearing (heading in degrees 0-360) between two points
  function calculateBearing(lat1, lon1, lat2, lon2) {
    var φ1 = lat1 * Math.PI / 180;
    var φ2 = lat2 * Math.PI / 180;
    var Δλ = (lon2 - lon1) * Math.PI / 180;
    var y = Math.sin(Δλ) * Math.cos(φ2);
    var x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
    var θ = Math.atan2(y, x);
    return Math.round((θ * 180 / Math.PI + 360) % 360);
  }

  // Google Encoded Polyline Algorithm (Compacts thousands of GPS points into ~1KB string)
  function encodePolyline(coords) {
    if (!coords || !coords.length) return '';
    var result = '';
    var prevLat = 0;
    var prevLng = 0;
    function encodeNum(num) {
      num = num < 0 ? ~(num << 1) : (num << 1);
      var str = '';
      while (num >= 0x20) {
        str += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
        num >>= 5;
      }
      str += String.fromCharCode(num + 63);
      return str;
    }
    for (var i = 0; i < coords.length; i++) {
      var lat = Math.round(coords[i][0] * 1e5);
      var lng = Math.round(coords[i][1] * 1e5);
      result += encodeNum(lat - prevLat) + encodeNum(lng - prevLng);
      prevLat = lat;
      prevLng = lng;
    }
    return result;
  }

  // ==================== 2. CLOUDFLARE EDGE PRESENCE BEACON ====================
  // Replaces Firebase onDisconnect() using native browser sendBeacon -> Edge RAM
  function setupEdgeUnloadBeacon() {
    if (state.unloadHookAttached) return;
    state.unloadHookAttached = true;

    var sendOfflineBeacon = function() {
      if (!state.isOnline || !state.riderId) return;
      try {
        var payload = JSON.stringify({
          riderId: state.riderId,
          status: 'offline',
          offline: true
        });
        if (navigator.sendBeacon) {
          var blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon(CONFIG.edgeApiUrl + '/api/track/update', blob);
        } else {
          fetch(CONFIG.edgeApiUrl + '/api/track/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true
          }).catch(function(){});
        }
      } catch(e){}
    };

    window.addEventListener('pagehide', sendOfflineBeacon);
    window.addEventListener('beforeunload', sendOfflineBeacon);
  }

  // ==================== 3. CLOUDFLARE EDGE WEBSOCKET ENGINE ====================
  function connectEdgeWebSocket(bookingId) {
    if (!CONFIG.edgeWsUrl || !bookingId) return;
    try {
      if (state.wsClient && state.wsClient.readyState === WebSocket.OPEN) {
        return;
      }
      if (state.wsClient) {
        try { state.wsClient.close(); } catch(e){}
        state.wsClient = null;
      }

      var wsUrl = CONFIG.edgeWsUrl + '/api/track/ws?bookingId=' + encodeURIComponent(bookingId);
      state.wsClient = new WebSocket(wsUrl);

      state.wsClient.onopen = function() {
        console.log('[DriverTracker] Connected to Cloudflare Edge WebSocket for trip:', bookingId);
      };

      state.wsClient.onerror = function() {
        // Transparent fallback to HTTP keepalive POST
      };

      state.wsClient.onclose = function() {
        state.wsClient = null;
      };
    } catch(err) {
      // HTTP keepalive POST takes over seamlessly
    }
  }

  function disconnectEdgeWebSocket() {
    if (state.wsClient) {
      try {
        state.wsClient.close(1000, 'Trip finished');
      } catch(e){}
      state.wsClient = null;
    }
  }

  // ==================== 4. ZERO-DISK IN-MEMORY BROADCASTER ====================
  // Broadcasts coordinates strictly in Cloudflare Edge RAM. ZERO SQL/D1 disk writes!
  async function broadcastLocation(posData) {
    if (!state.isOnline || !state.riderId) return;

    var now = Date.now();
    state.lastBroadcastPos = { lat: posData.lat, lng: posData.lng, timestamp: now };
    state.lastBroadcastTime = now;

    // A. TRIP IN PROGRESS (Rides, Sage Parcel, Amorelot Orders)
    if (state.activeBooking && state.activeBooking.id) {
      var bId = String(state.activeBooking.id);
      var tripPayload = {
        bookingId: bId,
        riderId: state.riderId,
        lat: Number(posData.lat.toFixed(6)),
        lng: Number(posData.lng.toFixed(6)),
        heading: Math.round(posData.heading || 0),
        speed: Math.round(posData.speed || 0),
        accuracy: Math.round(posData.accuracy || 0),
        timestamp: now
      };

      // 1. Try Edge WebSocket first (instant sub-50ms push to passenger screen)
      var wsSent = false;
      if (state.wsClient && state.wsClient.readyState === WebSocket.OPEN) {
        try {
          state.wsClient.send(JSON.stringify({ type: 'location', data: tripPayload }));
          wsSent = true;
        } catch(e) { wsSent = false; }
      }

      // 2. Send to Edge RAM Gateway via HTTP keepalive POST
      if (!wsSent) {
        fetch(CONFIG.edgeApiUrl + '/api/track/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tripPayload),
          keepalive: true
        }).catch(function(){});
      }
      return;
    }

    // B. DRIVER IDLE & CRUISING (WAITING FOR REQUESTS)
    // Makes the driver instantly discoverable on passenger map with 0 D1 reads/writes!
    var idlePayload = {
      riderId: state.riderId,
      name: state.profile.name,
      phone: state.profile.phone,
      vehicle_type: state.profile.vehicle_type,
      vehicle_label: state.profile.vehicle_label,
      plate: state.profile.plate,
      status: 'available',
      lat: Number(posData.lat.toFixed(6)),
      lng: Number(posData.lng.toFixed(6)),
      heading: Math.round(posData.heading || 0),
      speed: Math.round(posData.speed || 0),
      accuracy: Math.round(posData.accuracy || 0),
      heartbeat: true
    };

    fetch(CONFIG.edgeApiUrl + '/api/track/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idlePayload),
      keepalive: true
    }).catch(function(){});
  }

  // ==================== 5. POSITION PIPELINE & MOVEMENT FILTER ====================
  function onPositionReceived(pos) {
    if (!pos || !pos.coords) return;
    var coords = pos.coords;
    var lat = coords.latitude;
    var lng = coords.longitude;
    var rawAccuracy = coords.accuracy || 10;
    var rawSpeed = coords.speed;
    var rawHeading = coords.heading;

    // Filter out aberrant cell-tower jumps
    if (rawAccuracy > CONFIG.maxAccuracyMeters && state.currentPosition != null) {
      return;
    }

    var now = Date.now();
    var distMoved = 0;
    var timeDeltaSec = 1;

    if (state.currentPosition) {
      distMoved = haversineMeters(state.currentPosition.lat, state.currentPosition.lng, lat, lng);
      timeDeltaSec = Math.max(0.5, (now - state.currentPosition.timestamp) / 1000);
    }

    // Smooth speed calculation (convert m/s to km/h)
    var speedKmH = 0;
    if (rawSpeed != null && !isNaN(rawSpeed) && rawSpeed >= 0) {
      speedKmH = Math.round(rawSpeed * 3.6);
    } else if (distMoved > 0 && timeDeltaSec > 0) {
      speedKmH = Math.round((distMoved / timeDeltaSec) * 3.6);
    }

    // Heading calculation: If device lacks compass or is in motion, compute bearing
    var headingDeg = 0;
    if (rawHeading != null && !isNaN(rawHeading) && rawHeading > 0) {
      headingDeg = Math.round(rawHeading);
    } else if (state.currentPosition && distMoved >= 2.5) {
      headingDeg = calculateBearing(state.currentPosition.lat, state.currentPosition.lng, lat, lng);
    } else if (state.currentPosition) {
      headingDeg = state.currentPosition.heading || 0;
    }

    state.currentPosition = {
      lat: lat,
      lng: lng,
      heading: headingDeg,
      speed: speedKmH,
      accuracy: rawAccuracy,
      timestamp: now
    };

    // If active trip is in progress, accumulate breadcrumb into RAM buffer (0 disk writes!)
    if (state.activeBooking && state.activeBooking.status === 'in_progress') {
      state.tripBreadcrumbs.push([Number(lat.toFixed(6)), Number(lng.toFixed(6)), now]);
    }

    updateUI(state.currentPosition);

    for (var i = 0; i < state.locationCallbacks.length; i++) {
      try { state.locationCallbacks[i](state.currentPosition); } catch(e){}
    }

    // Movement-Adaptive Broadcast Throttling
    var isMoving = speedKmH > 4 || distMoved >= CONFIG.minDistanceMeters;
    var timeSinceLast = now - state.lastBroadcastTime;

    if (isMoving && timeSinceLast >= CONFIG.minMovingIntervalMs) {
      broadcastLocation(state.currentPosition);
    } else if (!isMoving && timeSinceLast >= CONFIG.idleStationaryIntervalMs) {
      broadcastLocation(state.currentPosition);
    }
  }

  function onPositionError(err) {
    console.warn('[DriverTracker] Geolocation error:', err.message, 'code:', err.code);
    var displayEl = document.getElementById('rd-display-location');
    if (err.code === 1) {
      if (displayEl) displayEl.textContent = '❌ Location blocked. Allow site location permission.';
      updateTelemetryHud('blocked', 0, 0);
    } else {
      if (displayEl) displayEl.textContent = '📡 Acquiring GPS lock...';
      updateTelemetryHud('searching', 0, 0);
    }
  }

  // ==================== 6. TELEMETRY HUD UI UPDATES ====================
  function updateUI(posData) {
    var displayEl = document.getElementById('rd-display-location');
    if (displayEl) {
      displayEl.textContent = posData.lat.toFixed(4) + ', ' + posData.lng.toFixed(4);
    }
    updateTelemetryHud('streaming', posData.speed, posData.accuracy);
  }

  function updateTelemetryHud(status, speedKmH, accuracyM) {
    var hud = document.getElementById('rd-gps-telemetry-hud');
    var dot = document.getElementById('rd-gps-pulse-dot');
    var modeTag = document.getElementById('rd-gps-mode-tag');
    var speedEl = document.getElementById('rd-gps-speed-hud');
    var accEl = document.getElementById('rd-gps-accuracy-hud');

    if (!hud) return;

    if (!state.isOnline) {
      hud.style.display = 'none';
      return;
    }

    hud.style.display = 'flex';

    if (status === 'streaming') {
      if (dot) {
        dot.style.background = '#10b981';
        dot.style.boxShadow = '0 0 8px rgba(16,185,129,0.7)';
      }
      if (modeTag) {
        modeTag.textContent = state.activeBooking ? '⚡ Cloudflare Trip Stream (0 Writes)' : '⚡ Zero-Disk Edge RAM Active';
        modeTag.style.color = '#059669';
      }
      if (speedEl) speedEl.textContent = (speedKmH || 0) + ' km/h';
      if (accEl) accEl.textContent = '±' + Math.round(accuracyM || 0) + 'm';
    } else if (status === 'searching') {
      if (dot) {
        dot.style.background = '#f59e0b';
        dot.style.boxShadow = '0 0 8px rgba(245,158,11,0.7)';
      }
      if (modeTag) {
        modeTag.textContent = '📡 Acquiring Satellites...';
        modeTag.style.color = '#d97706';
      }
    } else if (status === 'blocked') {
      if (dot) {
        dot.style.background = '#ef4444';
        dot.style.boxShadow = 'none';
      }
      if (modeTag) {
        modeTag.textContent = '❌ GPS Access Blocked';
        modeTag.style.color = '#dc2626';
      }
    }
  }

  // ==================== 7. PUBLIC DRIVERTRACKER API ====================
  var DriverTracker = {
    init: function(customConfig) {
      if (customConfig && typeof customConfig === 'object') {
        Object.assign(CONFIG, customConfig);
      }
      setupEdgeUnloadBeacon();
      return this;
    },

    start: function(riderId, driverProfile) {
      if (!riderId) {
        console.error('[DriverTracker] Cannot start tracking without riderId');
        return false;
      }

      state.isOnline = true;
      state.riderId = String(riderId);
      if (driverProfile) {
        state.profile = Object.assign(state.profile, driverProfile);
      }

      setupEdgeUnloadBeacon();

      if (navigator.geolocation) {
        if (state.watchId) navigator.geolocation.clearWatch(state.watchId);
        state.watchId = navigator.geolocation.watchPosition(
          onPositionReceived,
          onPositionError,
          {
            enableHighAccuracy: CONFIG.enableHighAccuracy,
            maximumAge: 3000,
            timeout: 12000
          }
        );
      }

      // Background stationary keepalive timer (fires every 25s if stationary)
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = setInterval(function() {
        if (state.isOnline && state.currentPosition) {
          var timeSinceLast = Date.now() - state.lastBroadcastTime;
          if (timeSinceLast >= CONFIG.idleStationaryIntervalMs) {
            broadcastLocation(state.currentPosition);
          }
        }
      }, 10000);

      if (state.currentPosition) {
        broadcastLocation(state.currentPosition);
      }

      updateTelemetryHud('searching', 0, 0);
      return true;
    },

    stop: function() {
      state.isOnline = false;

      if (state.watchId) {
        navigator.geolocation.clearWatch(state.watchId);
        state.watchId = null;
      }
      clearInterval(state.heartbeatTimer);
      state.heartbeatTimer = null;

      disconnectEdgeWebSocket();

      // Cleanly remove from Edge RAM (Zero D1 writes!)
      if (state.riderId) {
        fetch(CONFIG.edgeApiUrl + '/api/track/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ riderId: state.riderId, status: 'offline', offline: true }),
          keepalive: true
        }).catch(function(){});
      }

      var displayEl = document.getElementById('rd-display-location');
      if (displayEl) displayEl.textContent = 'Not sharing';

      updateTelemetryHud('offline', 0, 0);
    },

    setActiveBooking: function(bookingId, status) {
      if (!bookingId) return;
      state.activeBooking = { id: String(bookingId), status: status || 'accepted' };

      if (status === 'in_progress') {
        state.tripBreadcrumbs = [];
        if (state.currentPosition) {
          state.tripBreadcrumbs.push([
            Number(state.currentPosition.lat.toFixed(6)),
            Number(state.currentPosition.lng.toFixed(6)),
            Date.now()
          ]);
        }
      }

      connectEdgeWebSocket(bookingId);

      if (state.currentPosition) {
        broadcastLocation(state.currentPosition);
      }
    },

    clearActiveBooking: function() {
      if (state.activeBooking && state.activeBooking.id) {
        var bId = String(state.activeBooking.id);

        fetch(CONFIG.edgeApiUrl + '/api/track/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: bId, ended: true, status: 'completed' }),
          keepalive: true
        }).catch(function(){});

        disconnectEdgeWebSocket();
      }

      state.activeBooking = null;
    },

    getBreadcrumbs: function() {
      return state.tripBreadcrumbs.slice();
    },

    getEncodedPolyline: function() {
      if (!state.tripBreadcrumbs || !state.tripBreadcrumbs.length) return '';
      return encodePolyline(state.tripBreadcrumbs);
    },

    clearBreadcrumbs: function() {
      state.tripBreadcrumbs = [];
    },

    getCurrentPosition: function() {
      return state.currentPosition ? Object.assign({}, state.currentPosition) : null;
    },

    isOnline: function() {
      return state.isOnline;
    },

    onLocation: function(callback) {
      if (typeof callback === 'function') {
        state.locationCallbacks.push(callback);
      }
    },

    setProfile: function(profile) {
      if (profile && typeof profile === 'object') {
        state.profile = Object.assign(state.profile, profile);
      }
    }
  };

  window.DriverTracker = DriverTracker;

})(typeof window !== 'undefined' ? window : this);
