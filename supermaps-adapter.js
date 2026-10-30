// =========================================================================
// RYDEALOT SUPERMAPS ADAPTER ENGINE
// 100% Proprietary Vector Maps (MapLibre GL + PMTiles)
// Replaces Leaflet & OpenStreetMap platform-wide with Zero 3D Tilt & Zero D1 Writes
// =========================================================================

(function(window) {
  'use strict';

  var SUPERMAPS_PMTILES_URL = 'https://rydealot-supermaps-api.rydealotmaps.workers.dev/api/v1/pmtiles/india.pmtiles';

  // 1. Initialize PMTiles Protocol once
  var _protocolInitialized = false;
  function initProtocol() {
    if (_protocolInitialized) return;
    if (typeof pmtiles !== 'undefined' && typeof maplibregl !== 'undefined') {
      try {
        var protocol = new pmtiles.Protocol();
        maplibregl.addProtocol('pmtiles', protocol.tile);
        _protocolInitialized = true;
      } catch (e) {
        _protocolInitialized = true;
      }
    }
  }
  initProtocol();

  function getStoredTheme() {
    try {
      return localStorage.getItem('rydealot_map_theme') || 'light';
    } catch(e) {
      return 'light';
    }
  }

  // 2. Build High-Performance 2D Vector Style
  function getSupermapsVectorStyle(theme) {
    initProtocol();
    var isDark = theme === 'dark' || theme === 'gold';
    var layers = [];
    if (typeof basemaps !== 'undefined' && typeof basemaps.layers === 'function') {
      if (isDark) {
        // Rydealot High-Contrast Dark & Gold Brand Palette
        var darkFlavor = Object.assign({}, basemaps.DARK, {
          background: '#0a0b0e',
          earth: '#0e1017',
          water: '#101622',
          park_a: '#0f1712',
          buildings: '#151821',
          highway: '#f59e0b',
          major: '#d97706',
          minor: '#452a0a',
          link: '#b45309',
          roads_label_major: '#fef3c7',
          roads_label_minor: '#fde68a'
        });
        layers = basemaps.layers('protomaps', darkFlavor, { lang: 'en' });
      } else {
        // Clean White / Light Map Style
        layers = basemaps.layers('protomaps', basemaps.LIGHT, { lang: 'en' });
      }
    } else {
      // Fallback clean 2D vector layers
      layers = [
        { id: 'background', type: 'background', paint: { 'background-color': isDark ? '#0a0b0e' : '#f8fafc' } },
        { id: 'earth', type: 'fill', source: 'protomaps', 'source-layer': 'earth', paint: { 'fill-color': isDark ? '#0e1017' : '#e2e8f0' } },
        { id: 'water', type: 'fill', source: 'protomaps', 'source-layer': 'water', paint: { 'fill-color': isDark ? '#101622' : '#93c5fd' } },
        { id: 'roads', type: 'line', source: 'protomaps', 'source-layer': 'roads', paint: { 'line-color': isDark ? '#f59e0b' : '#3b82f6', 'line-width': 1.5 } }
      ];
    }

    return {
      version: 8,
      glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
      sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/' + (isDark ? 'dark' : 'light'),
      sources: {
        protomaps: {
          type: 'vector',
          url: 'pmtiles://' + SUPERMAPS_PMTILES_URL
        }
      },
      layers: layers
    };
  }

  // 3. Supermaps Map Wrapper (Strictly Flat 2D Top-Down)
  function SupermapsMapAdapter(container, options) {
    initProtocol();
    options = options || {};
    this.container = typeof container === 'string' ? document.getElementById(container) : container;
    this.options = options;
    this._layers = [];
    this._isLoaded = false;
    this._pendingOps = [];

    // Leaflet center is [lat, lng]; MapLibre is [lng, lat]
    var initCenter = [79.5509, 17.9961];
    if (options.center) {
      var cLat = Array.isArray(options.center) ? options.center[0] : options.center.lat;
      var cLng = Array.isArray(options.center) ? options.center[1] : options.center.lng;
      if (!isNaN(cLat) && !isNaN(cLng)) initCenter = [cLng, cLat];
    }

    // Default theme is ALWAYS 'light' unless explicitly saved or requested
    this.currentTheme = options.theme || getStoredTheme();
    if (this.currentTheme !== 'dark' && this.currentTheme !== 'gold') {
      this.currentTheme = 'light';
    }

    this._map = new maplibregl.Map({
      container: this.container,
      center: initCenter,
      zoom: options.zoom || 14,
      minZoom: options.minZoom || 4,
      pitch: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      attributionControl: false,
      powerPreference: 'high-performance',
      antialias: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      style: getSupermapsVectorStyle(this.currentTheme)
    });

    if (options.zoomControl) {
      this._map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }

    // Initialize floating theme control button on map if not disabled
    if (options.themeControl !== false && this.container) {
      this._initThemeToggleBtn();
    }

    var self = this;
    this._map.on('load', function() {
      self._isLoaded = true;
      while (self._pendingOps.length > 0) {
        var op = self._pendingOps.shift();
        try { op(); } catch(e) { console.warn('[Supermaps Adapter] Op error:', e); }
      }
    });
  }

  SupermapsMapAdapter.prototype._initThemeToggleBtn = function() {
    if (!this.container) return;

    // Check if container already has a dedicated theme toggle button (e.g. index.html #btn-toggle-map-theme)
    var existingBtn = this.container.querySelector('#btn-toggle-map-theme');
    if (existingBtn) {
      this._themeBtn = existingBtn;
      this._updateThemeButtonUI();
      var self = this;
      existingBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        self.toggleTheme();
      });
      return;
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'supermaps-theme-toggle-btn';
    btn.setAttribute('title', 'Toggle Light / Dark Map Mode');
    btn.style.cssText = 'position:absolute; bottom:10px; right:10px; z-index:90; padding:5px 11px; border-radius:20px; font-size:11px; font-weight:800; font-family:system-ui,-apple-system,sans-serif; cursor:pointer; display:flex; align-items:center; gap:5px; box-shadow:0 2px 8px rgba(0,0,0,0.18); backdrop-filter:blur(6px); transition:all 0.15s ease; user-select:none;';

    this.container.appendChild(btn);
    this._themeBtn = btn;
    this._updateThemeButtonUI();

    var selfBtn = this;
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      e.preventDefault();
      selfBtn.toggleTheme();
    });
  };

  SupermapsMapAdapter.prototype._updateThemeButtonUI = function() {
    var isDark = this.currentTheme === 'dark' || this.currentTheme === 'gold';
    if (this._themeBtn) {
      this._themeBtn.innerHTML = isDark ? '☀️ Light' : '🌙 Dark';
      if (this._themeBtn.classList.contains('supermaps-theme-toggle-btn')) {
        this._themeBtn.style.background = isDark ? 'rgba(15,23,42,0.92)' : 'rgba(255,255,255,0.92)';
        this._themeBtn.style.color = isDark ? '#ffffff' : '#0f172a';
        this._themeBtn.style.border = isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.15)';
      }
    }
    var globalBtn = document.getElementById('btn-toggle-map-theme');
    if (globalBtn && globalBtn !== this._themeBtn) {
      globalBtn.innerHTML = isDark ? '☀️ Light' : '🌙 Dark';
    }
  };

  SupermapsMapAdapter.prototype.setTheme = function(theme) {
    if (theme !== 'dark' && theme !== 'gold') theme = 'light';
    this.currentTheme = theme;
    try {
      localStorage.setItem('rydealot_map_theme', theme);
    } catch(e) {}

    var self = this;
    var newStyle = getSupermapsVectorStyle(theme);
    this._map.setStyle(newStyle);

    // Re-add active polylines when new style completes loading
    this._map.once('style.load', function() {
      for (var i = 0; i < self._layers.length; i++) {
        var layer = self._layers[i];
        if (layer && typeof layer._readdToMap === 'function') {
          layer._readdToMap(self);
        }
      }
    });

    this._updateThemeButtonUI();
    return this;
  };

  SupermapsMapAdapter.prototype.toggleTheme = function() {
    var next = (this.currentTheme === 'dark' || this.currentTheme === 'gold') ? 'light' : 'dark';
    return this.setTheme(next);
  };

  SupermapsMapAdapter.prototype.whenReady = function(fn) {
    if (this._isLoaded) {
      fn();
    } else {
      this._pendingOps.push(fn);
    }
  };

  SupermapsMapAdapter.prototype.setView = function(center, zoom) {
    var lat = Array.isArray(center) ? center[0] : center.lat;
    var lng = Array.isArray(center) ? center[1] : center.lng;
    var z = zoom !== undefined ? zoom : this._map.getZoom();
    this._map.jumpTo({ center: [lng, lat], zoom: z, pitch: 0 });
    return this;
  };

  SupermapsMapAdapter.prototype.panTo = function(center) {
    var lat = Array.isArray(center) ? center[0] : center.lat;
    var lng = Array.isArray(center) ? center[1] : center.lng;
    this._map.panTo([lng, lat], { pitch: 0 });
    return this;
  };

  SupermapsMapAdapter.prototype.flyTo = function(center, zoom) {
    var lat = Array.isArray(center) ? center[0] : center.lat;
    var lng = Array.isArray(center) ? center[1] : center.lng;
    var z = zoom !== undefined ? zoom : this._map.getZoom();
    this._map.flyTo({ center: [lng, lat], zoom: z, pitch: 0 });
    return this;
  };

  SupermapsMapAdapter.prototype.fitBounds = function(bounds, opts) {
    opts = opts || {};
    var raw = bounds.bounds || bounds;
    if (Array.isArray(raw) && raw.length > 0) {
      var minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
      for (var i = 0; i < raw.length; i++) {
        var pt = raw[i];
        var lat = Array.isArray(pt) ? pt[0] : (pt.lat !== undefined ? pt.lat : pt[1]);
        var lng = Array.isArray(pt) ? pt[1] : (pt.lng !== undefined ? pt.lng : pt[0]);
        if (!isNaN(lat) && !isNaN(lng)) {
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
        }
      }
      if (minLat !== Infinity) {
        if (minLat === maxLat && minLng === maxLng) {
          minLat -= 0.005; maxLat += 0.005;
          minLng -= 0.005; maxLng += 0.005;
        }
        var pad = (opts.padding && Array.isArray(opts.padding)) ? opts.padding[0] : (opts.padding || 35);
        this._map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: pad, maxZoom: opts.maxZoom || 17, pitch: 0 });
      }
    }
    return this;
  };

  SupermapsMapAdapter.prototype.getCenter = function() {
    var c = this._map.getCenter();
    return { lat: c.lat, lng: c.lng };
  };

  SupermapsMapAdapter.prototype.getZoom = function() {
    return this._map.getZoom();
  };

  SupermapsMapAdapter.prototype.invalidateSize = function() {
    this._map.resize();
    return this;
  };

  SupermapsMapAdapter.prototype.removeLayer = function(layer) {
    if (!layer) return this;
    if (typeof layer.remove === 'function') {
      layer.remove();
    } else if (typeof layer._removeFromMap === 'function') {
      layer._removeFromMap(this);
    }
    var idx = this._layers.indexOf(layer);
    if (idx !== -1) this._layers.splice(idx, 1);
    return this;
  };

  SupermapsMapAdapter.prototype.addLayer = function(layer) {
    if (layer && typeof layer.addTo === 'function') {
      layer.addTo(this);
    }
    return this;
  };

  SupermapsMapAdapter.prototype.on = function(event, handler) {
    var self = this;
    var evList = event.split(' ');
    for (var i = 0; i < evList.length; i++) {
      var ev = evList[i].trim();
      if (!ev) continue;
      if (ev === 'click') {
        this._map.on('click', function(e) {
          handler({
            latlng: { lat: e.lngLat.lat, lng: e.lngLat.lng },
            originalEvent: e.originalEvent
          });
        });
      } else if (ev === 'movestart' || ev === 'dragstart') {
        this._map.on('movestart', handler);
      } else if (ev === 'moveend' || ev === 'dragend') {
        this._map.on('moveend', handler);
      } else {
        this._map.on(ev, handler);
      }
    }
    return this;
  };

  SupermapsMapAdapter.prototype.remove = function() {
    try { this._map.remove(); } catch(e) {}
  };

  // 4. Marker Adapter
  function SupermapsMarkerAdapter(latlng, options) {
    options = options || {};
    this.options = options;
    var lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
    var lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
    this._lat = lat;
    this._lng = lng;
    this._mapAdapter = null;

    var el = null;
    if (options.icon && options.icon.options && options.icon.options.html) {
      el = document.createElement('div');
      el.className = options.icon.options.className || 'supermaps-marker-elem';
      el.innerHTML = options.icon.options.html;
      if (options.icon.options.iconSize) {
        el.style.width = options.icon.options.iconSize[0] + 'px';
        el.style.height = options.icon.options.iconSize[1] + 'px';
      }
    }

    this._marker = new maplibregl.Marker({
      element: el,
      draggable: !!options.draggable
    }).setLngLat([lng, lat]);
  }

  SupermapsMarkerAdapter.prototype.addTo = function(mapAdapter) {
    this._mapAdapter = mapAdapter;
    var target = mapAdapter._map || mapAdapter;
    this._marker.addTo(target);
    if (mapAdapter._layers) mapAdapter._layers.push(this);
    return this;
  };

  SupermapsMarkerAdapter.prototype.setLatLng = function(latlng) {
    var lat = Array.isArray(latlng) ? latlng[0] : latlng.lat;
    var lng = Array.isArray(latlng) ? latlng[1] : latlng.lng;
    this._lat = lat;
    this._lng = lng;
    this._marker.setLngLat([lng, lat]);
    return this;
  };

  SupermapsMarkerAdapter.prototype.getLatLng = function() {
    var pos = this._marker.getLngLat();
    return { lat: pos.lat, lng: pos.lng };
  };

  SupermapsMarkerAdapter.prototype.on = function(event, handler) {
    var self = this;
    if (event === 'dragend') {
      this._marker.on('dragend', function() {
        var pos = self._marker.getLngLat();
        self._lat = pos.lat;
        self._lng = pos.lng;
        handler({ target: self });
      });
    }
    return this;
  };

  SupermapsMarkerAdapter.prototype.remove = function() {
    try { this._marker.remove(); } catch(e) {}
    return this;
  };

  SupermapsMarkerAdapter.prototype._removeFromMap = function() {
    this.remove();
  };

  // 5. Polyline Adapter (WebGL GeoJSON LineString)
  var _polyCounter = 0;
  function SupermapsPolylineAdapter(coords, options) {
    this.id = 'supermaps-route-line-' + (++_polyCounter);
    this.options = options || {};
    this._coords = coords || [];
    this._mapAdapter = null;
  }

  SupermapsPolylineAdapter.prototype._convertCoords = function(pts) {
    var res = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var lat = Array.isArray(p) ? p[0] : p.lat;
      var lng = Array.isArray(p) ? p[1] : p.lng;
      if (!isNaN(lat) && !isNaN(lng)) res.push([lng, lat]);
    }
    return res;
  };

  SupermapsPolylineAdapter.prototype.addTo = function(mapAdapter) {
    this._mapAdapter = mapAdapter;
    var self = this;
    var ml = mapAdapter._map || mapAdapter;
    var geoCoords = this._convertCoords(this._coords);

    mapAdapter.whenReady(function() {
      if (ml.getSource(self.id)) return;

      ml.addSource(self.id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: geoCoords
          }
        }
      });

      var paint = {
        'line-color': self.options.color || '#38BDF8',
        'line-width': self.options.weight || 4,
        'line-opacity': self.options.opacity !== undefined ? self.options.opacity : 0.85
      };

      if (self.options.dashArray) {
        paint['line-dasharray'] = [2, 2];
      }

      ml.addLayer({
        id: self.id,
        type: 'line',
        source: self.id,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: paint
      });
    });

    if (mapAdapter._layers) mapAdapter._layers.push(this);
    return this;
  };

  SupermapsPolylineAdapter.prototype.setLatLngs = function(newCoords) {
    this._coords = newCoords;
    if (!this._mapAdapter) return this;
    var self = this;
    var ml = this._mapAdapter._map || this._mapAdapter;
    var geoCoords = this._convertCoords(newCoords);

    this._mapAdapter.whenReady(function() {
      var src = ml.getSource(self.id);
      if (src) {
        src.setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: geoCoords
          }
        });
      }
    });
    return this;
  };

  SupermapsPolylineAdapter.prototype.remove = function() {
    if (!this._mapAdapter) return this;
    var ml = this._mapAdapter._map || this._mapAdapter;
    try {
      if (ml.getLayer(this.id)) ml.removeLayer(this.id);
      if (ml.getSource(this.id)) ml.removeSource(this.id);
    } catch(e) {}
    return this;
  };

  SupermapsPolylineAdapter.prototype._removeFromMap = function() {
    this.remove();
  };

  SupermapsPolylineAdapter.prototype._readdToMap = function(mapAdapter) {
    var ml = mapAdapter._map || mapAdapter;
    var geoCoords = this._convertCoords(this._coords);
    if (!geoCoords || geoCoords.length === 0) return;
    if (ml.getSource(this.id)) return;

    try {
      ml.addSource(this.id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: geoCoords
          }
        }
      });

      var paint = {
        'line-color': this.options.color || '#38BDF8',
        'line-width': this.options.weight || 4,
        'line-opacity': this.options.opacity !== undefined ? this.options.opacity : 0.85
      };

      if (this.options.dashArray) {
        paint['line-dasharray'] = [2, 2];
      }

      ml.addLayer({
        id: this.id,
        type: 'line',
        source: this.id,
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        paint: paint
      });
    } catch(e) {
      console.warn('[Supermaps Adapter] Error restoring polyline on style change:', e);
    }
  };

  // 6. No-Op Tile Layer (Replaces OSM raster fetches)
  function SupermapsTileLayerDummy(url, options) {
    this._url = url;
    this.options = options || {};
  }
  SupermapsTileLayerDummy.prototype.addTo = function(map) { return this; };
  SupermapsTileLayerDummy.prototype.on = function() { return this; };
  SupermapsTileLayerDummy.prototype.setUrl = function(url) { this._url = url; return this; };
  SupermapsTileLayerDummy.prototype.remove = function() { return this; };

  // 7. Global L Namespace Interface
  window.L = {
    map: function(container, opts) {
      return new SupermapsMapAdapter(container, opts);
    },
    marker: function(latlng, opts) {
      return new SupermapsMarkerAdapter(latlng, opts);
    },
    polyline: function(coords, opts) {
      return new SupermapsPolylineAdapter(coords, opts);
    },
    tileLayer: function(url, opts) {
      return new SupermapsTileLayerDummy(url, opts);
    },
    divIcon: function(opts) {
      return { options: opts || {} };
    },
    latLngBounds: function(points) {
      return { bounds: points };
    },
    latLng: function(lat, lng) {
      return { lat: lat, lng: lng };
    }
  };

  console.log('[Supermaps Engine] Proprietary Vector Map Adapter loaded (Zero Leaflet • Zero OpenStreetMap • Zero 3D Tilt)');
})(window);
