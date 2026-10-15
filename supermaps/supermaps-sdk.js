/**
 * =========================================================================
 * RYDEALOT SUPERMAPS CLIENT SDK (v1.0.0)
 * Ultra-Lightweight (~5 KB) Map, Routing & Community Shortcuts Integration
 * Compatible with Rydealot Captain App, Sage Delivery, Grocery Apps & Web
 * =========================================================================
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SupermapsSDK = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  class SupermapsSDK {
    constructor(options = {}) {
      this.apiKey = options.apiKey || 'smp_live_public';
      this.endpoint = (options.endpoint || 'https://rydealot-supermaps-api.rydealotmaps.workers.dev').replace(/\/+$/, '');
      this.appName = options.appName || 'rydealot';
      this.isRecording = false;
      this.recordedBreadcrumbs = [];
      this._recorderWatchId = null;
    }

    /**
     * Fetch active shortcuts for the given vehicle mode
     * @param {Object} opts - { vehicle: 'bike'|'car', lat?: number, lng?: number, radiusKm?: number }
     * @returns {Promise<Array>} List of approved & active shortcuts
     */
    async getShortcuts(opts = {}) {
      const vehicle = opts.vehicle || 'bike';
      let url = `${this.endpoint}/api/v1/shortcuts?vehicle=${encodeURIComponent(vehicle)}`;
      if (opts.lat && opts.lng) {
        url += `&lat=${opts.lat}&lng=${opts.lng}`;
      }

      try {
        const res = await fetch(url, {
          headers: {
            'X-Supermaps-Key': this.apiKey,
            'X-Supermaps-App': this.appName
          }
        });
        if (!res.ok) return [];
        return await res.json();
      } catch (err) {
        console.warn('[SupermapsSDK] Failed to fetch shortcuts:', err);
        return [];
      }
    }

    /**
     * Start automatic GPS breadcrumb recording for a rider discovering a new shortcut
     */
    startRecording() {
      this.isRecording = true;
      this.recordedBreadcrumbs = [];

      if ('geolocation' in navigator) {
        this._recorderWatchId = navigator.geolocation.watchPosition(
          (pos) => {
            const pt = [Number(pos.coords.longitude.toFixed(6)), Number(pos.coords.latitude.toFixed(6))];
            if (this.recordedBreadcrumbs.length === 0) {
              this.recordedBreadcrumbs.push(pt);
            } else {
              const last = this.recordedBreadcrumbs[this.recordedBreadcrumbs.length - 1];
              // Add only if rider moved > 5 meters
              const dist = Math.hypot(pt[0] - last[0], pt[1] - last[1]);
              if (dist > 0.00005) {
                this.recordedBreadcrumbs.push(pt);
              }
            }
          },
          (err) => console.warn('[SupermapsSDK] Recorder GPS error:', err),
          { enableHighAccuracy: true, maximumAge: 1000 }
        );
      }
    }

    /**
     * Stop breadcrumb recording and return collected points
     * @returns {Array<[lng, lat]>} Array of coordinates
     */
    stopRecording() {
      this.isRecording = false;
      if (this._recorderWatchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(this._recorderWatchId);
        this._recorderWatchId = null;
      }
      return [...this.recordedBreadcrumbs];
    }

    /**
     * Record and submit a newly discovered shortcut
     * @param {Object} data - { title, riderId, vehicleType: 'bike'|'all', coordinates, timeSavedMins }
     * @returns {Promise<Object>} Created shortcut response with 10-ride bounty tracker
     */
    async recordShortcut(data = {}) {
      const coords = data.coordinates || this.recordedBreadcrumbs;
      if (!coords || coords.length < 2) {
        throw new Error('Shortcut requires at least 2 coordinate points');
      }

      const payload = {
        title: data.title || 'Community Shortcut',
        creator_rider_id: data.riderId || 'UNKNOWN_RIDER',
        creator_app: this.appName,
        vehicle_type: data.vehicleType || 'bike', // 'bike' or 'all'
        coordinates: coords,
        time_saved_mins: Number(data.timeSavedMins) || 5,
        distance_meters: Math.round(coords.length * 15)
      };

      const res = await fetch(`${this.endpoint}/api/v1/shortcuts/record`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Supermaps-Key': this.apiKey
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to record shortcut');
      }

      return await res.json();
    }

    /**
     * Log a ride completed through a shortcut (increments 10-ride threshold towards ₹10 bounty)
     * @param {string} shortcutId
     * @param {string} riderId
     * @param {string} rideId
     */
    async logRideCompletion(shortcutId, riderId, rideId) {
      if (!shortcutId) return null;
      try {
        const res = await fetch(`${this.endpoint}/api/v1/shortcuts/${shortcutId}/complete-ride`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Supermaps-Key': this.apiKey
          },
          body: JSON.stringify({
            rider_id: riderId || 'RIDER_' + Date.now(),
            ride_id: rideId || 'RIDE_' + Date.now()
          })
        });
        return await res.json();
      } catch (err) {
        console.warn('[SupermapsSDK] Failed to log ride completion:', err);
        return null;
      }
    }

    /**
     * Report a shortcut as closed (locked gate, construction, wall built)
     * 3 reports automatically mark it temporarily closed!
     * @param {string} shortcutId
     * @param {string} reason
     */
    async reportClosed(shortcutId, reason = 'Gate locked / Road closed') {
      if (!shortcutId) return null;
      try {
        const res = await fetch(`${this.endpoint}/api/v1/shortcuts/${shortcutId}/report-closed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Supermaps-Key': this.apiKey
          },
          body: JSON.stringify({ reason })
        });
        return await res.json();
      } catch (err) {
        console.warn('[SupermapsSDK] Failed to report closed:', err);
        return null;
      }
    }

    /**
     * Helper: Render shortcuts on MapLibre GL map
     */
    renderOnMaplibre(map, shortcuts = []) {
      if (!map) return;
      const srcId = 'supermaps-shortcuts-source';
      const layerId = 'supermaps-shortcuts-layer';
      const casingId = 'supermaps-shortcuts-casing';

      const geojson = {
        type: 'FeatureCollection',
        features: shortcuts.map(s => ({
          type: 'Feature',
          properties: {
            id: s.id,
            title: s.title,
            vehicle_type: s.vehicle_type,
            time_saved_mins: s.time_saved_mins,
            rides: s.rides_completed_count || 0
          },
          geometry: {
            type: 'LineString',
            coordinates: s.coordinates
          }
        }))
      };

      if (map.getSource(srcId)) {
        map.getSource(srcId).setData(geojson);
      } else {
        map.addSource(srcId, { type: 'geojson', data: geojson });

        map.addLayer({
          id: casingId,
          type: 'line',
          source: srcId,
          paint: {
            'line-color': '#000000',
            'line-width': 7,
            'line-opacity': 0.8
          }
        });

        map.addLayer({
          id: layerId,
          type: 'line',
          source: srcId,
          paint: {
            'line-color': '#f59e0b',
            'line-width': 4.5,
            'line-dasharray': [2, 1.5]
          }
        });
      }
    }
  }

  return SupermapsSDK;
}));
