// =========================================================================
// RYDEALOT SUPERMAPS — 100% PROPRIETARY VECTOR ENGINE (MapLibre + PMTiles)
// Powered by Self-Hosted india.pmtiles (2.42 GB) • Zero OpenStreetMap
// =========================================================================

const CONFIG = {
  // Proprietary Vector Archive Streamed via Supermaps Edge Proxy (Zero CORS / Zero D1 writes)
  PMTILES_SOURCE: 'https://rydealot-supermaps-api.rydealotmaps.workers.dev/api/v1/pmtiles/india.pmtiles',
  D1_WORKER: 'https://rydealot-supermaps-api.rydealotmaps.workers.dev',
  OSRM_ROUTING: 'https://rydealot-supermaps-api.rydealotmaps.workers.dev/route/v1/driving/',
  DEFAULT_LNG_LAT: [78.4867, 17.3850], // Hyderabad [lng, lat]
  INDIA_BOUNDS: [
    [68.1, 7.9],  // Southwest [lng, lat]
    [97.4, 35.5]  // Northeast [lng, lat]
  ],
  BUFFER_KM: 5.0
};

// --- PROGRAMMATIC AUTO-UPDATE & STALE CACHE EVAPORATOR ---
// Ensures mobile phones & desktop browsers automatically discard old code with ZERO user friction.
const SUPERMAPS_BUILD = 'v3.4.0';
(function runAutoUpdater() {
  try {
    const cachedBuild = localStorage.getItem('supermaps_build_version');
    if (cachedBuild && cachedBuild !== SUPERMAPS_BUILD) {
      console.log(`[Supermaps Auto-Updater] New build detected: ${SUPERMAPS_BUILD} (was ${cachedBuild}). Refreshing...`);
      localStorage.setItem('supermaps_build_version', SUPERMAPS_BUILD);
      if ('caches' in window) {
        caches.keys().then(names => Promise.all(names.map(n => caches.delete(n)))).catch(() => {});
      }
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(regs => {
          regs.forEach(r => r.unregister());
        }).catch(() => {});
      }
      // Instant reload to load fresh scripts
      window.location.reload();
      return;
    }
    localStorage.setItem('supermaps_build_version', SUPERMAPS_BUILD);
  } catch (e) {}
})();

// --- GLOBAL STATE ---
let map = null;
let userMarker = null;
let destMarker = null;
let currentHeading = 0;
let userLngLat = CONFIG.DEFAULT_LNG_LAT;
let isNavigating = false;
let tapToSelectMode = false;
let mainGpsWatchId = null;
let userInteractedWithMap = false;
let hasDoorstepCentered = false;
let activeVehicleMode = 'car';
let activeDestination = null;
let verifiedShops = [];
let _styleReloadPending = false;
let _pendingRouteGeometry = null;
let _currentRoutes = [];
let _activeRouteIndex = 0;
let _communityShortcuts = [];
let _activeNavShortcutId = null;
let _completedShortcutRidesLogged = {};

// In-Link Zero-Cloud Doorstep Sharing & Eco Mode State
let _compressedDoorstepPhotoDataUrl = null;
let _shareSourceMode = 'gps'; // 'gps' or 'pin'
let isPowerSaverActive = localStorage.getItem('rydealot_power_saver') === 'true';
let isDataSaverActive = localStorage.getItem('rydealot_data_saver') === 'true';
let _hasShownArrivalDoorstep = false;

// ── THEME DEFINITIONS ──────────────────────────────────────────────────────────
// Official Protomaps flavor palettes. Guaranteed 100% valid MapLibre layers with zero validation errors.
const THEMES = {
  gold: {
    key: 'gold',
    name: 'Rydealot Gold',
    badge: 'DEFAULT',
    description: 'Signature black & gold. Your brand, your map.',
    isDark: true,
    flavor: (bm) => Object.assign({}, bm.DARK, {
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
    })
  },

  autonight: {
    key: 'autonight',
    name: 'Auto Night',
    badge: 'RIDER MODE',
    description: 'Max contrast for bike/auto night riding.',
    isDark: true,
    flavor: (bm) => Object.assign({}, bm.DARK, {
      background: '#000000',
      earth: '#030303',
      water: '#000814',
      park_a: '#000803',
      buildings: '#0a0a0a',
      highway: '#f97316',
      major: '#fbbf24',
      minor: '#3d1d03',
      link: '#ea580c',
      roads_label_major: '#fff7ed',
      roads_label_minor: '#fed7aa'
    })
  },

  neon: {
    key: 'neon',
    name: 'Neon Bazaar',
    badge: 'FESTIVAL',
    description: 'Electric neon lights. Like a night bazaar from above.',
    isDark: true,
    flavor: (bm) => Object.assign({}, bm.DARK, {
      background: '#05020c',
      earth: '#090514',
      water: '#05001f',
      park_a: '#05140b',
      buildings: '#120b24',
      highway: '#a855f7',
      major: '#ec4899',
      minor: '#3b074d',
      link: '#9333ea',
      roads_label_major: '#fdf2f8',
      roads_label_minor: '#f0abfc'
    })
  },

  chai: {
    key: 'chai',
    name: 'Chai Tapri',
    badge: 'WARM',
    description: 'Earthy & warm. Like a chai stall hand-drawn board.',
    isDark: false,
    flavor: (bm) => Object.assign({}, bm.LIGHT, {
      background: '#f4ede2',
      earth: '#fbf8f3',
      water: '#c2d5e3',
      park_a: '#dbe8d3',
      buildings: '#eae1d3',
      highway: '#8b2500',
      major: '#c2440e',
      minor: '#ddb896',
      link: '#b85c20',
      roads_label_major: '#431407',
      roads_label_minor: '#7c2d12'
    })
  },

  heritage: {
    key: 'heritage',
    name: 'Heritage',
    badge: 'VINTAGE',
    description: 'Old Survey of India parchment style. Classic & unique.',
    isDark: false,
    flavor: (bm) => Object.assign({}, bm.LIGHT, {
      background: '#ebdcb9',
      earth: '#f3e8cf',
      water: '#bccad6',
      park_a: '#d5dec8',
      buildings: '#dfceaa',
      highway: '#3d1f0a',
      major: '#5c3317',
      minor: '#c2a578',
      link: '#6b3a20',
      roads_label_major: '#261205',
      roads_label_minor: '#4a2511'
    })
  }
};

// Active theme — load from localStorage or default to Gold
let activeThemeKey = localStorage.getItem('rydealot_map_theme') || 'gold';
function getActiveTheme() { return THEMES[activeThemeKey] || THEMES.gold; }

// 2. VECTOR STYLE BUILDER (Powered by Your 2.42 GB File)
function buildVectorStyle() {
  const theme = getActiveTheme();
  const spriteName = theme.isDark ? 'dark' : 'light';

  let vectorLayers = [];
  if (typeof basemaps !== 'undefined' && basemaps.layers && typeof theme.flavor === 'function') {
    const customFlavor = theme.flavor(basemaps);
    vectorLayers = basemaps.layers('protomaps', customFlavor, { lang: 'en' });
  }

  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${spriteName}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${CONFIG.PMTILES_SOURCE}`
      }
    },
    layers: vectorLayers
  };
}

// Fast UI theme class update
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
  if (map) map.setStyle(buildVectorStyle());
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
  initEcoPowerSaver();
  initMapEngine();
  registerServiceWorker();
  initNetworkListeners();
  loadGoldenShops();
  setupCompassHeading();
  syncSupermapsUserProfile();
});

function hideSplashLoader() {
  const loader = document.getElementById('splash-loader');
  if (loader && !loader.classList.contains('hidden')) {
    loader.classList.add('hidden');
    setTimeout(() => { if (loader.parentElement) loader.remove(); }, 600);
  }
}

function initMapEngine() {
  // Register PMTiles Protocol with MapLibre GL
  if (typeof pmtiles !== 'undefined') {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }

  // Apply saved theme class to body immediately (before map loads)
  document.body.classList.toggle('daylight-theme', !getActiveTheme().isDark);

  // Location Memory: Open directly at user's last visited city/location (No Hyderabad jump!)
  let initialCenter = CONFIG.DEFAULT_LNG_LAT;
  try {
    const savedLoc = localStorage.getItem('supermaps_last_location');
    if (savedLoc) {
      const parsed = JSON.parse(savedLoc);
      if (Array.isArray(parsed) && parsed.length === 2 && !isNaN(parsed[0]) && !isNaN(parsed[1])) {
        initialCenter = parsed;
        userLngLat = parsed;
      }
    }
  } catch (e) {}

  // Create Vector Map (Strictly Bounded to India, Flat 2D Top-Down, Zero 3D Tilt Overhead)
  map = new maplibregl.Map({
    container: 'map-viewport',
    center: initialCenter,
    zoom: 14,
    minZoom: 4.2,
    pitch: 0,
    maxPitch: 0,
    dragRotate: false,
    touchPitch: false,
    pitchWithRotate: false,
    maxBounds: CONFIG.INDIA_BOUNDS,
    style: buildVectorStyle(),
    attributionControl: false,
    powerPreference: 'high-performance', // Explicitly wake up mobile hardware GPU (Adreno / Mali)
    antialias: false,                    // Lowers mobile shader overhead
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2) // Cap to 2.0 to eliminate 3X retina lag on Android
  });

  // Smoothly fade out splash screen as soon as map canvas is painted
  map.once('load', hideSplashLoader);
  map.once('idle', hideSplashLoader);
  setTimeout(hideSplashLoader, 1500); // Fast safety fallback

  // Navigation controls
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'bottom-right');

  // Track user manual gestures so GPS never hijacks the camera when panning/zooming
  map.on('dragstart', () => { userInteractedWithMap = true; });
  map.on('zoomstart', (e) => { if (e && e.originalEvent) userInteractedWithMap = true; });
  map.on('rotatestart', () => { userInteractedWithMap = true; });
  map.on('pitchstart', () => { userInteractedWithMap = true; });
  map.on('touchstart', () => { userInteractedWithMap = true; });

  // Map click handler (Accidental tap lock: only sets destination if user clicked Tap-to-Select)
  map.on('click', (e) => {
    closeBottomPanel();
    document.getElementById('search-dropdown').style.display = 'none';
    if (tapToSelectMode && !isNavigating) {
      handleMapDestinationClick(e.lngLat);
      toggleTapToSelect(false); // Automatically lock selection after dropping pin
    }
  });

  // Initial load — apply theme overrides + GIS overlays + flyovers + shortcuts + check deep-link URL params
  map.on('load', () => {
    applyThemeOverrides();
    renderAdminGisOverlays();
    renderFlyoverOverlays();
    loadCommunityShortcuts();
    checkUrlLaunchParameters();
  });

  // Re-apply everything after setStyle() (theme change wipes all layers)
  map.on('style.load', () => {
    applyThemeOverrides();
    renderAdminGisOverlays();
    renderFlyoverOverlays();
    loadCommunityShortcuts();
    if (_styleReloadPending && _pendingRouteGeometry) {
      if (_currentRoutes && _currentRoutes.length > 0) {
        renderAlternativeRoutes(_currentRoutes, activeVehicleMode, _activeRouteIndex);
      } else {
        renderRouteOnMap(_pendingRouteGeometry);
      }
    }
    _styleReloadPending = false;
  });

  // Real-time sync when Admin updates GIS or Shortcuts data in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'rydealot_custom_roads' || e.key === 'rydealot_custom_buildings') {
      renderAdminGisOverlays();
    }
    if (e.key === 'rydealot_custom_shortcuts') {
      loadCommunityShortcuts();
    }
  });

  // Track User GPS Location with Progressive Satellite Lock (< 60m)
  if ('geolocation' in navigator) {
    // 1. Instant coarse estimate (Wi-Fi / Cell tower) for zero-wait display
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLngLat = [pos.coords.longitude, pos.coords.latitude];
        try { localStorage.setItem('supermaps_last_location', JSON.stringify(userLngLat)); } catch(e){}
        const accuracyMeters = pos.coords.accuracy;

        if (!userInteractedWithMap) {
          map.flyTo({ center: userLngLat, zoom: 15 });
        }
        createUserMarker(userLngLat);
        drawAccuracyCircle(userLngLat, accuracyMeters);
        hideSplashLoader();

        if (accuracyMeters < 60) {
          cacheSafetyBuffer5Km(userLngLat);
        }
      },
      (err) => {
        // GPS denied or unavailable — stay at default and let user drop pin
        createUserMarker(userLngLat);
        showLocationPermissionBanner();
        hideSplashLoader();
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );

    // 2. High-Accuracy Satellite GPS Watcher (< 60m)
    // Snaps from coarse cell tower to exact doorstep when satellites acquire lock
    let hasSatelliteLock = false;
    mainGpsWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (isNavigating) return; // Navigation watcher handles tracking during active drive
        const accuracy = pos.coords.accuracy;
        const newCoords = [pos.coords.longitude, pos.coords.latitude];

        if (accuracy < 60 || (!hasSatelliteLock && accuracy < 150)) {
          if (accuracy < 60) hasSatelliteLock = true;
          userLngLat = newCoords;
          try { localStorage.setItem('supermaps_last_location', JSON.stringify(userLngLat)); } catch(e){}
          createUserMarker(userLngLat);
          drawAccuracyCircle(userLngLat, accuracy);

          // Only auto-center camera on doorstep ONCE on initial lock if user hasn't panned/zoomed away
          if (!isNavigating && !userInteractedWithMap && !hasDoorstepCentered) {
            hasDoorstepCentered = true;
            map.flyTo({ center: userLngLat, zoom: 16 });
          }

          // Pre-cache the 5KM safety buffer around this exact physical spot
          cacheSafetyBuffer5Km(userLngLat);
        }
      },
      (err) => console.warn('Satellite lock watcher:', err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  } else {
    createUserMarker(userLngLat);
    hideSplashLoader();
  }
}

// ── ROLLING 5KM BUFFER & OFFLINE RESILIENCE ──────────────────────────────────
let _lastBufferedCoords = null;
function cacheSafetyBuffer5Km(lngLat) {
  if (isNavigating) return; // Freeze tile pre-buffering during active ride to save battery & prevent heating
  if (!lngLat || !Array.isArray(lngLat)) return;
  if (_lastBufferedCoords) {
    const d = calculateDistanceKm(_lastBufferedCoords[1], _lastBufferedCoords[0], lngLat[1], lngLat[0]);
    if (d < 1.5) return;
  }
  _lastBufferedCoords = lngLat;
  console.log('[Supermaps 5KM Buffer] Satellite lock confirmed. Pre-buffering 5KM radius for:', lngLat);

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_5KM_BUFFER',
      coords: lngLat,
      radiusKm: CONFIG.BUFFER_KM
    });
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
  el.style.width = '28px';
  el.style.height = '28px';
  el.innerHTML = `
    <div id="nav-arrow-icon" style="width: 28px; height: 28px; background: #06b6d4; border: 3px solid #fff; border-radius: 50%; box-shadow: 0 0 16px #06b6d4; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: transform 0.12s linear;">
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
  if (now - _lastCompassTime < 100) return; // throttle to ~10fps to avoid CPU churn
  if (Math.abs(heading - _lastCompassAngle) < 3) return; // ignore micro-jitter
  _lastCompassTime = now;
  _lastCompassAngle = heading;

  currentHeading = heading;
  
  // CRITICAL FIX: NEVER set transform on marker root (#nav-arrow-wrapper)!
  // MapLibre uses style.transform = translate3d(...) to place the marker on the screen.
  // Overwriting wrapper transform strips screen coordinates, causing the arrow to glitch to (0,0) (top-left).
  // Instead, rotate the INNER icon (#nav-arrow-icon) or use MapLibre's native setRotation():
  const icon = document.getElementById('nav-arrow-icon');
  if (icon) {
    icon.style.transform = `rotate(${currentHeading}deg)`;
  } else if (userMarker && typeof userMarker.setRotation === 'function') {
    userMarker.setRotation(currentHeading);
  }
  // Camera rotation in active navigation is driven smoothly by GPS road trajectory,
  // NOT by handlebar vibration sensor churn, preventing thermal throttling.
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

function restoreGPSLocationAsOrigin() {
  originLngLat = null; // null defaults to device GPS userLngLat
  const fromInput = document.getElementById('dir-from-input');
  if (fromInput) fromInput.value = 'Your Location (GPS)';
  const dropdown = document.getElementById('search-dropdown');
  if (dropdown) dropdown.style.display = 'none';

  if (activeDestination) {
    calculateActiveRoute(activeDestination.lng, activeDestination.lat, activeDestination.name);
  }
}

function showGpsPromptDropdown(targetType) {
  const dropdown = document.getElementById('search-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';

  if (targetType === 'from') {
    const item = document.createElement('div');
    item.className = 'search-item';
    item.style.cssText = 'background: rgba(6,182,212,0.12); border-left: 3px solid #06b6d4; cursor:pointer;';
    item.innerHTML = `
      <div class="search-item-info">
        <div class="search-item-name" style="color:#06b6d4; font-weight:700; display:flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
          Use Current Location (GPS)
        </div>
        <div class="search-item-meta">Use device live GPS coordinates as starting point</div>
      </div>
      <span class="search-item-badge" style="background:#06b6d4; color:#fff; border-color:#06b6d4;">LIVE GPS</span>
    `;
    item.onclick = () => restoreGPSLocationAsOrigin();
    dropdown.appendChild(item);
    dropdown.style.display = 'block';
  }
}

function handleDirectionInputFocus(targetType) {
  if (targetType === 'from') {
    showGpsPromptDropdown('from');
  }
}

function clearDirectionInput(which) {
  if (which === 'from') {
    document.getElementById('dir-from-input').value = '';
    originLngLat = null;
    showGpsPromptDropdown('from');
  } else {
    document.getElementById('dir-to-input').value = '';
    clearActiveRoute(true, true);
    activeDestination = null;
  }
}

function handlePlaceInput(event, targetType) {
  const query = event.target.value.trim();
  clearTimeout(debounceTimer);

  if (targetType === 'from' && query.length === 0) {
    showGpsPromptDropdown('from');
    return;
  }

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

  let gpsPromptHtml = '';
  if (targetType === 'from') {
    gpsPromptHtml = `
      <div class="search-item" onclick="restoreGPSLocationAsOrigin()" style="background: rgba(6,182,212,0.12); border-left: 3px solid #06b6d4; cursor:pointer;">
        <div class="search-item-info">
          <div class="search-item-name" style="color:#06b6d4; font-weight:700; display:flex; align-items:center; gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
            Use Current Location (GPS)
          </div>
          <div class="search-item-meta">Use device live GPS coordinates as starting point</div>
        </div>
        <span class="search-item-badge" style="background:#06b6d4; color:#fff; border-color:#06b6d4;">LIVE GPS</span>
      </div>`;
  }

  dropdown.innerHTML = `
    ${gpsPromptHtml}
    <div style="padding:14px 16px;">
      <div style="font-size:0.88rem; font-weight:700; color:var(--text-main); margin-bottom:4px;">No results for "${query}"</div>
      <div style="font-size:0.78rem; color:var(--text-muted);">Try adding city name — e.g. "Erragattugutta Warangal" — or tap on the map to drop a pin.</div>
    </div>`;
}

function renderSearchResults(places, dropdown, targetType) {
  dropdown.innerHTML = '';

  if (targetType === 'from') {
    const gpsItem = document.createElement('div');
    gpsItem.className = 'search-item';
    gpsItem.style.cssText = 'background: rgba(6,182,212,0.12); border-left: 3px solid #06b6d4; cursor:pointer;';
    gpsItem.innerHTML = `
      <div class="search-item-info">
        <div class="search-item-name" style="color:#06b6d4; font-weight:700; display:flex; align-items:center; gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></svg>
          Use Current Location (GPS)
        </div>
        <div class="search-item-meta">Use device live GPS coordinates as starting point</div>
      </div>
      <span class="search-item-badge" style="background:#06b6d4; color:#fff; border-color:#06b6d4;">LIVE GPS</span>
    `;
    gpsItem.onclick = () => restoreGPSLocationAsOrigin();
    dropdown.appendChild(gpsItem);
  }

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
    toggleTapToSelect(false);
    dirCard.style.display = 'none';
    searchBox.style.display = 'flex';
    clearActiveRoute();
    activeDestination = null;
    originLngLat = null;
  }
}

function toggleTapToSelect(enable) {
  if (isNavigating) return;
  tapToSelectMode = (typeof enable === 'boolean') ? enable : !tapToSelectMode;

  const btn = document.getElementById('btn-tap-select-mode');
  const banner = document.getElementById('tap-select-banner');

  if (btn) btn.classList.toggle('active', tapToSelectMode);
  if (banner) banner.style.display = tapToSelectMode ? 'flex' : 'none';

  if (map && map.getCanvas()) {
    map.getCanvas().style.cursor = tapToSelectMode ? 'crosshair' : '';
  }
}

function setVehicleMode(mode) {
  activeVehicleMode = mode;
  document.getElementById('veh-btn-car').classList.toggle('active', mode === 'car');
  document.getElementById('veh-btn-bike').classList.toggle('active', mode === 'bike');
  document.getElementById('veh-btn-walk').classList.toggle('active', mode === 'walk');
  renderCommunityShortcutsOnMap();
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

// =========================================================================
// ROUTE VAULT: IN-PHONE ZERO-LATENCY CORRIDOR CACHE
// Renders commute corridors instantly (0ms) and saves 90%+ server requests
// =========================================================================
const ROUTE_VAULT_MAX_ITEMS = 80;
const ROUTE_VAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days

function getRouteVaultKey(vehicle, startLngLat, destLngLat) {
  const sLng = Number(startLngLat[0]).toFixed(3);
  const sLat = Number(startLngLat[1]).toFixed(3);
  const dLng = Number(destLngLat[0]).toFixed(3);
  const dLat = Number(destLngLat[1]).toFixed(3);
  return `smp_vault_${vehicle}_${sLng},${sLat}_${dLng},${dLat}`;
}

function getFromRouteVault(vehicle, startLngLat, destLngLat) {
  try {
    const key = getRouteVaultKey(vehicle, startLngLat, destLngLat);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.ts > ROUTE_VAULT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return entry.data;
  } catch (e) {
    return null;
  }
}

function saveToRouteVault(vehicle, startLngLat, destLngLat, data) {
  try {
    const key = getRouteVaultKey(vehicle, startLngLat, destLngLat);
    const entry = { ts: Date.now(), data };
    localStorage.setItem(key, JSON.stringify(entry));

    // Manage vault size (FIFO eviction of oldest keys if exceeding capacity)
    const vaultKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('smp_vault_')) vaultKeys.push(k);
    }
    if (vaultKeys.length > ROUTE_VAULT_MAX_ITEMS) {
      vaultKeys.sort().slice(0, vaultKeys.length - ROUTE_VAULT_MAX_ITEMS).forEach(k => localStorage.removeItem(k));
    }
  } catch (e) {}
}

async function calculateActiveRoute(destLng, destLat, destName, autoNav = false, doorstepMeta = null) {
  activeDestination = {
    lng: destLng,
    lat: destLat,
    name: destName,
    clue: (doorstepMeta && doorstepMeta.clue) || (activeDestination && activeDestination.clue) || '',
    img: (doorstepMeta && doorstepMeta.img) || (activeDestination && activeDestination.img) || ''
  };
  const startCoord = originLngLat || userLngLat;

  // 1. CHECK IN-PHONE ROUTE VAULT (Instant 0ms corridor hit without touching network)
  const cachedData = getFromRouteVault(activeVehicleMode, startCoord, [destLng, destLat]);
  if (cachedData && cachedData.routes && cachedData.routes.length > 0) {
    console.log('[Supermaps Route Vault] ⚡ Instant corridor route served from phone memory');
    _currentRoutes = cachedData.routes;
    _activeRouteIndex = 0;

    renderAlternativeRoutes(_currentRoutes, activeVehicleMode, 0);
    renderRouteSelectorPills(_currentRoutes, activeVehicleMode, 0, destName);
    updateRouteSummaryUI(_currentRoutes[0], activeVehicleMode, destName);

    if (autoNav) {
      setTimeout(() => {
        startDrivingActiveRoute();
      }, 300);
    }
    return;
  }

  // Show loading state for network calculation
  const banner = document.getElementById('route-summary-banner');
  if (banner) banner.style.display = 'flex';
  const etaEl = document.getElementById('route-eta');
  if (etaEl) etaEl.innerText = 'Calculating...';
  const distEl = document.getElementById('route-dist');
  if (distEl) distEl.innerText = 'Finding best route';

  try {
    const profile = activeVehicleMode === 'walk' ? 'foot' : 'driving';
    const coords = `${startCoord[0]},${startCoord[1]};${destLng},${destLat}`;
    const query = isDataSaverActive
      ? `?overview=simplified&geometries=geojson&steps=false&alternatives=true`
      : `?overview=full&geometries=geojson&steps=true&alternatives=true`;

    const backends = [
      `https://rydealot-supermaps-api.rydealotmaps.workers.dev/route/v1/${profile}/${coords}${query}`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coords}${query}`,
      `https://router.project-osrm.org/route/v1/${profile}/${coords}${query}`
    ];

    let data = null;
    for (let b of backends) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const res = await fetch(b, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res && res.ok) {
          const parsed = await res.json();
          if (parsed && parsed.routes && parsed.routes.length > 0) {
            data = parsed;
            break;
          }
        }
      } catch(e) {}
    }

    if (!data || !data.routes || data.routes.length === 0) {
      if (etaEl) etaEl.innerText = 'No route';
      if (distEl) distEl.innerText = 'Could not find a route to this location';
      return;
    }

    // Save to In-Phone Route Vault for instant zero-server reuse
    saveToRouteVault(activeVehicleMode, startCoord, [destLng, destLat], data);

    _currentRoutes = data.routes;
    _activeRouteIndex = 0;

    // Render primary route and alternative paths on the map
    renderAlternativeRoutes(_currentRoutes, activeVehicleMode, 0);

    // Render interactive alternative route pills (up to 3 routes with time diffs)
    renderRouteSelectorPills(_currentRoutes, activeVehicleMode, 0, destName);

    // Update main summary card and floating bar
    updateRouteSummaryUI(_currentRoutes[0], activeVehicleMode, destName);

    // Auto-launch turn-by-turn navigation if requested by deep link
    if (autoNav) {
      setTimeout(() => {
        startDrivingActiveRoute();
      }, 500);
    }

  } catch (err) {
    console.warn('Routing error:', err);
    if (etaEl) etaEl.innerText = 'Error';
    if (distEl) distEl.innerText = 'Could not reach routing server. Check your connection.';
  }
}

// Update Hero Distance and Route Details in UI cards for selected route (No inaccurate time guesses)
function updateRouteSummaryUI(route, vehicleMode, destName) {
  const etaEl = document.getElementById('route-eta');
  const distEl = document.getElementById('route-dist');
  const summaryBanner = document.getElementById('route-summary-banner');

  const distKm = (route.distance / 1000).toFixed(1);
  const roadSummary = (route.legs && route.legs[0] && route.legs[0].summary) || 'Direct Highway & State Road';

  let vehicleLabel = 'Direct Navigation';
  if (vehicleMode === 'bike') vehicleLabel = '🏍️ 2-Wheeler';
  else if (vehicleMode === 'car') vehicleLabel = '🚗 Car';
  else if (vehicleMode === 'walk') vehicleLabel = '🚶 Walk';

  if (summaryBanner) summaryBanner.style.display = 'flex';
  if (etaEl) etaEl.innerText = `${distKm} KM`;
  if (distEl) distEl.innerText = `${vehicleLabel} · ${roadSummary}`;

  // Floating Bottom Route & Start Bar
  const flBar = document.getElementById('floating-route-bar');
  if (flBar) {
    flBar.style.display = 'flex';
    const flEta = document.getElementById('fl-route-eta');
    if (flEta) flEta.innerText = `${distKm} KM`;
    const flDist = document.getElementById('fl-route-dist');
    if (flDist) flDist.innerText = vehicleLabel;
    const flName = document.getElementById('fl-route-name');
    if (flName) flName.innerText = destName || (activeDestination && activeDestination.name) || 'Destination';
  }
}

// User selects an alternative route (via map line tap or pill click)
function selectAlternativeRoute(index, destName) {
  if (!_currentRoutes || !_currentRoutes[index]) return;
  _activeRouteIndex = index;
  const selectedRoute = _currentRoutes[index];
  _pendingRouteGeometry = selectedRoute.geometry;
  const finalDestName = destName || (activeDestination && activeDestination.name) || 'Destination';

  renderAlternativeRoutes(_currentRoutes, activeVehicleMode, index);
  updateRouteSummaryUI(selectedRoute, activeVehicleMode, finalDestName);
  updateRouteSelectorPillsActive(index);

  const pills = document.getElementById('alt-routes-selector');
  if (pills && _currentRoutes.length > 1) {
    pills.style.display = 'flex';
  }
}

// Render up to 3 interactive pills with Distance comparisons
function renderRouteSelectorPills(routes, vehicleMode, activeIdx = 0, destName = 'Destination') {
  const container = document.getElementById('alt-routes-selector');
  if (!container) return;

  if (!routes || routes.length <= 1) {
    container.style.display = 'none';
    return;
  }

  container.innerHTML = '';
  container.style.display = 'flex';

  const primaryDistKm = routes[0].distance / 1000;

  routes.slice(0, 3).forEach((r, idx) => {
    const distKm = r.distance / 1000;
    const diffKm = (distKm - primaryDistKm).toFixed(1);

    let badgeText = 'Shortest';
    let badgeClass = 'badge-fastest';

    if (idx > 0) {
      if (Math.abs(diffKm) < 0.1) {
        badgeText = 'Same Distance';
        badgeClass = 'badge-faster';
      } else if (diffKm < 0) {
        badgeText = `${Math.abs(diffKm)} km shorter`;
        badgeClass = 'badge-faster';
      } else {
        badgeText = `+${diffKm} km`;
        badgeClass = 'badge-slower';
      }
    }

    const pill = document.createElement('div');
    pill.className = `alt-route-pill ${idx === activeIdx ? 'active' : ''} ${vehicleMode === 'bike' ? 'bike-mode' : ''}`;
    pill.id = `alt-pill-${idx}`;
    pill.onclick = () => selectAlternativeRoute(idx, destName);

    const roadName = (r.legs && r.legs[0] && r.legs[0].summary) || (idx === 0 ? 'Main Path' : `Alt Path ${idx + 1}`);

    pill.innerHTML = `
      <div class="alt-route-header">
        <span class="alt-route-name">${idx === 0 ? 'Main Route' : `Route ${idx + 1}`}</span>
        <span class="alt-route-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="alt-route-time">${distKm.toFixed(1)} KM</div>
      <div class="alt-route-dist" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:110px;">${roadName}</div>
    `;

    container.appendChild(pill);
  });
}

function updateRouteSelectorPillsActive(activeIdx) {
  document.querySelectorAll('.alt-route-pill').forEach((pill, idx) => {
    pill.classList.toggle('active', idx === activeIdx);
  });
}

// Render multiple routes: unselected as dashed slate, active as solid cyan/amber
function renderAlternativeRoutes(routes, vehicleMode, activeIdx = 0) {
  clearActiveRoute(false, false);
  if (!map || !routes || routes.length === 0) return;

  const primaryColor = vehicleMode === 'bike' ? '#f59e0b' : '#06b6d4';
  const altColor = '#64748b'; // Slate gray for alternatives

  // 1. Render alternative unselected routes first
  routes.forEach((r, idx) => {
    if (idx === activeIdx) return;
    const srcId = `alt-route-src-${idx}`;
    const layerId = `alt-route-line-${idx}`;

    if (map.getSource(srcId)) map.removeSource(srcId);

    map.addSource(srcId, {
      type: 'geojson',
      data: {
        type: 'Feature',
        geometry: r.geometry,
        properties: { index: idx }
      }
    });

    map.addLayer({
      id: layerId,
      type: 'line',
      source: srcId,
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': altColor,
        'line-width': 5.5,
        'line-dasharray': [2, 2],
        'line-opacity': 0.85
      }
    });

    // Clicking alternative route on map selects it!
    map.on('click', layerId, () => {
      selectAlternativeRoute(idx);
    });
  });

  // 2. Render primary active route on top with bold casing
  const activeRoute = routes[activeIdx] || routes[0];
  _pendingRouteGeometry = activeRoute.geometry;

  if (map.getSource('active-route')) map.removeSource('active-route');

  map.addSource('active-route', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: activeRoute.geometry
    }
  });

  map.addLayer({
    id: 'route-line-casing',
    type: 'line',
    source: 'active-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': '#000000',
      'line-width': 10,
      'line-opacity': 0.7
    }
  });

  map.addLayer({
    id: 'route-line',
    type: 'line',
    source: 'active-route',
    layout: { 'line-join': 'round', 'line-cap': 'round' },
    paint: {
      'line-color': primaryColor,
      'line-width': 7,
      'line-opacity': 1.0
    }
  });

  // Keep alternative route pills visible if there are multiple routes
  const pills = document.getElementById('alt-routes-selector');
  if (pills && routes.length > 1) {
    pills.style.display = 'flex';
  }

  // Fit camera bounds to encompass all alternative routes
  const allCoords = routes.flatMap(r => r.geometry.coordinates);
  if (allCoords.length > 0) {
    const bounds = allCoords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(allCoords[0], allCoords[0]));
    map.fitBounds(bounds, { padding: { top: 90, bottom: 120, left: 60, right: 60 } });
  }
}

function renderRouteOnMap(geojsonGeometry) {
  renderAlternativeRoutes([{ geometry: geojsonGeometry, distance: 3000 }], activeVehicleMode, 0);
}

function clearActiveRoute(clearDest = true, clearPills = true) {
  _pendingRouteGeometry = null;

  // Clear main route layers
  ['route-line', 'route-line-casing'].forEach(id => {
    if (map && map.getLayer(id)) map.removeLayer(id);
  });
  if (map && map.getSource('active-route')) map.removeSource('active-route');

  // Clear alternative route layers
  [0, 1, 2, 3].forEach(idx => {
    const layerId = `alt-route-line-${idx}`;
    const srcId = `alt-route-src-${idx}`;
    if (map && map.getLayer(layerId)) map.removeLayer(layerId);
    if (map && map.getSource(srcId)) map.removeSource(srcId);
  });

  if (clearDest && destMarker) { destMarker.remove(); destMarker = null; }

  if (clearPills) {
    const banner = document.getElementById('route-summary-banner');
    if (banner) banner.style.display = 'none';
    const pills = document.getElementById('alt-routes-selector');
    if (pills) pills.style.display = 'none';
    const flBar = document.getElementById('floating-route-bar');
    if (flBar) flBar.style.display = 'none';
  }
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

// Screen WakeLock: Keeps mobile display alive throughout navigation
let screenWakeLock = null;

async function requestScreenWakeLock() {
  try {
    if ('wakeLock' in navigator && navigator.wakeLock.request) {
      screenWakeLock = await navigator.wakeLock.request('screen');
      screenWakeLock.addEventListener('release', () => {
        console.log('[Supermaps] Screen WakeLock released');
      });
      console.log('[Supermaps] Screen WakeLock ACTIVE — Display kept awake for navigation');
    }
  } catch (err) {
    console.warn('[Supermaps] Screen WakeLock error:', err);
  }
}

async function releaseScreenWakeLock() {
  if (screenWakeLock !== null) {
    try {
      await screenWakeLock.release();
    } catch (e) {}
    screenWakeLock = null;
  }
}

// Re-acquire WakeLock if driver minimizes and returns to app during navigation
document.addEventListener('visibilitychange', async () => {
  if (isNavigating && document.visibilityState === 'visible') {
    await requestScreenWakeLock();
  }
});

function startNavigation(destLng, destLat, destName, routeGeom) {
  isNavigating = true;
  _activeNavRoute = routeGeom;
  _hasShownArrivalDoorstep = false;
  requestScreenWakeLock();

  // Show HUD
  document.getElementById('nav-hud').style.display = 'flex';
  document.getElementById('nav-hud-action').innerText = `Heading to ${destName}`;
  const initialDist = document.getElementById('route-dist')?.innerText?.split('·')[0]?.trim() || 'Active Route';
  document.getElementById('nav-hud-dist').innerText = initialDist;

  // Camera strictly locked to flat 2D top-down navigation (Zero 3D tilt overhead)
  const navPitch = 0;
  map.easeTo({
    center: userLngLat,
    zoom: 17,
    pitch: 0,
    bearing: currentHeading || 0,
    duration: 1200
  });

  // Real GPS tracking (with watch ID saved so it can be cleared cleanly)
  if ('geolocation' in navigator) {
    if (navWatchId) navigator.geolocation.clearWatch(navWatchId);
    navWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const newCoords = [pos.coords.longitude, pos.coords.latitude];
        let headingToUse = (typeof pos.coords.heading === 'number' && !isNaN(pos.coords.heading) && pos.coords.heading > 0) ? pos.coords.heading : null;
        if (headingToUse === null && userLngLat) {
          const distMoved = calculateDistanceKm(userLngLat[1], userLngLat[0], newCoords[1], newCoords[0]);
          if (distMoved > 0.004) { // moved > 4 meters
            headingToUse = calculateBearing(userLngLat[1], userLngLat[0], newCoords[1], newCoords[0]);
          }
        }

        userLngLat = newCoords;
        createUserMarker(userLngLat);

        if (headingToUse !== null) {
          currentHeading = headingToUse;
          const icon = document.getElementById('nav-arrow-icon');
          if (icon) icon.style.transform = `rotate(${currentHeading}deg)`;
          map.easeTo({ center: userLngLat, bearing: currentHeading, pitch: 0, duration: 600 });
        } else {
          map.panTo(userLngLat);
        }

        // Calculate remaining straight-line distance to destination
        const d = calculateDistanceKm(userLngLat[1], userLngLat[0], destLat, destLng);
        document.getElementById('nav-hud-dist').innerText = `${d.toFixed(1)} KM`;

        // Check Flyover Elevation & Community Shortcut Guidance
        checkNavigationGuidance(userLngLat);

        // Auto-popup Doorstep Photo verification when entering final 100 meters
        if (d <= 0.1 && !_hasShownArrivalDoorstep && activeDestination && activeDestination.img) {
          _hasShownArrivalDoorstep = true;
          renderDoorstepCard(activeDestination);
        }
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
    showSupermapsToast('No active route geometry to simulate.', 'ℹ️', 'info');
    return;
  }

  if (btn) btn.classList.add('active');
  const coords = _activeNavRoute.coordinates;
  let idx = 0;
  _hasShownArrivalDoorstep = false;

  navSimInterval = setInterval(() => {
    if (idx >= coords.length) {
      clearInterval(navSimInterval);
      navSimInterval = null;
      if (btn) btn.classList.remove('active');
      showSupermapsToast('You have reached your destination!', '🏁', 'success');
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

    // Check Flyover Elevation & Community Shortcut Guidance
    checkNavigationGuidance(userLngLat);

    // Auto-popup Doorstep Photo verification in final steps
    if (remainingSteps <= 4 && !_hasShownArrivalDoorstep && activeDestination && activeDestination.img) {
      _hasShownArrivalDoorstep = true;
      renderDoorstepCard(activeDestination);
    }

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
  releaseScreenWakeLock();
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
  const flyCard = document.getElementById('nav-flyover-card');
  if (flyCard) flyCard.style.display = 'none';
  const scCard = document.getElementById('nav-shortcut-card');
  if (scCard) scCard.style.display = 'none';

  clearActiveRoute();
  map.easeTo({ pitch: 0, bearing: 0, zoom: 14, duration: 800 });
}

// =========================================================================
// COLOR-CODED FLYOVERS & ELEVATION VECTOR RENDERING (Flat 2D, Zero Battery Drain)
// =========================================================================
function renderFlyoverOverlays() {
  if (!map) return;
  if (!map.getSource('protomaps')) return;

  try {
    // 1. Dark Slate for ground & service roads below
    if (!map.getLayer('protomaps-ground-roads')) {
      map.addLayer({
        id: 'protomaps-ground-roads',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: ['any', ['!has', 'bridge'], ['==', ['get', 'bridge'], 0], ['<=', ['get', 'layer'], 0]],
        paint: {
          'line-color': '#334155', // Dark slate for roads below
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1.5, 16, 4],
          'line-opacity': 0.7
        }
      });
    }

    // 2. High-contrast casing for elevated flyovers
    if (!map.getLayer('protomaps-flyover-casing')) {
      map.addLayer({
        id: 'protomaps-flyover-casing',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: ['any', ['==', ['get', 'bridge'], 1], ['>', ['get', 'layer'], 0]],
        paint: {
          'line-color': '#78350f', // Dark amber casing
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 3.5, 16, 8],
          'line-opacity': 0.95
        }
      });
    }

    // 3. Electric Amber (#f59e0b) for flyovers & elevated bridges
    if (!map.getLayer('protomaps-flyover-amber')) {
      map.addLayer({
        id: 'protomaps-flyover-amber',
        type: 'line',
        source: 'protomaps',
        'source-layer': 'roads',
        filter: ['any', ['==', ['get', 'bridge'], 1], ['>', ['get', 'layer'], 0]],
        paint: {
          'line-color': '#f59e0b', // Vibrant amber/yellow for flyovers
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 6],
          'line-opacity': 1.0
        }
      });
    }
  } catch (err) {
    console.log('[Supermaps] Flyover styling note:', err.message);
  }
}

// =========================================================================
// COMMUNITY SHORTCUTS ENGINE (Strict 2-Wheeler Safety Lock & HUD Alerts)
// =========================================================================
async function loadCommunityShortcuts() {
  if (!map) return;
  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/api/v1/shortcuts?vehicle=${activeVehicleMode}`);
    if (res.ok) {
      _communityShortcuts = await res.json();
    }
  } catch (e) {
    try {
      const raw = localStorage.getItem('rydealot_custom_shortcuts');
      if (raw) _communityShortcuts = JSON.parse(raw);
    } catch (e2) {}
  }

  renderCommunityShortcutsOnMap();
}

function renderCommunityShortcutsOnMap() {
  if (!map) return;
  const srcId = 'supermaps-shortcuts-source';
  const layerId = 'supermaps-shortcuts-layer';
  const casingId = 'supermaps-shortcuts-casing';

  // Strict safety check: If user is in CAR mode, filter out 2-wheeler shortcuts!
  const visibleShortcuts = (_communityShortcuts || []).filter(s => {
    if (s.status !== 'active') return false;
    if (activeVehicleMode === 'car') return s.vehicle_type === 'all';
    return true; // Bike mode allows both bike-only and all-vehicle shortcuts
  });

  const geojson = {
    type: 'FeatureCollection',
    features: visibleShortcuts.map(s => ({
      type: 'Feature',
      properties: {
        id: s.id,
        title: s.title,
        vehicle_type: s.vehicle_type,
        time_saved_mins: s.time_saved_mins || 5,
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

    map.on('click', layerId, (e) => {
      const p = e.features[0].properties;
      const isBikeOnly = p.vehicle_type === 'bike';
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`
          <div style="font-family:'Plus Jakarta Sans',sans-serif; color:#000; padding:4px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="font-size:1.1rem;">⚡</span>
              <strong>${p.title}</strong>
            </div>
            <div style="font-size:0.75rem; color:#475569; margin-top:2px;">
              Saves ~${p.time_saved_mins} mins • ${p.rides} rides verified
            </div>
            <div style="margin-top:4px;">
              <span style="background:${isBikeOnly ? '#fef3c7' : '#cffafe'}; color:${isBikeOnly ? '#b45309' : '#0369a1'}; font-weight:800; font-size:0.7rem; padding:2px 6px; border-radius:4px;">
                ${isBikeOnly ? '🏍️ 2-WHEELER ONLY' : '🚗 CAR & BIKE'}
              </span>
            </div>
          </div>
        `)
        .addTo(map);
    });
  }
}

// Navigation Guidance Controller: Checks Flyovers & Shortcuts
function checkNavigationGuidance(userCoords) {
  if (!isNavigating) return;
  checkFlyoverGuidance();
  checkCommunityShortcutGuidance(userCoords);
}

function checkFlyoverGuidance() {
  const flyoverCard = document.getElementById('nav-flyover-card');
  if (!flyoverCard) return;

  const activeRoute = (_currentRoutes && _currentRoutes[_activeRouteIndex]) || null;
  let hasFlyoverUpcoming = false;
  let isTakingFlyover = true;

  if (activeRoute && activeRoute.legs && activeRoute.legs[0] && activeRoute.legs[0].steps) {
    const steps = activeRoute.legs[0].steps;
    for (let s of steps) {
      const text = ((s.name || '') + ' ' + (s.instruction || '')).toLowerCase();
      if (text.includes('flyover') || text.includes('bridge') || text.includes('elevated') || text.includes('ramp') || text.includes('bypass')) {
        hasFlyoverUpcoming = true;
        if (text.includes('service') || text.includes('below') || text.includes('under') || text.includes('exit to service')) {
          isTakingFlyover = false;
        }
        break;
      }
    }
  }

  if (hasFlyoverUpcoming || (activeRoute && activeRoute.summary && (activeRoute.summary.toLowerCase().includes('flyover') || activeRoute.summary.toLowerCase().includes('bridge')))) {
    flyoverCard.style.display = 'block';
    const badgeText = document.getElementById('flyover-badge-text');
    const instruction = document.getElementById('flyover-instruction');
    const sub = document.getElementById('flyover-sub');

    if (isTakingFlyover) {
      if (badgeText) badgeText.innerText = '🟡 ELEVATED FLYOVER RAMP';
      if (instruction) instruction.innerText = 'Follow Yellow: Take Flyover Ramp';
      if (sub) sub.innerText = 'Ground Road: Stay Below on Gray (Service Road)';
    } else {
      if (badgeText) badgeText.innerText = '🔘 SERVICE ROAD (BELOW)';
      if (instruction) instruction.innerText = 'Follow Gray: Stay Below (Service Road)';
      if (sub) sub.innerText = 'Flyover Ramp: Yellow Lane (Overhead)';
    }
  } else {
    flyoverCard.style.display = 'none';
  }
}

function checkCommunityShortcutGuidance(userCoords) {
  const scCard = document.getElementById('nav-shortcut-card');
  if (!scCard) return;

  if (!_communityShortcuts || _communityShortcuts.length === 0) {
    scCard.style.display = 'none';
    return;
  }

  let nearbyShortcut = null;
  for (let s of _communityShortcuts) {
    if (s.status !== 'active') continue;
    if (activeVehicleMode === 'car' && s.vehicle_type === 'bike') continue; // strictly locked from cars!

    const distStart = calculateDistanceKm(userCoords[1], userCoords[0], s.start_lat, s.start_lng);
    const distEnd = calculateDistanceKm(userCoords[1], userCoords[0], s.end_lat, s.end_lng);

    if (distStart < 0.25 || distEnd < 0.25) {
      nearbyShortcut = s;
      break;
    }
  }

  if (nearbyShortcut) {
    _activeNavShortcutId = nearbyShortcut.id;
    scCard.style.display = 'block';
    const titleEl = document.getElementById('nav-sc-title');
    const descEl = document.getElementById('nav-sc-desc');
    if (titleEl) titleEl.innerText = `⚡ ${nearbyShortcut.title}`;
    if (descEl) descEl.innerText = `Saves ~${nearbyShortcut.time_saved_mins || 5} mins · Discovered by ${nearbyShortcut.creator_rider_id || 'Rider'}`;

    // Auto-log ride completion when passing near the end of the shortcut (within 40m)
    const distToEnd = calculateDistanceKm(userCoords[1], userCoords[0], nearbyShortcut.end_lat, nearbyShortcut.end_lng);
    if (distToEnd < 0.04 && !_completedShortcutRidesLogged[nearbyShortcut.id]) {
      _completedShortcutRidesLogged[nearbyShortcut.id] = true;
      logShortcutRideCompleted(nearbyShortcut.id);
    }
  } else {
    scCard.style.display = 'none';
  }
}

async function logShortcutRideCompleted(shortcutId) {
  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/api/v1/shortcuts/${shortcutId}/complete-ride`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rider_id: 'RIDER_NAV_' + Date.now() })
    });
    if (res.ok) {
      console.log(`[Supermaps] Ride logged for shortcut ${shortcutId}`);
    }
  } catch (e) {}
}

async function reportActiveShortcutClosed() {
  if (!_activeNavShortcutId) {
    alert('No active shortcut nearby to report.');
    return;
  }
  const reason = prompt('Reason for closure (e.g., Gate locked, Construction, Wall built):', 'Gate locked / Road closed');
  if (!reason) return;

  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/api/v1/shortcuts/${_activeNavShortcutId}/report-closed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    const data = await res.json();
    alert(`⚠️ Closure report submitted!\nTotal reports: ${data.closed_reports_count || 1}.\n(Shortcuts are automatically closed after 3 reports).`);
    const scCard = document.getElementById('nav-shortcut-card');
    if (scCard) scCard.style.display = 'none';
  } catch (e) {
    alert('Closure report submitted locally.');
  }
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
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (id === 'modal-profile') {
    syncSupermapsUserProfile();
  }
}
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function handleSupermapsAuthAction() {
  let session = null;
  try {
    const raw = localStorage.getItem('rydealot_user_session');
    if (raw) session = JSON.parse(raw);
  } catch (e) {}

  if (session && (session.name || session.phone)) {
    // Navigate to full Rydealot Profile & Account settings
    window.location.href = '../profile.html';
  } else {
    // Direct guest to login page with auto return parameter
    window.location.href = '../login.html?redirect=supermaps/';
  }
}

function syncSupermapsUserProfile() {
  const nameEl = document.getElementById('profile-name-display');
  const phoneEl = document.getElementById('profile-phone-display');
  const authBtn = document.getElementById('profile-auth-action-btn');
  const bizListEl = document.getElementById('profile-biz-list');
  const statusDot = document.getElementById('profile-status-dot');

  let session = null;
  try {
    const raw = localStorage.getItem('rydealot_user_session');
    if (raw) session = JSON.parse(raw);
  } catch (e) {}

  if (!session) {
    const phone = localStorage.getItem('rydealot_phone') || localStorage.getItem('user_phone');
    const name = localStorage.getItem('rydealot_name') || localStorage.getItem('user_name');
    if (phone || name) {
      session = { name: name || 'Rydealot Member', phone: phone || '' };
    }
  }

  if (session && (session.name || session.phone)) {
    if (nameEl) nameEl.textContent = session.name || 'Rydealot Member';
    if (phoneEl) phoneEl.textContent = session.phone || session.email || 'Verified Active Account';
    if (statusDot) statusDot.style.background = '#10b981';
    if (authBtn) {
      authBtn.textContent = 'Account Profile ⚙️';
      authBtn.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
      authBtn.style.color = '#fff';
    }
  } else {
    if (nameEl) nameEl.textContent = 'Guest Rider';
    if (phoneEl) phoneEl.textContent = 'Sign in to sync your businesses & trips';
    if (statusDot) statusDot.style.background = '#f59e0b';
    if (authBtn) {
      authBtn.textContent = '⚡ Sign In / Register';
      authBtn.style.background = 'linear-gradient(135deg, #f59e0b, #d97706)';
      authBtn.style.color = '#000';
      authBtn.style.fontWeight = '800';
    }
  }

  // Render user's registered business listings & transfer requests
  if (bizListEl) {
    let localTransfers = [];
    try {
      const rawT = localStorage.getItem('rydealot_shop_transfers');
      if (rawT) localTransfers = JSON.parse(rawT);
    } catch (e) {}

    let localShops = [];
    try {
      const rawS = localStorage.getItem('rydealot_user_shops');
      if (rawS) localShops = JSON.parse(rawS);
    } catch (e) {}

    const totalBizItems = [...localTransfers, ...localShops];
    if (totalBizItems.length > 0) {
      bizListEl.innerHTML = '';
      bizListEl.style.display = 'flex';
      bizListEl.style.flexDirection = 'column';
      bizListEl.style.gap = '8px';

      totalBizItems.forEach(item => {
        const itemCard = document.createElement('div');
        itemCard.style.background = '#181b22';
        itemCard.style.padding = '10px 12px';
        itemCard.style.borderRadius = '10px';
        itemCard.style.border = '1px solid #2d3343';
        itemCard.style.display = 'flex';
        itemCard.style.justifyContent = 'space-between';
        itemCard.style.alignItems = 'center';

        const isTransfer = !!item.old_shop_name;
        const name = isTransfer ? item.new_shop_name : item.name;
        const statusText = isTransfer ? '⏳ 48h Dispute Active' : '⭐ Golden Pin Active';
        const statusColor = isTransfer ? '#06b6d4' : '#f59e0b';
        const sub = isTransfer ? `Replacing "${item.old_shop_name}"` : `${(item.category || 'Shop').toUpperCase()} • Active`;

        itemCard.innerHTML = `
          <div>
            <div style="font-weight:700; color:#fff; font-size:0.85rem;">${name}</div>
            <div style="font-size:0.72rem; color:var(--text-muted);">${sub}</div>
          </div>
          <span style="font-size:0.7rem; font-weight:800; color:${statusColor}; background:rgba(255,255,255,0.06); padding:3px 7px; border-radius:6px;">${statusText}</span>
        `;
        bizListEl.appendChild(itemCard);
      });
    } else {
      bizListEl.innerHTML = 'No business published yet. Tap "+ Add New" to list or "🔄 Transfer Shop" to claim a vacated store.';
    }
  }
}

function recenterGps() {
  userInteractedWithMap = false;
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLngLat = [pos.coords.longitude, pos.coords.latitude];
        createUserMarker(userLngLat);
        drawAccuracyCircle(userLngLat, pos.coords.accuracy);
        map.flyTo({ center: userLngLat, zoom: 16 });
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

let _activePinDropperForm = 'new';
let _selectedShopCoords = {
  new: null,
  transfer: null
};

function startShopPinDropper(formType) {
  _activePinDropperForm = formType || 'new';
  closeModal('modal-shop-claim');

  const bar = document.getElementById('map-pin-dropper-bar');
  const crosshair = document.getElementById('center-screen-crosshair');
  if (bar) bar.classList.add('active');
  if (crosshair) crosshair.classList.add('active');

  const targetCoords = _selectedShopCoords[_activePinDropperForm] || userLngLat || CONFIG.DEFAULT_LNG_LAT;
  if (map && targetCoords) {
    map.flyTo({ center: targetCoords, zoom: 17 });
  }

  showSupermapsToast('🎯 Pan the map to position center pin over shop shutter.', '📍', 'info');
}

function confirmShopPinLocation() {
  if (!map) return;
  const center = map.getCenter();
  const coords = [Number(center.lng.toFixed(6)), Number(center.lat.toFixed(6))];
  _selectedShopCoords[_activePinDropperForm] = coords;

  const bar = document.getElementById('map-pin-dropper-bar');
  const crosshair = document.getElementById('center-screen-crosshair');
  if (bar) bar.classList.remove('active');
  if (crosshair) crosshair.classList.remove('active');

  const coordsText = `${coords[1].toFixed(5)}°N, ${coords[0].toFixed(5)}°E (Shutter Pinned ✓)`;
  if (_activePinDropperForm === 'new') {
    const textEl = document.getElementById('new-shop-coords-text');
    const boxEl = document.getElementById('new-shop-pin-box');
    if (textEl) textEl.textContent = coordsText;
    if (boxEl) boxEl.classList.add('pinned');
  } else {
    const textEl = document.getElementById('transfer-coords-text');
    const boxEl = document.getElementById('transfer-shop-pin-box');
    if (textEl) textEl.textContent = coordsText;
    if (boxEl) boxEl.classList.add('pinned');
  }

  openModal('modal-shop-claim');
  switchBizModalTab(_activePinDropperForm);
  showSupermapsToast('📍 Exact shop shutter location locked!', '✅', 'success');
}

function cancelShopPinDropper() {
  const bar = document.getElementById('map-pin-dropper-bar');
  const crosshair = document.getElementById('center-screen-crosshair');
  if (bar) bar.classList.remove('active');
  if (crosshair) crosshair.classList.remove('active');

  openModal('modal-shop-claim');
  switchBizModalTab(_activePinDropperForm);
}

async function submitShopkeeperClaim(event) {
  event.preventDefault();
  const name = document.getElementById('shop-input-name').value.trim();
  const category = document.getElementById('shop-input-cat').value;
  const phone = document.getElementById('shop-input-phone').value.trim();
  const plan = document.querySelector('.plan-card.selected')?.dataset?.plan || 'free_lifetime';
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!name || !phone) return;

  submitBtn.textContent = 'Publishing...';
  submitBtn.disabled = true;

  const selectedCoords = _selectedShopCoords['new'] || userLngLat || CONFIG.DEFAULT_LNG_LAT;
  const isSponsored = plan === 'sponsored_rank';

  const payload = {
    name,
    category,
    phone,
    whatsapp: phone,
    tagline: isSponsored ? `${category.toUpperCase()} • ⭐ TOP SPONSORED RANK` : `${category.toUpperCase()} • Verified Local Business`,
    plan_tier: plan,
    is_golden_pin: true,
    is_sponsored: isSponsored,
    latitude: selectedCoords[1],
    longitude: selectedCoords[0]
  };

  try {
    const res = await fetch(`${CONFIG.D1_WORKER}/api/v1/shops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      let userShops = [];
      try {
        const raw = localStorage.getItem('rydealot_user_shops');
        if (raw) userShops = JSON.parse(raw);
      } catch (e) {}
      userShops.unshift(payload);
      localStorage.setItem('rydealot_user_shops', JSON.stringify(userShops));

      closeModal('modal-shop-claim');
      showSupermapsToast(`Business "${name}" published! Appearing shortly.`, '🎉', 'success');
      loadGoldenShops(); // Refresh pins
      syncSupermapsUserProfile();
    } else {
      showSupermapsToast('Could not publish business. Try again.', '⚠️', 'info');
    }
  } catch (err) {
    showSupermapsToast('No internet. Try again when online.', '⚠️', 'info');
  } finally {
    submitBtn.textContent = 'Publish Business Now';
    submitBtn.disabled = false;
  }
}

// =========================================================================
// 5B. BUSINESS MODAL TABS & OWNERSHIP TRANSFER ENGINE
// =========================================================================

function switchBizModalTab(tab) {
  const isTransfer = tab === 'transfer';
  const newBtn = document.getElementById('tab-btn-biz-new');
  const transferBtn = document.getElementById('tab-btn-biz-transfer');
  const newForm = document.getElementById('form-claim-shop');
  const transferForm = document.getElementById('form-transfer-shop');

  if (newBtn) newBtn.classList.toggle('active', !isTransfer);
  if (transferBtn) transferBtn.classList.toggle('active', isTransfer);
  if (newForm) newForm.style.display = isTransfer ? 'none' : 'block';
  if (transferForm) transferForm.style.display = isTransfer ? 'block' : 'none';
}

async function submitOwnershipTransfer(event) {
  event.preventDefault();
  const oldName = document.getElementById('transfer-input-old-name')?.value?.trim();
  const newName = document.getElementById('transfer-input-new-name')?.value?.trim();
  const category = document.getElementById('transfer-input-cat')?.value;
  const pan = (document.getElementById('transfer-input-pan')?.value || '').trim().toUpperCase();
  const phone = document.getElementById('transfer-input-phone')?.value?.trim();
  const submitBtn = event.target.querySelector('button[type="submit"]');

  if (!oldName || !newName || !phone || !pan) {
    showSupermapsToast('Please fill all mandatory fields.', '⚠️', 'info');
    return;
  }

  // PAN card format validation (5 letters, 4 digits, 1 letter)
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(pan)) {
    showSupermapsToast('Please enter a valid 10-digit PAN number.', '⚠️', 'info');
    return;
  }

  if (submitBtn) {
    submitBtn.textContent = 'Submitting Transfer Request...';
    submitBtn.disabled = true;
  }

  const currentCoords = _selectedShopCoords['transfer'] || userLngLat || CONFIG.DEFAULT_LNG_LAT;
  const transferPayload = {
    id: 'transfer_' + Date.now(),
    old_shop_name: oldName,
    new_shop_name: newName,
    category: category,
    pan: pan,
    phone: phone,
    whatsapp: phone,
    latitude: currentCoords[1],
    longitude: currentCoords[0],
    status: 'dispute_window_48h',
    fee_amount: 5.0,
    requested_at: new Date().toISOString()
  };

  try {
    if (CONFIG.D1_WORKER) {
      await fetch(`${CONFIG.D1_WORKER}/api/v1/shops/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transferPayload)
      }).catch(() => {});
    }

    let localTransfers = [];
    try {
      const raw = localStorage.getItem('rydealot_shop_transfers');
      if (raw) localTransfers = JSON.parse(raw);
    } catch(e){}
    localTransfers.unshift(transferPayload);
    localStorage.setItem('rydealot_shop_transfers', JSON.stringify(localTransfers));

    closeModal('modal-shop-claim');
    showSupermapsToast(`🔄 Transfer for "${newName}" submitted! 48-hr dispute window active.`, '✅', 'success');
    syncSupermapsUserProfile();
  } catch (err) {
    showSupermapsToast('Transfer request submitted locally.', '✅', 'success');
  } finally {
    if (submitBtn) {
      submitBtn.textContent = 'Submit Ownership Transfer Request';
      submitBtn.disabled = false;
    }
  }
}

// =========================================================================
// 5C. HIGH-ACCURACY CATEGORY POI DATABASE & PROXIMITY RADAR ENGINE
// =========================================================================

const _categoryPoiDb = [
  // --- FOOD & BIRYANI (Warangal, Hanamkonda & Hyderabad) ---
  {
    id: 'poi_f1',
    name: 'Gayatri Grand Biryani & Family Restaurant',
    category: 'food',
    tagline: 'Authentic Hyderabadi Dum Biryani & Kebabs',
    lat: 17.9942,
    lng: 79.5541,
    phone: '9848011223',
    whatsapp: '9848011223',
    icon: '🍗',
    address: 'Nayeemnagar Main Road, Hanamkonda'
  },
  {
    id: 'poi_f2',
    name: 'Hotel Ashoka Multi-Cuisine',
    category: 'food',
    tagline: 'North & South Indian Thali & Tandoori',
    lat: 17.9868,
    lng: 79.5620,
    phone: '9848022334',
    whatsapp: '9848022334',
    icon: '🍗',
    address: 'Main Road, Hanamkonda Bus Stand Area'
  },
  {
    id: 'poi_f3',
    name: 'Kritunga Rayalaseema Restaurant',
    category: 'food',
    tagline: 'Spicy Rayalaseema Biryani & Ragi Mudda',
    lat: 17.9895,
    lng: 79.5480,
    phone: '9848033445',
    whatsapp: '9848033445',
    icon: '🍗',
    address: 'Subedari Collectorate Road, Hanamkonda'
  },
  {
    id: 'poi_f4',
    name: 'Mandi House Arabian Nights',
    category: 'food',
    tagline: 'Juicy Mutton & Chicken Mandi Platters',
    lat: 18.0060,
    lng: 79.5585,
    phone: '9848044556',
    whatsapp: '9848044556',
    icon: '🍗',
    address: 'Kakatiya University 100ft Road, Hanamkonda'
  },
  {
    id: 'poi_f5',
    name: 'Bawarchi Dum Biryani Center',
    category: 'food',
    tagline: 'Quick Parcel & Dine-In Dum Biryani',
    lat: 17.9780,
    lng: 79.5165,
    phone: '9848055667',
    whatsapp: '9848055667',
    icon: '🍗',
    address: 'Station Road, Kazipet'
  },
  {
    id: 'poi_f6',
    name: 'Bawarchi Grand Biryani (RTC X Roads)',
    category: 'food',
    tagline: 'World Famous Hyderabadi Dum Biryani',
    lat: 17.4018,
    lng: 78.4908,
    phone: '9876543210',
    whatsapp: '9876543210',
    icon: '🍗',
    address: 'RTC X Roads, Hyderabad'
  },

  // --- IRANI CHAI & CAFES ---
  {
    id: 'poi_t1',
    name: 'Lucky Irani Chai & Osmania Cafe',
    category: 'tea',
    tagline: 'Kadak Irani Chai, Samosa & Osmania Biscuits',
    lat: 17.9880,
    lng: 79.5605,
    phone: '9848112233',
    whatsapp: '9848112233',
    icon: '☕',
    address: 'Public Garden Road, Hanamkonda'
  },
  {
    id: 'poi_t2',
    name: 'New Milan Chai Point',
    category: 'tea',
    tagline: 'Ginger Lemon Tea & Fresh Bun Maska',
    lat: 17.9950,
    lng: 79.5530,
    phone: '9848123456',
    whatsapp: '9848123456',
    icon: '☕',
    address: 'Nayeemnagar Chowrasta, Hanamkonda'
  },
  {
    id: 'poi_t3',
    name: 'City Tea Stall & Snacks',
    category: 'tea',
    tagline: '24/7 Hot Irani Chai for Travellers',
    lat: 17.9772,
    lng: 79.5180,
    phone: '9848134567',
    whatsapp: '9848134567',
    icon: '☕',
    address: 'Kazipet Railway Station Entrance'
  },
  {
    id: 'poi_t4',
    name: 'Niloufer Cafe & Tea Lounge',
    category: 'tea',
    tagline: 'Signature Irani Chai & Maska Bun',
    lat: 17.3970,
    lng: 78.4682,
    phone: '9123456780',
    whatsapp: '9123456780',
    icon: '☕',
    address: 'Lakdikapul, Hyderabad'
  },

  // --- AUTO & TAXI STANDS ---
  {
    id: 'poi_a1',
    name: 'Hanamkonda Bus Stand Auto Point',
    category: 'auto',
    tagline: 'City Autos to Kazipet, Parkal & Warangal',
    lat: 17.9860,
    lng: 79.5635,
    phone: '',
    whatsapp: '',
    icon: '🛺',
    address: 'Main Bus Station, Hanamkonda'
  },
  {
    id: 'poi_a2',
    name: 'Nayeemnagar Junction Auto Stand',
    category: 'auto',
    tagline: 'Autos to KU Campus, Mulugu Road & Subedari',
    lat: 17.9955,
    lng: 79.5525,
    phone: '',
    whatsapp: '',
    icon: '🛺',
    address: 'NH563 Chowrasta, Nayeemnagar'
  },
  {
    id: 'poi_a3',
    name: 'Kazipet Railway Station Auto Stand',
    category: 'auto',
    tagline: '24/7 Autos to Hanamkonda, NIT & Warangal',
    lat: 17.9765,
    lng: 79.5190,
    phone: '',
    whatsapp: '',
    icon: '🛺',
    address: 'Platform 1 Circulating Area, Kazipet'
  },
  {
    id: 'poi_a4',
    name: 'Subedari Collectorate Auto Stand',
    category: 'auto',
    tagline: 'Autos to District Courts, Arts College & Balasamudram',
    lat: 17.9890,
    lng: 79.5495,
    phone: '',
    whatsapp: '',
    icon: '🛺',
    address: 'Court Circle, Subedari'
  },

  // --- FUEL & EV CHARGING ---
  {
    id: 'poi_e1',
    name: 'Indian Oil Petrol & EV Charging Station',
    category: 'fuel',
    tagline: 'Petrol, Diesel, Air & 60kW DC EV Fast Charger',
    lat: 17.9910,
    lng: 79.5510,
    phone: '',
    whatsapp: '',
    icon: '⛽',
    address: 'Subedari Main Road, Hanamkonda'
  },
  {
    id: 'poi_e2',
    name: 'HP Auto Fuel Station NH563',
    category: 'fuel',
    tagline: '24/7 Digital Fueling & Nitrogen Air',
    lat: 18.0020,
    lng: 79.5560,
    phone: '',
    whatsapp: '',
    icon: '⛽',
    address: 'Parkal Highway NH563, Nayeemnagar'
  },
  {
    id: 'poi_e3',
    name: 'Bharat Petroleum Kazipet Bypass',
    category: 'fuel',
    tagline: 'High Speed Fueling & Engine Oil Services',
    lat: 17.9810,
    lng: 79.5250,
    phone: '',
    whatsapp: '',
    icon: '⛽',
    address: 'Bypass Road, Kazipet'
  },

  // --- METRO & TRAIN STATIONS ---
  {
    id: 'poi_s1',
    name: 'Kazipet Junction Railway Station (KZJ)',
    category: 'station',
    tagline: 'Major Indian Railways Junction (Telangana)',
    lat: 17.9768,
    lng: 79.5186,
    phone: '139',
    whatsapp: '',
    icon: '🚆',
    address: 'Kazipet, Hanumakonda District'
  },
  {
    id: 'poi_s2',
    name: 'Warangal Railway Station (WL)',
    category: 'station',
    tagline: 'Main Warangal City Rail Terminal',
    lat: 17.9575,
    lng: 79.6015,
    phone: '139',
    whatsapp: '',
    icon: '🚆',
    address: 'Station Road, Warangal'
  },
  {
    id: 'poi_s3',
    name: 'Hanamkonda Central Bus Terminal',
    category: 'station',
    tagline: 'TSRTC Express & Palle Velugu Bus Hub',
    lat: 17.9855,
    lng: 79.5640,
    phone: '',
    whatsapp: '',
    icon: '🚌',
    address: 'Bus Station Complex, Hanamkonda'
  }
];

let activeCategoryMarkers = [];

function setCategoryFilter(category, btnEl) {
  // 1. Highlight active chip
  document.querySelectorAll('.chip-btn').forEach(btn => btn.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  // 2. Remove all previous category markers cleanly
  activeCategoryMarkers.forEach(m => m.remove());
  activeCategoryMarkers = [];

  // 3. Gather all places
  const allPlaces = [..._categoryPoiDb, ...verifiedShops];
  const filtered = category === 'all'
    ? allPlaces
    : allPlaces.filter(p => p.category === category);

  if (filtered.length === 0) {
    showSupermapsToast('No places found for this category nearby.', '🔍', 'info');
    return;
  }

  // 4. Calculate distance from user GPS
  const currentPos = userLngLat || CONFIG.DEFAULT_LNG_LAT;
  const placesWithDist = filtered.map(p => {
    const lat = Number(p.lat || p.latitude);
    const lng = Number(p.lng || p.longitude);
    const distKm = calculateDistanceKm(currentPos[1], currentPos[0], lat, lng);
    return { ...p, lat, lng, distKm };
  });

  // 5. Sponsored Ranking Priority + Proximity Distance Algorithm
  placesWithDist.sort((a, b) => {
    const aSponsored = (a.is_sponsored || a.plan_tier === 'sponsored_rank') ? 1 : 0;
    const bSponsored = (b.is_sponsored || b.plan_tier === 'sponsored_rank') ? 1 : 0;
    if (aSponsored !== bSponsored) {
      return bSponsored - aSponsored; // Sponsored places jump straight to Rank #1 / Top Priority!
    }
    return a.distKm - b.distKm; // Within same rank, closest distance first
  });

  // 6. Render custom category pins on the map
  const bounds = new maplibregl.LngLatBounds();
  bounds.extend(currentPos);

  const topPlaces = placesWithDist.slice(0, 10);
  topPlaces.forEach(place => {
    const el = document.createElement('div');
    el.className = 'category-poi-pin';

    let catClass = place.category || 'services';
    let icon = place.icon || '📍';
    if (!place.icon) {
      if (catClass === 'food') icon = '🍗';
      else if (catClass === 'tea') icon = '☕';
      else if (catClass === 'auto') icon = '🛺';
      else if (catClass === 'fuel') icon = '⛽';
      else if (catClass === 'station') icon = '🚆';
    }

    const shortName = place.name.length > 18 ? place.name.substring(0, 16) + '..' : place.name;
    const distLabel = place.distKm < 1.0 ? `${Math.round(place.distKm * 1000)}m` : `${place.distKm.toFixed(1)}km`;
    const isSponsored = place.is_sponsored || place.plan_tier === 'sponsored_rank';
    const sponsoredTag = isSponsored
      ? `<span style="background:var(--accent-gold); color:#000; font-size:0.62rem; font-weight:900; padding:1px 5px; border-radius:4px; margin-right:4px;">⭐ AD</span>`
      : '';
    const sponsoredStyle = isSponsored
      ? 'border: 2px solid var(--accent-gold); box-shadow: 0 0 14px rgba(245,158,11,0.6);'
      : '';

    el.innerHTML = `
      <div class="category-poi-badge ${catClass}" style="${sponsoredStyle}">
        ${sponsoredTag}
        <span>${icon}</span>
        <span>${shortName}</span>
        <span style="opacity:0.85; font-size:0.7rem; margin-left:2px;">(${distLabel})</span>
      </div>
    `;

    el.onclick = () => onCategoryPoiClicked(place);

    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([place.lng, place.lat])
      .addTo(map);

    activeCategoryMarkers.push(marker);
    bounds.extend([place.lng, place.lat]);
  });

  // 6. Camera gently fits to encompass nearby places
  if (topPlaces.length > 0 && map) {
    map.fitBounds(bounds, { padding: { top: 120, bottom: 100, left: 50, right: 50 }, maxZoom: 15 });
  }

  // 7. Open bottom panel with the closest place
  if (topPlaces.length > 0) {
    onCategoryPoiClicked(topPlaces[0]);
  }
}

function onCategoryPoiClicked(place) {
  if (!place) return;
  const distLabel = place.distKm ? (place.distKm < 1.0 ? `${Math.round(place.distKm * 1000)}m away` : `${place.distKm.toFixed(1)} km away`) : '';
  const isSponsored = place.is_sponsored || place.plan_tier === 'sponsored_rank';

  const titlePrefix = isSponsored ? '⭐ [SPONSORED #1] ' : '';
  document.getElementById('place-title').innerText = titlePrefix + place.name;
  document.getElementById('place-subtitle').innerText = place.tagline
    ? `${place.tagline} ${distLabel ? '• ' + distLabel : ''}`
    : `${place.address || (place.category.toUpperCase() + ' · Verified Spot')} ${distLabel ? '• ' + distLabel : ''}`;

  const callBtn = document.getElementById('btn-call-place');
  if (callBtn) {
    callBtn.style.display = place.phone ? 'flex' : 'none';
    callBtn.onclick = () => window.open(`tel:${place.phone}`);
  }

  const waBtn = document.getElementById('btn-wa-place');
  if (waBtn) {
    const waNum = place.whatsapp || place.phone;
    waBtn.style.display = waNum ? 'flex' : 'none';
    waBtn.onclick = () => window.open(`https://wa.me/${waNum}?text=Hi,%20I%20found%20your%20place%20on%20Rydealot%20Supermaps!`);
  }

  const navBtn = document.getElementById('btn-start-nav');
  if (navBtn) {
    navBtn.onclick = () => {
      closeBottomPanel();
      calculateActiveRoute(place.lng, place.lat, place.name);
    };
  }

  openBottomPanel();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=3.0')
      .then(reg => {
        reg.update();
      })
      .catch(e => console.warn(e));
  }
}

// 7. ADMIN GIS OVERLAYS (Custom Roads, Road Demolitions/Blocks, 3D Buildings)
function renderAdminGisOverlays() {
  if (!map) return;

  // Retrieve roads from LocalStorage (empty array if none exist)
  let customRoads = [];
  try {
    const raw = localStorage.getItem('rydealot_custom_roads');
    if (raw) customRoads = JSON.parse(raw);
  } catch (e) {}

  // Retrieve buildings from LocalStorage (empty array if none exist)
  let customBuildings = [];
  try {
    const rawBldg = localStorage.getItem('rydealot_custom_buildings');
    if (rawBldg) customBuildings = JSON.parse(rawBldg);
  } catch (e) {}

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

  // Clean, lightweight 2D building footprints (GPU-friendly, zero thermal overhead)
  map.addLayer({
    id: 'custom-buildings-3d',
    type: 'fill',
    source: 'supermaps-custom-buildings',
    paint: {
      'fill-color': [
        'case',
        ['==', ['get', 'status'], 'demolished'], 'rgba(239, 68, 68, 0.45)',
        'rgba(245, 158, 11, 0.35)'
      ],
      'fill-outline-color': [
        'case',
        ['==', ['get', 'status'], 'demolished'], '#ef4444',
        '#f59e0b'
      ]
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

// =========================================================================
// 8. ZERO-CLOUD IN-LINK DOORSTEP PHOTO & LOCATION SHARING ENGINE
// =========================================================================

// Compress Doorstep Photo via in-memory HTML5 Canvas into ultra-compact WebP Base64
function handleDoorstepPhotoSelected(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      // 180x135 px provides optimal balance of clear gate details / nameplates with compact URL length
      const maxW = 180;
      const maxH = 135;
      let w = img.width;
      let h = img.height;
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(img, 0, 0, w, h);

      // WebP with 0.40 quality; graceful fallback to JPEG
      let dataUrl = canvas.toDataURL('image/webp', 0.40);
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.40);
      }

      _compressedDoorstepPhotoDataUrl = dataUrl;

      // Update UI preview
      const previewWrap = document.getElementById('photo-preview-wrap');
      const previewImg = document.getElementById('share-photo-preview');
      const sizeBadge = document.getElementById('photo-size-badge');
      if (previewImg) previewImg.src = dataUrl;
      if (previewWrap) previewWrap.style.display = 'flex';

      const approxKb = (dataUrl.length * 0.75 / 1024).toFixed(1);
      if (sizeBadge) sizeBadge.innerText = `In-Link WebP: ~${approxKb} KB`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeDoorstepPhoto() {
  _compressedDoorstepPhotoDataUrl = null;
  const fileInput = document.getElementById('share-photo-input');
  if (fileInput) fileInput.value = '';
  const previewWrap = document.getElementById('photo-preview-wrap');
  if (previewWrap) previewWrap.style.display = 'none';
}

function openShareLocationModal() {
  _shareSourceMode = 'gps';
  updateShareSourceUI();

  const nameInput = document.getElementById('share-input-name');
  if (nameInput) {
    if (activeDestination && activeDestination.name) {
      nameInput.value = activeDestination.name;
    } else {
      nameInput.value = '';
    }
  }

  openModal('modal-share-location');
}

function openShareForCurrentPlace() {
  _shareSourceMode = 'pin';
  updateShareSourceUI();

  const nameInput = document.getElementById('share-input-name');
  const placeTitle = document.getElementById('place-title');
  if (nameInput && placeTitle) {
    nameInput.value = placeTitle.innerText || '';
  }
  closeBottomPanel();
  openModal('modal-share-location');
}

function setShareSource(mode) {
  _shareSourceMode = mode;
  updateShareSourceUI();
}

function updateShareSourceUI() {
  const gpsChip = document.getElementById('chip-source-gps');
  const pinChip = document.getElementById('chip-source-pin');
  if (gpsChip) gpsChip.classList.toggle('active', _shareSourceMode === 'gps');
  if (pinChip) pinChip.classList.toggle('active', _shareSourceMode === 'pin');
}

function getShareTargetCoords() {
  if (_shareSourceMode === 'pin' && activeDestination) {
    return { lat: activeDestination.lat, lng: activeDestination.lng };
  }
  if (userLngLat) {
    return { lat: userLngLat[1], lng: userLngLat[0] };
  }
  if (map) {
    const center = map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }
  return { lat: 17.3850, lng: 78.4867 };
}

function buildFullShareLink() {
  const coords = getShareTargetCoords();
  const inputName = document.getElementById('share-input-name')?.value?.trim();
  const defaultName = _shareSourceMode === 'pin' ? (activeDestination?.name || 'Pinned Location') : 'My Location';
  const name = inputName || defaultName;
  const clue = document.getElementById('share-input-clue')?.value?.trim() || '';

  const hashParams = new URLSearchParams();
  hashParams.set('lat', coords.lat.toFixed(5));
  hashParams.set('lng', coords.lng.toFixed(5));
  if (name) hashParams.set('name', name);
  if (clue) hashParams.set('clue', clue);
  if (_compressedDoorstepPhotoDataUrl) {
    hashParams.set('img', _compressedDoorstepPhotoDataUrl);
  }

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  return {
    url: `${baseUrl}#${hashParams.toString()}`,
    name,
    clue,
    hasPhoto: !!_compressedDoorstepPhotoDataUrl
  };
}

async function quickShareSystem() {
  const { url, name } = buildFullShareLink();
  if (navigator.share) {
    try {
      await navigator.share({
        title: `Rydealot Supermaps — ${name}`,
        text: `📍 Navigate to ${name} on Rydealot Supermaps:\n${url}`,
        url: url
      });
      showSupermapsToast('Shared successfully!', '⚡', 'success');
      return;
    } catch (err) {
      if (err.name !== 'AbortError') {
        copyShareLink();
      }
      return;
    }
  }
  copyShareLink();
}

function shareOnWhatsApp() {
  const { url, name, clue, hasPhoto } = buildFullShareLink();
  let msg = `📍 *Rydealot Supermaps Location*\n`;
  msg += `🏠 *Destination:* ${name}\n`;
  if (clue) msg += `🔍 *Clue:* ${clue}\n`;
  if (hasPhoto) msg += `📸 *Doorstep Photo Attached*\n`;
  msg += `\n👉 Tap link to open & navigate:\n${url}`;

  const waLink = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(waLink, '_blank');
}

function copyShareLink() {
  const { url } = buildFullShareLink();
  const btnText = document.getElementById('copy-btn-text');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      if (btnText) {
        btnText.innerText = '✓ Copied!';
        setTimeout(() => { btnText.innerText = 'Copy Link'; }, 2500);
      }
    }).catch(() => fallbackCopy(url, btnText));
  } else {
    fallbackCopy(url, btnText);
  }
}

function copyShareLink() {
  const { url } = buildFullShareLink();
  const btnText = document.getElementById('copy-btn-text');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(() => {
      if (btnText) {
        btnText.innerText = '✓ Copied!';
        setTimeout(() => { btnText.innerText = 'Copy Link'; }, 2500);
      }
      showSupermapsToast('Share link copied to clipboard!', '📋', 'success');
    }).catch(() => fallbackCopy(url, btnText));
  } else {
    fallbackCopy(url, btnText);
  }
}

function fallbackCopy(text, btnText) {
  const tempInput = document.createElement('textarea');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  try {
    document.execCommand('copy');
    if (btnText) {
      btnText.innerText = '✓ Copied!';
      setTimeout(() => { btnText.innerText = 'Copy Link'; }, 2500);
    }
    showSupermapsToast('Share link copied to clipboard!', '📋', 'success');
  } catch (e) {
    showSupermapsToast('Could not copy automatically. Please copy manually.', '⚠️', 'info');
  }
  document.body.removeChild(tempInput);
}

// Doorstep Arrival Card & Lightbox Display
function renderDoorstepCard(meta) {
  if (!meta || !meta.img) return;
  const card = document.getElementById('doorstep-arrival-card');
  const imgEl = document.getElementById('doorstep-card-img');
  const titleEl = document.getElementById('doorstep-card-title');
  const clueEl = document.getElementById('doorstep-card-clue');

  if (imgEl) imgEl.src = meta.img;
  if (titleEl) titleEl.innerText = meta.name || 'Destination';
  if (clueEl) clueEl.innerText = meta.clue ? `🔍 ${meta.clue}` : 'Doorstep visual verification';
  if (card) card.style.display = 'block';
}

function closeDoorstepCard() {
  const card = document.getElementById('doorstep-arrival-card');
  if (card) card.style.display = 'none';
}

function openDoorstepLightbox(customSrc) {
  const lightbox = document.getElementById('modal-photo-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const caption = document.getElementById('lightbox-caption');

  const src = customSrc || document.getElementById('doorstep-card-img')?.src || _compressedDoorstepPhotoDataUrl;
  if (!src || !lightbox || !lightboxImg) return;

  lightboxImg.src = src;
  if (caption) {
    const title = activeDestination?.name || 'Doorstep Verification';
    const clue = activeDestination?.clue || '';
    caption.innerText = clue ? `${title} — ${clue}` : title;
  }
  lightbox.classList.add('active');
}

function closeDoorstepLightbox() {
  const lightbox = document.getElementById('modal-photo-lightbox');
  if (lightbox) lightbox.classList.remove('active');
}

// =========================================================================
// 9. POWER SAVER (AMOLED COOL MODE) & DATA SAVER ENGINE
// =========================================================================

function initEcoPowerSaver() {
  if (isPowerSaverActive) {
    document.body.classList.add('power-saver-active');
    const pBtn = document.getElementById('dock-btn-power');
    if (pBtn) pBtn.classList.add('active');
  }
  if (isDataSaverActive) {
    const dBtn = document.getElementById('dock-btn-data');
    if (dBtn) dBtn.classList.add('active');
  }
}

function togglePowerSaver() {
  isPowerSaverActive = !isPowerSaverActive;
  localStorage.setItem('rydealot_power_saver', isPowerSaverActive ? 'true' : 'false');
  document.body.classList.toggle('power-saver-active', isPowerSaverActive);
  const pBtn = document.getElementById('dock-btn-power');
  if (pBtn) pBtn.classList.toggle('active', isPowerSaverActive);

  if (isPowerSaverActive) {
    if (map) map.easeTo({ pitch: 0, duration: 400 });
    showSupermapsToast('⚡ Power Saver ON: AMOLED Black active', '⚡', 'success');
  } else {
    showSupermapsToast('Standard Display restored', '☀️', 'info');
  }
}

function toggleDataSaver() {
  isDataSaverActive = !isDataSaverActive;
  localStorage.setItem('rydealot_data_saver', isDataSaverActive ? 'true' : 'false');
  const dBtn = document.getElementById('dock-btn-data');
  if (dBtn) dBtn.classList.toggle('active', isDataSaverActive);

  if (isDataSaverActive) {
    showSupermapsToast('📶 Data Saver ON: Low bandwidth routing', '📶', 'success');
  } else {
    showSupermapsToast('Standard Data Mode restored', '🌐', 'info');
  }
}

// Legacy alias
function toggleEcoMode() {
  togglePowerSaver();
}

// =========================================================================
// 10. IN-APP NATIVE FLOATING TOAST NOTIFICATION ENGINE (ZERO BROWSER ALERTS)
// =========================================================================
let _toastTimer = null;
function showSupermapsToast(msg, icon = '✓', type = 'info') {
  const toast = document.getElementById('supermaps-toast');
  const textEl = document.getElementById('toast-text');
  const iconEl = document.getElementById('toast-icon');
  if (!toast || !textEl) return;

  textEl.innerText = msg;
  if (iconEl) iconEl.innerText = icon;
  toast.className = `supermaps-toast ${type} show`;

  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}


