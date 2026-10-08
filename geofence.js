// ============================================================================
// RYDEALOT GEOFENCING & OPERATIONAL SERVICE RADIUS ENGINE
// ============================================================================

(function(window) {
  'use strict';

  var STORAGE_KEY = 'rydealot_geofence_config';

  var DEFAULT_CONFIG = {
    masterEnabled: false, // Default OFF for smooth simulation & testing
    hub: {
      enabled: false,
      name: 'Hyderabad Metropolitan Area',
      lat: 17.3850,
      lng: 78.4867,
      radiusKm: 40
    },
    sage: {
      enabled: false,
      maxDistanceKm: 18
    },
    rides: {
      enabled: false,
      maxDistanceKm: 25
    },
    cargo: {
      enabled: false,
      maxDistanceKm: 250
    }
  };

  // Cross-tab real-time listener via storage events
  window.addEventListener('storage', function(e) {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        var updated = JSON.parse(e.newValue);
        window.dispatchEvent(new CustomEvent('rydealot_geofence_updated', { detail: updated }));
      } catch(err) {}
    }
  });

  // Cross-tab BroadcastChannel listener
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      var bcListener = new BroadcastChannel('rydealot_geofence_channel');
      bcListener.onmessage = function(ev) {
        if (ev.data) {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(ev.data));
            window.dispatchEvent(new CustomEvent('rydealot_geofence_updated', { detail: ev.data }));
          } catch(e) {}
        }
      };
    }
  } catch(e) {}

  // Haversine formula (Distance in KM between two GPS coordinates)
  function haversineKm(lat1, lon1, lat2, lon2) {
    if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
    var R = 6371; // Earth radius in KM
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }

  // Load config from localStorage with defaults fallback
  function getConfig() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        return {
          masterEnabled: typeof parsed.masterEnabled === 'boolean' ? parsed.masterEnabled : DEFAULT_CONFIG.masterEnabled,
          hub: Object.assign({}, DEFAULT_CONFIG.hub, parsed.hub || {}),
          sage: Object.assign({}, DEFAULT_CONFIG.sage, parsed.sage || {}),
          rides: Object.assign({}, DEFAULT_CONFIG.rides, parsed.rides || {}),
          cargo: Object.assign({}, DEFAULT_CONFIG.cargo, parsed.cargo || {})
        };
      }
    } catch (e) {
      console.warn('[Geofence] Could not read local config:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  }

  // Save config to localStorage and broadcast across tabs
  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      window.dispatchEvent(new CustomEvent('rydealot_geofence_updated', { detail: cfg }));
      try {
        if (typeof BroadcastChannel !== 'undefined') {
          var bc = new BroadcastChannel('rydealot_geofence_channel');
          bc.postMessage(cfg);
          bc.close();
        }
      } catch(e) {}
      return true;
    } catch (e) {
      console.error('[Geofence] Error saving config:', e);
      return false;
    }
  }

  // Validate a trip for a given service ('sage', 'rides', 'cargo')
  function validateTrip(serviceType, pickupCoords, dropCoords, actualDistanceKm) {
    var cfg = getConfig();

    // 1. Master Bypass: If Master Geofence is OFF, allow all bookings without restriction (Testing Mode)
    if (!cfg.masterEnabled) {
      return { allowed: true, reason: null, distanceKm: actualDistanceKm || 0 };
    }

    // 2. Specific Service Toggle Check
    var svcConfig = cfg[serviceType];
    if (!svcConfig || !svcConfig.enabled) {
      return { allowed: true, reason: null, distanceKm: actualDistanceKm || 0 };
    }

    var distKm = actualDistanceKm;
    if ((distKm == null || distKm <= 0) && pickupCoords && dropCoords) {
      distKm = haversineKm(pickupCoords.lat, pickupCoords.lng, dropCoords.lat, dropCoords.lng);
    }
    distKm = distKm || 0;

    // 3. Operational City Hub Check
    if (cfg.hub && cfg.hub.enabled && pickupCoords && pickupCoords.lat && pickupCoords.lng) {
      var distToHub = haversineKm(cfg.hub.lat, cfg.hub.lng, pickupCoords.lat, pickupCoords.lng);
      if (distToHub > cfg.hub.radiusKm) {
        return {
          allowed: false,
          reason: 'OUTSIDE_HUB',
          hubName: cfg.hub.name || 'Operating Hub',
          distToHub: distToHub,
          maxHubRadius: cfg.hub.radiusKm,
          distanceKm: distKm,
          message: 'Rydealot is currently live within ' + (cfg.hub.name || 'our launch zone') + ' (' + cfg.hub.radiusKm + ' km radius). Expanding to your location soon!'
        };
      }
    }

    // 4. Maximum Trip Distance Cap
    var maxAllowed = svcConfig.maxDistanceKm || 20;
    if (distKm > maxAllowed) {
      var crossSellService = (serviceType === 'sage' || serviceType === 'rides') ? 'cargo' : null;
      var serviceName = (serviceType === 'sage') ? 'Sage Parcels' : (serviceType === 'rides') ? 'Bike Taxi' : 'Along With Cargo';

      return {
        allowed: false,
        reason: 'DISTANCE_EXCEEDED',
        serviceType: serviceType,
        serviceName: serviceName,
        distanceKm: distKm,
        maxAllowedKm: maxAllowed,
        crossSell: crossSellService,
        message: serviceName + ' is limited to ' + maxAllowed + ' km intra-city routes (your trip is ' + distKm + ' km).' +
                 (crossSellService ? ' For longer distances, book Along With Cargo!' : '')
      };
    }

    // Trip is within limits
    return {
      allowed: true,
      reason: null,
      distanceKm: distKm,
      maxAllowedKm: maxAllowed
    };
  }

  // Display a friendly warning modal when a trip is outside the geofence
  function showGeofenceModal(result) {
    if (!result || result.allowed) return;

    var existingModal = document.getElementById('geofence-warning-modal');
    if (existingModal) existingModal.remove();

    var modal = document.createElement('div');
    modal.id = 'geofence-warning-modal';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.7); backdrop-filter:blur(6px); z-index:999999; display:flex; align-items:center; justify-content:center; padding:18px; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; animation:fadeIn 0.2s ease;';

    var isDistance = (result.reason === 'DISTANCE_EXCEEDED');
    var icon = isDistance ? '📏' : '📍';
    var title = isDistance ? 'Service Radius Limit' : 'Outside Service Zone';
    var crossSellBtn = '';

    if (result.crossSell === 'cargo') {
      var crossSellLabel = (result.serviceType === 'rides') 
        ? '🚚 Need Inter-District Freight? Try Along With Cargo →'
        : '🚚 Book Along With Cargo Truck (Up to 250 km) →';
      crossSellBtn = '<a href="alongwith.html" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:13px; background:linear-gradient(135deg, #f59e0b, #d97706); color:#000; font-weight:800; font-size:13px; border-radius:12px; text-decoration:none; margin-bottom:10px; box-shadow:0 4px 14px rgba(245,158,11,0.3);">' +
                     '<span>🚚</span> <span>' + crossSellLabel + '</span></a>';
    }

    modal.innerHTML = 
      '<div style="background:#fff; border-radius:22px; max-width:390px; width:100%; padding:24px 20px 20px; text-align:center; box-shadow:0 24px 50px rgba(0,0,0,0.25);">' +
        '<div style="width:58px; height:58px; margin:0 auto 14px; border-radius:50%; background:#FEF3C7; border:2px solid #FDE68A; display:flex; align-items:center; justify-content:center; font-size:28px;">' + icon + '</div>' +
        '<h3 style="font-size:18px; font-weight:900; color:#0F172A; margin:0 0 8px; line-height:1.2;">' + title + '</h3>' +
        '<p style="font-size:13px; color:#64748B; line-height:1.5; margin:0 0 16px;">' + result.message + '</p>' +
        (isDistance ? 
          '<div style="background:#F8FAFC; border:1px solid #E2E8F0; border-radius:12px; padding:10px 14px; margin-bottom:18px; display:flex; justify-content:space-around; font-size:12px;">' +
            '<div><span style="color:#64748B; display:block; font-size:10.5px;">Trip Distance</span><strong style="color:#EF4444; font-size:14px;">' + result.distanceKm + ' km</strong></div>' +
            '<div style="border-right:1px solid #E2E8F0;"></div>' +
            '<div><span style="color:#64748B; display:block; font-size:10.5px;">Max Allowed</span><strong style="color:#10B981; font-size:14px;">' + result.maxAllowedKm + ' km</strong></div>' +
          '</div>' : '') +
        crossSellBtn +
        '<button type="button" id="btn-close-geofence-modal" style="width:100%; padding:12px; background:#F1F5F9; color:#475569; border:none; border-radius:12px; font-weight:700; font-size:13px; cursor:pointer;">' +
          (isDistance ? '✕ Adjust Drop Location' : '✕ Adjust Pickup Location') +
        '</button>' +
      '</div>';

    document.body.appendChild(modal);

    document.getElementById('btn-close-geofence-modal').onclick = function() {
      modal.remove();
    };

    modal.onclick = function(e) {
      if (e.target === modal) modal.remove();
    };
  }

  // Public API
  window.RydealotGeofence = {
    haversineKm: haversineKm,
    getConfig: getConfig,
    saveConfig: saveConfig,
    validateTrip: validateTrip,
    showGeofenceModal: showGeofenceModal
  };

})(window);
