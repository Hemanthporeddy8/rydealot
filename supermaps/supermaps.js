// =========================================================================
// RYDEALOT SUPERMAPS — 100% PROPRIETARY VECTOR ENGINE (MapLibre + PMTiles)
// Powered by Self-Hosted india.pmtiles (2.42 GB) • Zero OpenStreetMap
// =========================================================================

const CONFIG = {
  // Your Verified Cloud-Hosted 2.42 GB India Map Archive
  PMTILES_SOURCE: 'https://huggingface.co/datasets/RydealotMaps/rydealot-maps/resolve/main/india.pmtiles',
  D1_WORKER: 'https://rydealot-supermaps-api.rydealotmaps.workers.dev',
  OSRM_ROUTING: 'https://router.project-osrm.org/route/v1/driving/',
  DEFAULT_LNG_LAT: [78.4867, 17.3850], // Hyderabad [lng, lat]
  INDIA_BOUNDS: [
    [68.1, 7.9],  // Southwest [lng, lat]
    [97.4, 35.5]  // Northeast [lng, lat]
  ],
  BUFFER_KM: 5.0
};

// --- GLOBAL STATE ---
let map = null;
let userMarker = null;
let destMarker = null;
let currentHeading = 0;
let userLngLat = CONFIG.DEFAULT_LNG_LAT;
let isNavigating = false;
let activeVehicleMode = 'car';
let activeDestination = null;
let verifiedShops = [];
let _styleReloadPending = false;
let _pendingRouteGeometry = null;

// ── THEME DEFINITIONS ──────────────────────────────────────────────────────────
// Each theme has a Protomaps base flavor + paint property overrides applied after style loads.
// Layer IDs follow @protomaps/basemaps v5 naming convention.
const THEMES = {
  gold: {
    key: 'gold',
    name: 'Rydealot Gold',
    badge: 'DEFAULT',
    description: 'Signature black & gold. Your brand, your map.',
    base: 'dark',
    preview: ['#0a0a0a', '#f59e0b', '#d97706', '#1a1400'],
    isDark: true,
    overrides: {
      'earth':           { 'fill-color': '#0a0a0a' },
      'water':           { 'fill-color': '#0a1520' },
      'landuse_park':    { 'fill-color': '#0d1a0d' },
      'landuse_wood':    { 'fill-color': '#0d1a0d' },
      'roads_highway':   { 'line-color': '#d97706', 'line-width': 5 },
      'roads_major':     { 'line-color': '#f59e0b' },
      'roads_medium':    { 'line-color': '#78350f' },
      'roads_minor':     { 'line-color': '#1c1400' },
      'roads_link':      { 'line-color': '#92400e' },
      'buildings':       { 'fill-color': '#141008', 'fill-opacity': 0.9 },
    }
  },

  autonight: {
    key: 'autonight',
    name: 'Auto Night',
    badge: 'RIDER MODE',
    description: 'Max contrast for bike/auto night riding.',
    base: 'dark',
    preview: ['#000000', '#fbbf24', '#f97316', '#1c0800'],
    isDark: true,
    overrides: {
      'earth':           { 'fill-color': '#000000' },
      'water':           { 'fill-color': '#00060f' },
      'landuse_park':    { 'fill-color': '#010800' },
      'landuse_wood':    { 'fill-color': '#010800' },
      'roads_highway':   { 'line-color': '#f97316', 'line-width': 6 },
      'roads_major':     { 'line-color': '#fbbf24', 'line-width': 4 },
      'roads_medium':    { 'line-color': '#d97706' },
      'roads_minor':     { 'line-color': '#1c0a00' },
      'roads_link':      { 'line-color': '#b45309' },
      'buildings':       { 'fill-color': '#050300', 'fill-opacity': 0.95 },
    }
  },

  neon: {
    key: 'neon',
    name: 'Neon Bazaar',
    badge: 'FESTIVAL',
    description: 'Electric neon lights. Like a night bazaar from above.',
    base: 'dark',
    preview: ['#000000', '#ec4899', '#a855f7', '#0a001a'],
    isDark: true,
    overrides: {
      'earth':           { 'fill-color': '#000000' },
      'water':           { 'fill-color': '#05001a' },
      'landuse_park':    { 'fill-color': '#001a0a' },
      'landuse_wood':    { 'fill-color': '#001a0a' },
      'roads_highway':   { 'line-color': '#a855f7', 'line-width': 5 },
      'roads_major':     { 'line-color': '#ec4899' },
      'roads_medium':    { 'line-color': '#7c3aed' },
      'roads_minor':     { 'line-color': '#1a0025' },
      'roads_link':      { 'line-color': '#9333ea' },
      'buildings':       { 'fill-color': '#0a0015', 'fill-opacity': 0.9 },
    }
  },

  chai: {
    key: 'chai',
    name: 'Chai Tapri',
    badge: 'WARM',
    description: 'Earthy & warm. Like a chai stall hand-drawn board.',
    base: 'light',
    preview: ['#f5e6c8', '#c2440e', '#8b2500', '#d4b483'],
    isDark: false,
    overrides: {
      'earth':           { 'fill-color': '#f5e6c8' },
      'water':           { 'fill-color': '#b0c8d8' },
      'landuse_park':    { 'fill-color': '#d4e8c0' },
      'landuse_wood':    { 'fill-color': '#c4d8a8' },
      'roads_highway':   { 'line-color': '#8b2500', 'line-width': 5 },
      'roads_major':     { 'line-color': '#c2440e' },
      'roads_medium':    { 'line-color': '#d97032' },
      'roads_minor':     { 'line-color': '#d4b483' },
      'roads_link':      { 'line-color': '#b85c20' },
      'buildings':       { 'fill-color': '#e8d0a0', 'fill-opacity': 0.8 },
    }
  },

  heritage: {
    key: 'heritage',
    name: 'Heritage',
    badge: 'VINTAGE',
    description: 'Old Survey of India parchment style. Classic & unique.',
    base: 'light',
    preview: ['#e8d5a3', '#5c3317', '#3d1f0a', '#c4a87a'],
    isDark: false,
    overrides: {
      'earth':           { 'fill-color': '#e8d5a3' },
      'water':           { 'fill-color': '#a0b8c8' },
      'landuse_park':    { 'fill-color': '#d0c890' },
      'landuse_wood':    { 'fill-color': '#c8ba78' },
      'roads_highway':   { 'line-color': '#3d1f0a', 'line-width': 5 },
      'roads_major':     { 'line-color': '#5c3317' },
      'roads_medium':    { 'line-color': '#7a4a28' },
      'roads_minor':     { 'line-color': '#c4a87a' },
      'roads_link':      { 'line-color': '#6b3a20' },
      'buildings':       { 'fill-color': '#d4b87a', 'fill-opacity': 0.7 },
    }
  }
};

// Active theme — load from localStorage or default to Gold
let activeThemeKey = localStorage.getItem('rydealot_map_theme') || 'gold';
function getActiveTheme() { return THEMES[activeThemeKey] || THEMES.gold; }

// 2. VECTOR STYLE BUILDER
function buildVectorStyle() {
  const theme = getActiveTheme();
  const flavor = theme.base; // 'dark' or 'light'

  let vectorLayers = [];
  if (typeof basemaps !== 'undefined' && basemaps.layers) {
    // Generate base layers from protomaps
    vectorLayers = basemaps.layers('protomaps', basemaps.namedFlavor(flavor), { lang: 'en' });
    
    // Bake theme paint overrides directly into layer objects!
    // This compiles once in GPU memory — zero runtime setPaintProperty lag, zero device heat!
    const overrides = theme.overrides || {};
    vectorLayers.forEach(layer => {
      Object.entries(overrides).forEach(([pattern, props]) => {
        if (layer.id === pattern || layer.id.includes(pattern.replace('_', '-')) || layer.id.includes(pattern)) {
          layer.paint = Object.assign({}, layer.paint, props);
        }
      });
    });
  }

  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${flavor}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${CONFIG.PMTILES_SOURCE}`
      }
    },
    layers: vectorLayers
  };
}

// Fast UI theme class update (no heavy layer iteration needed)
function applyThemeOverrides() {
  const theme = getActiveTheme();
  document.body.classList.toggle('daylight-theme', !theme.isDark);
}

// Set a new theme — saves to localStorage, reloads map style
function setMapTheme(themeKey) {
  if (!THEMES[themeKey]) return;
  activeThemeKey = themeKey;
  localStorage.setItem('rydealot_map_theme', themeKey);
  _styleReloadPending = true;
  map.setStyle(buildVectorStyle());
  updateThemePickerSelection();
}

// Open/close theme picker panel
function openThemePicker() {
  const panel = document.getElementById('theme-picker-panel');
  if (panel) panel.classList.add('active');
  updateThemePickerSelection();
}
function closeThemePicker() {
  const panel = document.getElementById('theme-picker-panel');
  if (panel) panel.classList.remove('active');
}
function updateThemePickerSelection() {
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.theme === activeThemeKey);
  });
}

// Legacy toggle — now opens picker
function toggleMapTheme() { openThemePicker(); }


// 1. INITIALIZE MAPLIBRE WITH PMTILES PROTOCOL
window.addEventListener('DOMContentLoaded', () => {
  initMapEngine();
  registerServiceWorker();
  initNetworkListeners();
  loadGoldenShops();
  setupCompassHeading();
});

function initMapEngine() {
  // Register PMTiles Protocol with MapLibre GL
  if (typeof pmtiles !== 'undefined') {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }

  // Apply saved theme class to body immediately (before map loads)
  document.body.classList.toggle('daylight-theme', !getActiveTheme().isDark);

  // Create Vector Map (Strictly Bounded to India)
  map = new maplibregl.Map({
    container: 'map-viewport',
    center: CONFIG.DEFAULT_LNG_LAT,
    zoom: 13,
    minZoom: 4.2,
    maxBounds: CONFIG.INDIA_BOUNDS,
    style: buildVectorStyle(),
    attributionControl: false
  });

  // Navigation controls
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'bottom-right');

  // 1-tap on map → drop destination pin
  map.on('click', (e) => {
    closeBottomPanel();
    document.getElementById('search-dropdown').style.display = 'none';
    handleMapDestinationClick(e.lngLat);
  });

  // Initial load — apply theme overrides + GIS overlays
  map.on('load', () => {
    applyThemeOverrides();
    renderAdminGisOverlays();
  });

  // Re-apply everything after setStyle() (theme change wipes all layers)
  map.on('style.load', () => {
    applyThemeOverrides();
    renderAdminGisOverlays();
    if (_styleReloadPending && _pendingRouteGeometry) {
      renderRouteOnMap(_pendingRouteGeometry);
    }
    _styleReloadPending = false;
  });

  // Real-time sync when Admin updates GIS data in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'rydealot_custom_roads' || e.key === 'rydealot_custom_buildings') {
      renderAdminGisOverlays();
    }
  });

  // Track User GPS Location — with accuracy circle & warning
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLngLat = [pos.coords.longitude, pos.coords.latitude];
        const accuracyMeters = pos.coords.accuracy; // browser gives accuracy in meters

        map.flyTo({ center: userLngLat, zoom: 15 });
        createUserMarker(userLngLat);
        drawAccuracyCircle(userLngLat, accuracyMeters);

        // Warn the user when GPS is too inaccurate (desktop/WiFi-based location)
        if (accuracyMeters > 300) {
          showLocationAccuracyWarning(accuracyMeters);
        }
      },
      (err) => {
        // GPS denied or unavailable — stay at default and let user drop pin
        createUserMarker(userLngLat);
        showLocationPermissionBanner();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  } else {
    createUserMarker(userLngLat);
  }
}

// 3. USER VEHICLE NAVIGATION MARKER
function createUserMarker(lngLat) {
  if (userMarker) {
    userMarker.setLngLat(lngLat);
    return;
  }

  const el = document.createElement('div');
  el.id = 'nav-arrow-wrapper';
  el.innerHTML = `
    <div style="width: 28px; height: 28px; background: #06b6d4; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 16px #06b6d4; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <div style="width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 10px solid #fff; margin-top: -3px;"></div>
    </div>
  `;

  userMarker = new maplibregl.Marker({ element: el })
    .setLngLat(lngLat)
    .addTo(map);
}

let _lastCompassTime = 0;
let _lastCompassAngle = -999;

function updateCompassHeading(heading) {
  if (isNaN(heading)) return;
  const now = performance.now();
  if (now - _lastCompassTime < 120) return; // throttle to max ~8fps to avoid CPU churn
  if (Math.abs(heading - _lastCompassAngle) < 3) return; // ignore micro-jitter
  _lastCompassTime = now;
  _lastCompassAngle = heading;

  currentHeading = heading;
  const arrow = document.getElementById('nav-arrow-wrapper');
  if (arrow) arrow.style.transform = `rotate(${currentHeading}deg)`;
  
  if (isNavigating) {
    map.rotateTo(currentHeading, { duration: 250 });
  }
}

function setupCompassHeading() {
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      const heading = e.webkitCompassHeading !== undefined ? e.webkitCompassHeading : (e.alpha ? (360 - e.alpha) : null);
      if (heading !== null) updateCompassHeading(heading);
    }, { passive: true });
  }
}

// ── GPS ACCURACY CIRCLE (Optimized with setData — zero pipeline thrash) ───────
function drawAccuracyCircle(lngLat, accuracyMeters) {
  if (!map) return;

  // If accuracy is too huge (> 1000m) or very accurate (< 25m), hide circle
  if (accuracyMeters > 1000 || accuracyMeters < 25) {
    if (map.getLayer('user-accuracy-fill')) map.setLayoutProperty('user-accuracy-fill', 'visibility', 'none');
    if (map.getLayer('user-accuracy-stroke')) map.setLayoutProperty('user-accuracy-stroke', 'visibility', 'none');
    return;
  }

  const clampedRadius = Math.min(accuracyMeters, 350); // visual cap at 350m
  const points = 32;
  const earthRadius = 6371000;
  const latR = (clampedRadius / earthRadius) * (180 / Math.PI);
  const lngR = latR / Math.cos(lngLat[1] * Math.PI / 180);
  const coords = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    coords.push([lngLat[0] + lngR * Math.cos(angle), lngLat[1] + latR * Math.sin(angle)]);
  }

  const geojson = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] } };

  if (map.getSource('user-accuracy')) {
    map.getSource('user-accuracy').setData(geojson);
    map.setLayoutProperty('user-accuracy-fill', 'visibility', 'visible');
    map.setLayoutProperty('user-accuracy-stroke', 'visibility', 'visible');
  } else {
    map.addSource('user-accuracy', { type: 'geojson', data: geojson });
    map.addLayer({
      id: 'user-accuracy-fill',
      type: 'fill',
      source: 'user-accuracy',
      paint: { 'fill-color': '#06b6d4', 'fill-opacity': 0.08 }
    });
    map.addLayer({
      id: 'user-accuracy-stroke',
      type: 'line',
      source: 'user-accuracy',
      paint: { 'line-color': '#06b6d4', 'line-width': 1.5, 'line-opacity': 0.4, 'line-dasharray': [4, 3] }
    });
  }
}

// ── LOCATION ACCURACY WARNING ────────────────────────────────────────────────
function showLocationAccuracyWarning(accuracyMeters) {
  const existing = document.getElementById('loc-accuracy-banner');
  if (existing) existing.remove();

  const km = (accuracyMeters / 1000).toFixed(1);
  const banner = document.createElement('div');
  banner.id = 'loc-accuracy-banner';
  banner.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    z-index: 3000; background: rgba(245,158,11,0.95); color: #000;
    padding: 10px 16px; border-radius: 14px; font-size: 0.82rem; font-weight: 700;
    max-width: 340px; width: calc(100% - 32px); text-align: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4); font-family: 'Plus Jakarta Sans', sans-serif;
  `;
  banner.innerHTML = `
    Location accuracy is low (approx. ${km} km radius).
    This is normal on desktop — no GPS chip available.<br>
    <button onclick="openManualLocationSetter()" style="margin-top:8px; background:#000; color:#f59e0b; border:none; padding:7px 16px; border-radius:8px; font-weight:800; font-size:0.8rem; cursor:pointer; font-family:inherit;">
      Set My Location Manually
    </button>
    <button onclick="this.parentElement.remove()" style="margin-top:8px; margin-left:6px; background:rgba(0,0,0,0.15); color:#000; border:none; padding:7px 12px; border-radius:8px; font-weight:700; font-size:0.8rem; cursor:pointer; font-family:inherit;">
      Dismiss
    </button>
  `;
  document.body.appendChild(banner);

  // Auto-dismiss after 10 seconds
  setTimeout(() => { if (banner.parentElement) banner.remove(); }, 10000);
}

function showLocationPermissionBanner() {
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed; bottom: 80px; left: 50%; transform: translateX(-50%);
    z-index: 3000; background: rgba(239,68,68,0.95); color: #fff;
    padding: 10px 16px; border-radius: 14px; font-size: 0.82rem; font-weight: 700;
    max-width: 340px; width: calc(100% - 32px); text-align: center;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4); font-family: 'Plus Jakarta Sans', sans-serif;
  `;
  banner.innerHTML = `
    Location access denied or unavailable.<br>
    <button onclick="this.parentElement.remove(); openManualLocationSetter()" style="margin-top:8px; background:#fff; color:#ef4444; border:none; padding:7px 16px; border-radius:8px; font-weight:800; font-size:0.8rem; cursor:pointer; font-family:inherit;">
      Set Location Manually
    </button>
    <button onclick="this.parentElement.remove()" style="margin-top:8px; margin-left:6px; background:rgba(255,255,255,0.2); color:#fff; border:none; padding:7px 12px; border-radius:8px; font-weight:700; font-size:0.8rem; cursor:pointer; font-family:inherit;">
      Dismiss
    </button>
  `;
  document.body.appendChild(banner);
}

// ── MANUAL LOCATION SETTER ───────────────────────────────────────────────────
// User types their location name, selects from suggestions, location pin moves
function openManualLocationSetter() {
  const existing = document.getElementById('manual-loc-panel');
  if (existing) { existing.remove(); return; }

  const panel = document.createElement('div');
  panel.id = 'manual-loc-panel';
  panel.style.cssText = `
    position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
    z-index: 3000; background: var(--bg-surface); border: 1.5px solid var(--accent-gold);
    border-radius: 18px; padding: 16px; width: calc(100% - 32px); max-width: 400px;
    box-shadow: 0 16px 40px rgba(0,0,0,0.7); font-family: 'Plus Jakarta Sans', sans-serif;
  `;
  panel.innerHTML = `
    <div style="font-size:0.9rem; font-weight:800; color:var(--accent-gold); margin-bottom:10px;">Set My Location</div>
    <input id="manual-loc-input" type="text" placeholder="Type your location (e.g. Kazipet, Warangal)"
      style="width:100%; background:rgba(255,255,255,0.06); border:1px solid var(--border-color); border-radius:10px;
             padding:10px 12px; color:var(--text-main); font-size:0.9rem; font-family:inherit; outline:none;"
      oninput="searchManualLocation(this.value)">
    <div id="manual-loc-results" style="margin-top:8px; max-height:200px; overflow-y:auto;"></div>
    <button onclick="document.getElementById('manual-loc-panel').remove()"
      style="margin-top:10px; width:100%; background:rgba(255,255,255,0.06); border:1px solid var(--border-color);
             color:var(--text-muted); padding:8px; border-radius:10px; cursor:pointer; font-family:inherit; font-size:0.82rem;">
      Cancel
    </button>
  `;
  document.body.appendChild(panel);
  document.getElementById('manual-loc-input').focus();
}

let _manualLocTimer = null;
function searchManualLocation(query) {
  clearTimeout(_manualLocTimer);
  if (query.length < 2) return;
  _manualLocTimer = setTimeout(async () => {
    const resultsEl = document.getElementById('manual-loc-results');
    if (!resultsEl) return;
    resultsEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; padding:8px;">Searching...</div>';
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&bbox=68.1,7.9,97.4,35.5&limit=5&lang=en`;
      const res = await fetch(url);
      const data = await res.json();
      resultsEl.innerHTML = '';
      (data.features || []).forEach(f => {
        const name = [f.properties.name, f.properties.city, f.properties.state].filter(Boolean).join(', ');
        const div = document.createElement('div');
        div.style.cssText = 'padding:10px 12px; border-bottom:1px solid var(--border-color); cursor:pointer; font-size:0.85rem; color:var(--text-main); border-radius:8px;';
        div.textContent = name;
        div.onmouseenter = () => div.style.background = 'rgba(245,158,11,0.1)';
        div.onmouseleave = () => div.style.background = '';
        div.onclick = () => {
          const lng = f.geometry.coordinates[0];
          const lat = f.geometry.coordinates[1];
          userLngLat = [lng, lat];
          createUserMarker(userLngLat);
          drawAccuracyCircle(userLngLat, 50); // 50m circle for manual = high confidence
          map.flyTo({ center: userLngLat, zoom: 16 });
          document.getElementById('manual-loc-panel')?.remove();
          document.getElementById('loc-accuracy-banner')?.remove();
        };
        resultsEl.appendChild(div);
      });
    } catch (e) {
      resultsEl.innerHTML = '<div style="color:var(--text-muted); font-size:0.8rem; padding:8px;">Search failed. Try again.</div>';
    }
  }, 350);
}


// 4. GOOGLE MAPS STYLE "FROM / TO" DIRECTIONS & 1-TAP MAP ROUTING
let originLngLat = null; // null defaults to user GPS
let debounceTimer = null;

function clearSearchInput() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-dropdown').style.display = 'none';
}

function clearDirectionInput(which) {
  if (which === 'from') {
    document.getElementById('dir-from-input').value = '';
    originLngLat = null;
  } else {
    document.getElementById('dir-to-input').value = '';
    clearActiveRoute();
    activeDestination = null;
  }
}

function handlePlaceInput(event, targetType) {
  const query = event.target.value.trim();
  clearTimeout(debounceTimer);

  if (query.length < 2) {
    document.getElementById('search-dropdown').style.display = 'none';
    return;
  }

  debounceTimer = setTimeout(() => {
    fetchPlaceSuggestions(query, targetType);
  }, 350);
}

async function fetchPlaceSuggestions(query, targetType) {
  const dropdown = document.getElementById('search-dropdown');
  dropdown.innerHTML = '<div style="padding:12px 16px; font-size:0.85rem; color:var(--text-muted);">Searching...</div>';
  dropdown.style.display = 'block';

  // --- PRIMARY: Photon (komoot) — better partial/fuzzy matching for Indian place names ---
  // Bounding box restricted to India [lng_min, lat_min, lng_max, lat_max]
  const INDIA_BBOX = '68.1,7.9,97.4,35.5';
  try {
    const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&bbox=${INDIA_BBOX}&limit=8&lang=en`;
    const res = await fetch(photonUrl);
    const geojson = await res.json();

    if (geojson.features && geojson.features.length > 0) {
      renderSearchResults(geojson.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lon: f.geometry.coordinates[0],
        display_name: [
          f.properties.name,
          f.properties.street,
          f.properties.city || f.properties.county,
          f.properties.state,
          'India'
        ].filter(Boolean).join(', '),
        type: f.properties.osm_value || f.properties.type || 'place',
        _source: 'photon'
      })), dropdown, targetType);
      return;
    }
  } catch (e) {
    // Photon failed — fall through to Nominatim
  }

  // --- FALLBACK: Nominatim (stricter but more precise for exact names) ---
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&accept-language=te,hi,en&q=${encodeURIComponent(query)}&limit=8&addressdetails=1`;
    const res2 = await fetch(nomUrl, { headers: { 'User-Agent': 'RydealotSupermaps/1.0 contact@rydealot.com' } });
    const results = await res2.json();

    if (results && results.length > 0) {
      renderSearchResults(results.map(r => ({
        lat: r.lat,
        lon: r.lon,
        display_name: r.display_name,
        type: r.type || r.class || 'place',
        _source: 'nominatim'
      })), dropdown, targetType);
      return;
    }
  } catch (e) {
    // both failed
  }

  dropdown.innerHTML = `
    <div style="padding:14px 16px;">
      <div style="font-size:0.88rem; font-weight:700; color:var(--text-main); margin-bottom:4px;">No results for "${query}"</div>
      <div style="font-size:0.78rem; color:var(--text-muted);">Try adding city name — e.g. "Erragattugutta Hyderabad" — or tap on the map to drop a pin.</div>
    </div>`;
}

function renderSearchResults(places, dropdown, targetType) {
  dropdown.innerHTML = '';
  places.forEach(place => {
    const parts = place.display_name.split(',');
    const title = parts[0].trim();
    const subtitle = parts.slice(1, 4).map(s => s.trim()).filter(Boolean).join(', ');

    const item = document.createElement('div');
    item.className = 'search-item';
    item.innerHTML = `
      <div class="search-item-info">
        <div class="search-item-name">${title}</div>
        <div class="search-item-meta">${subtitle}</div>
      </div>
      <span class="search-item-badge">${place.type}</span>
    `;
    item.onclick = () => selectSuggestedPlace(place, targetType);
    dropdown.appendChild(item);
  });
}

function selectSuggestedPlace(place, targetType) {
  const dropdown = document.getElementById('search-dropdown');
  dropdown.style.display = 'none';

  const lat = parseFloat(place.lat);
  const lng = parseFloat(place.lon);
  const shortName = place.display_name.split(',')[0];

  if (targetType === 'from') {
    originLngLat = [lng, lat];
    document.getElementById('dir-from-input').value = shortName;
    if (activeDestination) {
      calculateActiveRoute(activeDestination.lng, activeDestination.lat, activeDestination.name);
    }
  } else {
    // Target is 'to' or 'search'
    document.getElementById('dir-to-input').value = shortName;
    toggleDirectionsMode(true);

    if (destMarker) destMarker.remove();
    const el = document.createElement('div');
    el.innerHTML = '<div style="width:16px;height:16px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(245,158,11,0.7);transform:translate(-8px,-8px);"></div>';
    destMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);

    map.flyTo({ center: [lng, lat], zoom: 14 });
    calculateActiveRoute(lng, lat, shortName);
  }
}

function toggleDirectionsMode(show) {
  const searchBox = document.getElementById('search-bar-box');
  const dirCard = document.getElementById('directions-card');
  if (show) {
    searchBox.style.display = 'none';
    dirCard.style.display = 'flex';
  } else {
    dirCard.style.display = 'none';
    searchBox.style.display = 'flex';
    clearActiveRoute();
    activeDestination = null;
    originLngLat = null;
  }
}

function setVehicleMode(mode) {
  activeVehicleMode = mode;
  document.getElementById('veh-btn-car').classList.toggle('active', mode === 'car');
  document.getElementById('veh-btn-bike').classList.toggle('active', mode === 'bike');
  document.getElementById('veh-btn-walk').classList.toggle('active', mode === 'walk');
  if (activeDestination) {
    calculateActiveRoute(activeDestination.lng, activeDestination.lat, activeDestination.name);
  }
}

function swapDirections() {
  const fromVal = document.getElementById('dir-from-input').value;
  const toVal = document.getElementById('dir-to-input').value;
  document.getElementById('dir-from-input').value = toVal || 'Your Location (GPS)';
  document.getElementById('dir-to-input').value = fromVal;

  const tempCoord = originLngLat;
  if (activeDestination) {
    originLngLat = [activeDestination.lng, activeDestination.lat];
    if (tempCoord) {
      calculateActiveRoute(tempCoord[0], tempCoord[1], fromVal);
    } else {
      calculateActiveRoute(userLngLat[0], userLngLat[1], 'Current Location');
    }
  }
}

// 1-Tap Anywhere on the Map: Drops Pin & Computes Route
function handleMapDestinationClick(lngLat) {
  if (isNavigating) return;

  if (destMarker) destMarker.remove();

  const el = document.createElement('div');
  el.innerHTML = '<div style="width:16px;height:16px;background:#f59e0b;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(245,158,11,0.7);transform:translate(-8px,-8px);"></div>';

  destMarker = new maplibregl.Marker({ element: el })
    .setLngLat([lngLat.lng, lngLat.lat])
    .addTo(map);

  toggleDirectionsMode(true);
  const label = `Dropped Pin (${lngLat.lat.toFixed(4)}, ${lngLat.lng.toFixed(4)})`;
  document.getElementById('dir-to-input').value = label;
  calculateActiveRoute(lngLat.lng, lngLat.lat, label);
}

async function calculateActiveRoute(destLng, destLat, destName) {
  activeDestination = { lng: destLng, lat: destLat, name: destName };
  const startCoord = originLngLat || userLngLat;

  // Show loading state
  const banner = document.getElementById('route-summary-banner');
  banner.style.display = 'flex';
  document.getElementById('route-eta').innerText = 'Calculating...';
  document.getElementById('route-dist').innerText = 'Finding best route';

  try {
    // OSRM public demo only supports 'driving' and 'foot' — bike uses driving geometry
    const osrmProfile = activeVehicleMode === 'walk' ? 'foot' : 'driving';
    const osrmBase = activeVehicleMode === 'walk'
      ? 'https://router.project-osrm.org/route/v1/foot/'
      : CONFIG.OSRM_ROUTING;
    const url = `${osrmBase}${startCoord[0]},${startCoord[1]};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      document.getElementById('route-eta').innerText = 'No route';
      document.getElementById('route-dist').innerText = 'Could not find a route to this location';
      return;
    }

    const route = data.routes[0];
    renderRouteOnMap(route.geometry);

    const distKm = route.distance / 1000;

    // REALISTIC Indian city speed estimates (OSRM highway speeds are useless for city nav)
    // Car: avg 28 km/h in city traffic  |  Bike: avg 20 km/h  |  Walk: 4.5 km/h
    let avgSpeedKmh = 28;
    if (activeVehicleMode === 'bike') avgSpeedKmh = 20;
    else if (activeVehicleMode === 'walk') avgSpeedKmh = 4.5;

    const realisticMins = Math.round((distKm / avgSpeedKmh) * 60);
    const etaText = realisticMins < 60
      ? `${realisticMins} mins`
      : `${Math.floor(realisticMins / 60)} hr ${realisticMins % 60} min`;

    let modeText = 'Car · City traffic estimate';
    if (activeVehicleMode === 'bike') modeText = 'Bike · City traffic estimate';
    if (activeVehicleMode === 'walk') modeText = 'Walking estimate';

    document.getElementById('route-eta').innerText = etaText;
    document.getElementById('route-dist').innerText = `${distKm.toFixed(1)} km · ${modeText}`;

    // Show Floating Bottom Route & Start Bar (Never hidden, 100% visible)
    const flBar = document.getElementById('floating-route-bar');
    if (flBar) {
      flBar.style.display = 'flex';
      document.getElementById('fl-route-eta').innerText = etaText;
      document.getElementById('fl-route-dist').innerText = `${distKm.toFixed(1)} km`;
      document.getElementById('fl-route-name').innerText = destName;
    }

  } catch (err) {
    console.warn('Routing error:', err);
    document.getElementById('route-eta').innerText = 'Error';
    document.getElementById('route-dist').innerText = 'Could not reach routing server. Check your connection.';
  }
}

function renderRouteOnMap(geojsonGeometry) {
  clearActiveRoute();
  _pendingRouteGeometry = geojsonGeometry; // save for theme-toggle restore

  const routeColor = activeVehicleMode === 'bike' ? '#f59e0b' : '#06b6d4';

  map.addSource('active-route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: geojsonGeometry
    }
  });

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'active-route',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': routeColor,
      'line-width': 7,
      'line-opacity': 0.95
    }
  });

  // Fit camera bounds to route
  const coordinates = geojsonGeometry.coordinates;
  const bounds = coordinates.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coordinates[0], coordinates[0]));
  map.fitBounds(bounds, { padding: 80 });
}

function clearActiveRoute() {
  _pendingRouteGeometry = null;
  if (map.getLayer('route-line')) map.removeLayer('route-line');
  if (map.getSource('active-route')) map.removeSource('active-route');
  if (destMarker) { destMarker.remove(); destMarker = null; }
  const banner = document.getElementById('route-summary-banner');
  if (banner) banner.style.display = 'none';
  const flBar = document.getElementById('floating-route-bar');
  if (flBar) flBar.style.display = 'none';
}

function startDrivingActiveRoute() {
  if (!activeDestination) return;
  const dest = { ...activeDestination };
  const routeGeom = _pendingRouteGeometry;
  toggleDirectionsMode(false);
  const flBar = document.getElementById('floating-route-bar');
  if (flBar) flBar.style.display = 'none';

  // Restore route on map
  if (routeGeom) renderRouteOnMap(routeGeom);
  startNavigation(dest.lng, dest.lat, dest.name, routeGeom);
}

// Global navigation trackers
let navWatchId = null;
let navSimInterval = null;
let _activeNavRoute = null;

function startNavigation(destLng, destLat, destName, routeGeom) {
  isNavigating = true;
  _activeNavRoute = routeGeom;

  // Show HUD
  document.getElementById('nav-hud').style.display = 'flex';
  document.getElementById('nav-hud-action').innerText = `Heading to ${destName}`;
  const initialDist = document.getElementById('route-dist')?.innerText?.split('·')[0]?.trim() || 'Active Route';
  document.getElementById('nav-hud-dist').innerText = initialDist;

  // Tilt camera into 3D navigation perspective
  map.easeTo({
    center: userLngLat,
    zoom: 17,
    pitch: 50,
    bearing: currentHeading || 0,
    duration: 1200
  });

  // Real GPS tracking (with watch ID saved so it can be cleared cleanly)
  if ('geolocation' in navigator) {
    if (navWatchId) navigator.geolocation.clearWatch(navWatchId);
    navWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        userLngLat = [pos.coords.longitude, pos.coords.latitude];
        createUserMarker(userLngLat);
        if (pos.coords.heading) updateCompassHeading(pos.coords.heading);
        map.panTo(userLngLat);
        // Calculate remaining straight-line distance to destination
        const d = calculateDistanceKm(userLngLat[1], userLngLat[0], destLat, destLng);
        document.getElementById('nav-hud-dist').innerText = `${d.toFixed(1)} KM`;
      },
      (err) => console.warn('Nav GPS watch error:', err),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 6000 }
    );
  }
}

// Toggle live drive simulation (so users can preview ride tracking on any device)
function toggleSimulation() {
  const btn = document.getElementById('btn-sim-nav');
  if (navSimInterval) {
    // Stop simulation
    clearInterval(navSimInterval);
    navSimInterval = null;
    if (btn) btn.classList.remove('active');
    return;
  }

  if (!_activeNavRoute || !_activeNavRoute.coordinates || _activeNavRoute.coordinates.length < 2) {
    alert('No active route geometry to simulate.');
    return;
  }

  if (btn) btn.classList.add('active');
  const coords = _activeNavRoute.coordinates;
  let idx = 0;

  navSimInterval = setInterval(() => {
    if (idx >= coords.length) {
      clearInterval(navSimInterval);
      navSimInterval = null;
      if (btn) btn.classList.remove('active');
      alert('You have reached your destination!');
      stopNavigation();
      return;
    }

    const currentCoord = coords[idx];
    userLngLat = currentCoord;
    createUserMarker(userLngLat);
    map.panTo(userLngLat);

    // Calculate heading toward next coordinate
    if (idx < coords.length - 1) {
      const nextCoord = coords[idx + 1];
      const bearing = calculateBearing(currentCoord[1], currentCoord[0], nextCoord[1], nextCoord[0]);
      updateCompassHeading(bearing);
    }

    // Remaining KM
    const remainingSteps = coords.length - idx;
    const totalSteps = coords.length;
    const estRemainingKm = ((remainingSteps / totalSteps) * 5.0).toFixed(1);
    document.getElementById('nav-hud-dist').innerText = `${estRemainingKm} KM`;

    idx += 2; // advance along route
  }, 400);
}

// Distance helper
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

// Bearing helper
function calculateBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin((lon2 - lon1) * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180);
  const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180) -
            Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos((lon2 - lon1) * Math.PI / 180);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function stopNavigation() {
  isNavigating = false;
  if (navWatchId) {
    navigator.geolocation.clearWatch(navWatchId);
    navWatchId = null;
  }
  if (navSimInterval) {
    clearInterval(navSimInterval);
    navSimInterval = null;
  }
  _activeNavRoute = null;

  document.getElementById('nav-hud').style.display = 'none';
  clearActiveRoute();
  map.easeTo({ pitch: 0, bearing: 0, zoom: 14, duration: 800 });
}

// 5. VERIFIED BUSINESSES (Only load from Cloudflare D1 — no fake fallback pins)
async function loadGoldenShops() {
  if (!CONFIG.D1_WORKER) return; // No worker configured — skip silently

  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/api/v1/shops`, {
      headers: { 'Accept': 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        verifiedShops = data;
        renderShopMarkers(verifiedShops);
      }
      // If empty array — no businesses yet — map stays clean. Good.
    }
  } catch (err) {
    // D1 offline or network error — just skip, don't show fake pins
    console.warn('Business pins offline:', err);
  }
}

function renderShopMarkers(shops) {
  shops.forEach((shop) => {
    const el = document.createElement('div');
    el.className = 'golden-shop-pin';
    el.innerHTML = `
      <div class="golden-pin-pulse"></div>
      <div class="golden-pin-badge">
        <span>BIZ</span>
        <span>${shop.name.substring(0, 14)}</span>
      </div>
    `;
    el.onclick = () => onShopPinClicked(shop.id);

    new maplibregl.Marker({ element: el })
      .setLngLat([shop.longitude, shop.latitude])
      .addTo(map);
  });
}

function onShopPinClicked(shopId) {
  const shop = verifiedShops.find(s => s.id === shopId);
  if (!shop) return;

  document.getElementById('place-title').innerText = shop.name;
  document.getElementById('place-subtitle').innerText = shop.tagline || `${shop.category.toUpperCase()} • Verified Local Business`;
  
  const callBtn = document.getElementById('btn-call-place');
  callBtn.style.display = shop.phone ? 'flex' : 'none';
  callBtn.onclick = () => window.open(`tel:${shop.phone}`);

  const waBtn = document.getElementById('btn-wa-place');
  waBtn.style.display = shop.whatsapp ? 'flex' : 'none';
  waBtn.onclick = () => window.open(`https://wa.me/${shop.whatsapp}?text=Hi,%20I%20found%20your%20shop%20on%20Rydealot%20Supermaps!`);

  document.getElementById('btn-start-nav').onclick = () => {
    closeBottomPanel();
    calculateActiveRoute(shop.longitude, shop.latitude, shop.name);
    startDrivingActiveRoute();
  };

  openBottomPanel();
}

// 6. UI HELPERS & NETWORK MONITOR
function initNetworkListeners() {
  const pill = document.getElementById('safety-pill');
  const text = document.getElementById('safety-pill-text');

  function updateStatus() {
    if (!navigator.onLine) {
      // Show prominent offline warning
      pill.className = 'safety-buffer-pill offline';
      pill.style.display = 'flex';
      text.innerText = 'OFFLINE — Map tiles cached, routing unavailable';
    } else {
      // Hide completely when online — don't clutter the map
      pill.style.display = 'none';
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus(); // Run immediately on page load
}

function openBottomPanel() { document.getElementById('bottom-panel').classList.add('active'); }
function closeBottomPanel() { document.getElementById('bottom-panel').classList.remove('active'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function recenterGps() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLngLat = [pos.coords.longitude, pos.coords.latitude];
        createUserMarker(userLngLat);
        drawAccuracyCircle(userLngLat, pos.coords.accuracy);
        map.flyTo({ center: userLngLat, zoom: 16 });
        if (pos.coords.accuracy > 300) showLocationAccuracyWarning(pos.coords.accuracy);
      },
      () => { if (userLngLat) map.flyTo({ center: userLngLat, zoom: 16 }); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  } else if (userLngLat) {
    map.flyTo({ center: userLngLat, zoom: 16 });
  }
}
function selectPlanCard(el) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
}

async function submitShopkeeperClaim(event) {
  event.preventDefault();
  const name = document.getElementById('shop-input-name').value.trim();
  const category = document.getElementById('shop-input-cat').value;
  const phone = document.getElementById('shop-input-phone').value.trim();
  const plan = document.querySelector('.plan-card.selected')?.dataset?.plan || 'trial_3m';
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!name || !phone) return;

  submitBtn.textContent = 'Publishing...';
  submitBtn.disabled = true;

  const payload = {
    name,
    category,
    phone,
    whatsapp: phone,
    tagline: `${category.toUpperCase()} · Verified Local Business`,
    plan_tier: plan,
    is_golden_pin: plan !== 'trial_3m',
    latitude: userLngLat[1],
    longitude: userLngLat[0]
  };

  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      closeModal('modal-shop-claim');
      alert(`Business "${name}" published successfully! It will appear on the map shortly.`);
      loadGoldenShops(); // Refresh pins
    } else {
      alert('Could not publish business. Please try again.');
    }
  } catch (err) {
    alert('No internet connection. Please try again when online.');
  } finally {
    submitBtn.textContent = 'Publish Business Now';
    submitBtn.disabled = false;
  }
}

function setCategoryFilter(category, btnEl) {
  // Highlight active chip
  document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');
  // Filter visible shop markers by category
  if (category === 'all') {
    renderShopMarkers(verifiedShops);
  } else {
    renderShopMarkers(verifiedShops.filter(s => s.category === category));
  }
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.warn(e));
  }
}

// 7. ADMIN GIS OVERLAYS (Custom Roads, Road Demolitions/Blocks, 3D Buildings)
function renderAdminGisOverlays() {
  if (!map) return;

  // Retrieve roads from LocalStorage
  let customRoads = [];
  try {
    const raw = localStorage.getItem('rydealot_custom_roads');
    if (raw) customRoads = JSON.parse(raw);
  } catch (e) {}

  if (!customRoads || customRoads.length === 0) {
    customRoads = [
      {
        id: 'road_001',
        name: 'Warangal North Bypass (4-Lane)',
        surface: 'asphalt',
        status: 'active',
        speed_limit: 80,
        coordinates: [[78.4867, 17.3850], [78.4950, 17.3920], [78.5100, 17.4050]]
      },
      {
        id: 'road_002',
        name: 'Old Bridge Road (Closed for Repairs)',
        surface: 'concrete',
        status: 'blocked',
        speed_limit: 20,
        coordinates: [[78.4720, 17.3780], [78.4780, 17.3810]]
      }
    ];
  }

  // Retrieve buildings from LocalStorage
  let customBuildings = [];
  try {
    const rawBldg = localStorage.getItem('rydealot_custom_buildings');
    if (rawBldg) customBuildings = JSON.parse(rawBldg);
  } catch (e) {}

  if (!customBuildings || customBuildings.length === 0) {
    customBuildings = [
      {
        id: 'bldg_001',
        name: 'Sri Sai Medical Center',
        category: 'hospital',
        status: 'active',
        height_meters: 18,
        floors: 5,
        coordinates: [
          [[78.4870, 17.3860], [78.4880, 17.3860], [78.4880, 17.3870], [78.4870, 17.3870], [78.4870, 17.3860]]
        ]
      }
    ];
  }

  // Cloudflare D1 Cloud Sync (only if brand new worker is configured)
  if (CONFIG.D1_WORKER && navigator.onLine && !renderAdminGisOverlays._isFetching) {
    renderAdminGisOverlays._isFetching = true;
    Promise.all([
      fetch(`${CONFIG.D1_WORKER}/api/v1/roads`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${CONFIG.D1_WORKER}/api/v1/buildings`).then(r => r.ok ? r.json() : []).catch(() => [])
    ]).then(([d1Roads, d1Bldgs]) => {
      renderAdminGisOverlays._isFetching = false;
      let hasUpdates = false;

      if (Array.isArray(d1Roads) && d1Roads.length > 0) {
        const parsedRoads = d1Roads.map(r => ({
          id: r.id,
          name: r.name || r.road_name,
          surface: r.surface || 'asphalt',
          status: r.status || 'active',
          speed_limit: r.speed_limit || 60,
          coordinates: Array.isArray(r.coordinates) ? r.coordinates : (typeof r.coordinates_geojson === 'string' ? JSON.parse(r.coordinates_geojson) : [])
        }));
        localStorage.setItem('rydealot_custom_roads', JSON.stringify(parsedRoads));
        hasUpdates = true;
      }

      if (Array.isArray(d1Bldgs) && d1Bldgs.length > 0) {
        const parsedBldgs = d1Bldgs.map(b => ({
          id: b.id,
          name: b.name || b.building_name,
          category: b.category || 'commercial',
          status: b.status || 'active',
          height_meters: b.height_meters || 15,
          floors: b.floors || Math.max(1, Math.round((b.height_meters || 15) / 3.5)),
          coordinates: Array.isArray(b.coordinates) ? b.coordinates : (typeof b.coordinates_geojson === 'string' ? JSON.parse(b.coordinates_geojson) : [])
        }));
        localStorage.setItem('rydealot_custom_buildings', JSON.stringify(parsedBldgs));
        hasUpdates = true;
      }

      if (hasUpdates) {
        // Silently refresh overlays with Cloud data
        updateGisOverlaysData();
      }
    });
  }

  // Convert roads to GeoJSON
  const roadsGeoJson = {
    type: 'FeatureCollection',
    features: customRoads.map(r => ({
      type: 'Feature',
      properties: {
        id: r.id,
        name: r.name,
        surface: r.surface,
        status: r.status,
        speed_limit: r.speed_limit
      },
      geometry: {
        type: 'LineString',
        coordinates: r.coordinates
      }
    }))
  };

  // Convert buildings to GeoJSON
  const bldgsGeoJson = {
    type: 'FeatureCollection',
    features: customBuildings.map(b => ({
      type: 'Feature',
      properties: {
        id: b.id,
        name: b.name,
        category: b.category,
        status: b.status,
        height_meters: b.height_meters || 15
      },
      geometry: {
        type: 'Polygon',
        coordinates: b.coordinates
      }
    }))
  };

  // Remove existing layers & sources safely
  ['custom-roads-casing', 'custom-roads-core', 'custom-roads-blocked', 'custom-buildings-3d'].forEach(id => {
    if (map.getLayer(id)) map.removeLayer(id);
  });
  if (map.getSource('supermaps-custom-roads')) map.removeSource('supermaps-custom-roads');
  if (map.getSource('supermaps-custom-buildings')) map.removeSource('supermaps-custom-buildings');

  // Add Roads Source & Layers
  map.addSource('supermaps-custom-roads', {
    type: 'geojson',
    data: roadsGeoJson
  });

  map.addLayer({
    id: 'custom-roads-casing',
    type: 'line',
    source: 'supermaps-custom-roads',
    paint: {
      'line-color': '#000000',
      'line-width': 8,
      'line-opacity': 0.8
    }
  });

  map.addLayer({
    id: 'custom-roads-core',
    type: 'line',
    source: 'supermaps-custom-roads',
    filter: ['!=', ['get', 'status'], 'blocked'],
    paint: {
      'line-color': [
        'match',
        ['get', 'surface'],
        'asphalt', '#06b6d4',
        'concrete', '#e2e8f0',
        'mud_dirt', '#d97706',
        '#06b6d4'
      ],
      'line-width': 5
    }
  });

  map.addLayer({
    id: 'custom-roads-blocked',
    type: 'line',
    source: 'supermaps-custom-roads',
    filter: ['==', ['get', 'status'], 'blocked'],
    paint: {
      'line-color': '#ef4444',
      'line-width': 6,
      'line-dasharray': [2, 2]
    }
  });

  // Add Buildings Source & 3D Extrusion Layer
  map.addSource('supermaps-custom-buildings', {
    type: 'geojson',
    data: bldgsGeoJson
  });

  map.addLayer({
    id: 'custom-buildings-3d',
    type: 'fill-extrusion',
    source: 'supermaps-custom-buildings',
    paint: {
      'fill-extrusion-color': [
        'case',
        ['==', ['get', 'status'], 'demolished'], '#ef4444',
        '#f59e0b'
      ],
      'fill-extrusion-height': ['get', 'height_meters'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.85
    }
  });

  // Interactive Popups
  map.on('click', 'custom-roads-core', (e) => {
    const props = e.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="color:#000; font-family:'Plus Jakarta Sans',sans-serif; padding:4px;">
          <strong>${props.name}</strong><br>
          <span style="font-size:0.8rem; color:#475569;">Surface: ${props.surface.toUpperCase()} · Speed: ${props.speed_limit} km/h</span><br>
          <span style="color:#10b981; font-weight:700; font-size:0.75rem;">Admin Verified Active Road</span>
        </div>
      `)
      .addTo(map);
  });

  map.on('click', 'custom-roads-blocked', (e) => {
    const props = e.features[0].properties;
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="color:#000; font-family:'Plus Jakarta Sans',sans-serif; padding:4px;">
          <strong style="color:#ef4444;">${props.name}</strong><br>
          <span style="font-size:0.8rem; color:#ef4444; font-weight:700;">CLOSED FOR REPAIRS / DEMOLISHED</span><br>
          <span style="font-size:0.75rem; color:#475569;">Supermaps routing will bypass this path.</span>
        </div>
      `)
      .addTo(map);
  });

  map.on('click', 'custom-buildings-3d', (e) => {
    const props = e.features[0].properties;
    const isDemolished = props.status === 'demolished';
    new maplibregl.Popup()
      .setLngLat(e.lngLat)
      .setHTML(`
        <div style="color:#000; font-family:'Plus Jakarta Sans',sans-serif; padding:4px;">
          <strong>${props.name}</strong><br>
          <span style="font-size:0.8rem; color:#475569;">Category: ${props.category.toUpperCase()} · Height: ${props.height_meters}m</span><br>
          <span style="color:${isDemolished ? '#ef4444' : '#10b981'}; font-weight:700; font-size:0.75rem;">
            ${isDemolished ? 'DEMOLISHED STRUCTURE' : '3D Building Landmark'}
          </span>
        </div>
      `)
      .addTo(map);
  });
}

function updateGisOverlaysData() {
  if (!map) return;
  const roadsSrc = map.getSource('supermaps-custom-roads');
  const bldgsSrc = map.getSource('supermaps-custom-buildings');

  let customRoads = [];
  try {
    const raw = localStorage.getItem('rydealot_custom_roads');
    if (raw) customRoads = JSON.parse(raw);
  } catch (e) {}

  let customBuildings = [];
  try {
    const rawBldg = localStorage.getItem('rydealot_custom_buildings');
    if (rawBldg) customBuildings = JSON.parse(rawBldg);
  } catch (e) {}

  if (roadsSrc && customRoads.length > 0) {
    roadsSrc.setData({
      type: 'FeatureCollection',
      features: customRoads.map(r => ({
        type: 'Feature',
        properties: { id: r.id, name: r.name, surface: r.surface, status: r.status, speed_limit: r.speed_limit },
        geometry: { type: 'LineString', coordinates: r.coordinates }
      }))
    });
  }

  if (bldgsSrc && customBuildings.length > 0) {
    bldgsSrc.setData({
      type: 'FeatureCollection',
      features: customBuildings.map(b => ({
        type: 'Feature',
        properties: { id: b.id, name: b.name, category: b.category, status: b.status, height_meters: b.height_meters || 15 },
        geometry: { type: 'Polygon', coordinates: b.coordinates }
      }))
    });
  }
}

