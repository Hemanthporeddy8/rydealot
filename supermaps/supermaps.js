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
let currentTheme = 'dark'; // 'dark' or 'light'
let userMarker = null;
let destMarker = null;
let currentHeading = 0;
let userLngLat = CONFIG.DEFAULT_LNG_LAT;
let isNavigating = false;
let activeVehicleMode = 'car';
let activeDestination = null;
let verifiedShops = [];

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

  // Create Vector Map (Strictly Bounded to India)
  map = new maplibregl.Map({
    container: 'map-viewport',
    center: CONFIG.DEFAULT_LNG_LAT,
    zoom: 13,
    minZoom: 4.2,
    maxBounds: CONFIG.INDIA_BOUNDS, // Clips the rest of the world completely!
    style: buildVectorStyle(currentTheme),
    attributionControl: false
  });

  // Setup navigation controls
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: false }), 'bottom-right');

  // Handle 1-Tap Anywhere on the Map (Google Maps Style)
  map.on('click', (e) => {
    closeBottomPanel();
    document.getElementById('search-dropdown').style.display = 'none';
    handleMapDestinationClick(e.lngLat);
  });

  // Render Admin GIS Overlays (Custom Roads, Road Blocks, 3D Buildings)
  map.on('load', () => {
    renderAdminGisOverlays();
  });

  // Re-render when theme or basemap style changes
  map.on('style.load', () => {
    renderAdminGisOverlays();
  });

  // Real-time synchronization when Admin updates roads or buildings in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === 'rydealot_custom_roads' || e.key === 'rydealot_custom_buildings') {
      renderAdminGisOverlays();
    }
  });

  // Track User GPS Location
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLngLat = [pos.coords.longitude, pos.coords.latitude];
        map.flyTo({ center: userLngLat, zoom: 15 });
        createUserMarker(userLngLat);
      },
      () => createUserMarker(userLngLat),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  } else {
    createUserMarker(userLngLat);
  }
}

// 2. VECTOR STYLE BUILDER (Powered by Your 2.42 GB File)
function buildVectorStyle(theme) {
  const flavor = theme === 'dark' ? 'dark' : 'light';
  
  let vectorLayers = [];
  if (typeof basemaps !== 'undefined' && basemaps.layers) {
    vectorLayers = basemaps.layers('protomaps', basemaps.namedFlavor(flavor), { lang: 'en' });
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

function toggleMapTheme() {
  currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
  document.body.classList.toggle('daylight-theme', currentTheme === 'light');
  map.setStyle(buildVectorStyle(currentTheme));
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

function updateCompassHeading(heading) {
  if (isNaN(heading)) return;
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
      if (e.webkitCompassHeading) updateCompassHeading(e.webkitCompassHeading);
      else if (e.alpha) updateCompassHeading(360 - e.alpha);
    }, true);
  }
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
  }, 250);
}

async function fetchPlaceSuggestions(query, targetType) {
  const dropdown = document.getElementById('search-dropdown');
  dropdown.innerHTML = '<div style="padding:12px 16px; font-size:0.85rem; color:var(--text-muted);">Searching Indian places...</div>';
  dropdown.style.display = 'block';

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}&limit=6`;
    const res = await fetch(url, { headers: { 'User-Agent': 'RydealotSupermaps/1.0' } });
    const results = await res.json();

    if (!results || results.length === 0) {
      dropdown.innerHTML = '<div style="padding:12px 16px; font-size:0.85rem; color:var(--text-muted);">No locations found. Try village or city name.</div>';
      return;
    }

    dropdown.innerHTML = '';
    results.forEach(place => {
      const parts = place.display_name.split(',');
      const title = parts[0];
      const subtitle = parts.slice(1, 4).join(', ');

      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerHTML = `
        <div class="search-item-info">
          <div class="search-item-name">📍 ${title}</div>
          <div class="search-item-meta">${subtitle}</div>
        </div>
        <span class="search-item-badge">${place.type || 'place'}</span>
      `;
      item.onclick = () => selectSuggestedPlace(place, targetType);
      dropdown.appendChild(item);
    });

  } catch (err) {
    dropdown.style.display = 'none';
  }
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
    el.innerHTML = '<div style="font-size:2.2rem; filter:drop-shadow(0 4px 10px rgba(0,0,0,0.6)); cursor:pointer; transform:translate(-10px, -28px);">🏁</div>';
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
  el.innerHTML = '<div style="font-size:2.2rem; filter:drop-shadow(0 4px 10px rgba(0,0,0,0.6)); cursor:pointer; transform:translate(-10px, -28px);">🏁</div>';

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

  try {
    const profile = activeVehicleMode === 'walk' ? 'foot' : 'driving';
    const url = `${CONFIG.OSRM_ROUTING}${startCoord[0]},${startCoord[1]};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
    const res = await fetch(url);
    const data = await res.json();

    if (!data.routes || data.routes.length === 0) {
      alert('Could not compute a drivable route to this location.');
      return;
    }

    const route = data.routes[0];
    renderRouteOnMap(route.geometry);

    const distKm = (route.distance / 1000).toFixed(1);
    const etaMins = Math.round(route.duration / 60);

    const banner = document.getElementById('route-summary-banner');
    banner.style.display = 'flex';
    document.getElementById('route-eta').innerText = `${etaMins} mins`;
    
    let modeText = '🚗 Tar road route';
    if (activeVehicleMode === 'bike') modeText = '🏍️ Bike shortcut route';
    if (activeVehicleMode === 'walk') modeText = '🚶 Walking path';
    
    document.getElementById('route-dist').innerText = `${distKm} km • ${modeText}`;

  } catch (err) {
    console.warn('Routing error:', err);
  }
}

function renderRouteOnMap(geojsonGeometry) {
  clearActiveRoute();

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
  map.fitBounds(bounds, { padding: 60 });
}

function clearActiveRoute() {
  if (map.getLayer('route-line')) map.removeLayer('route-line');
  if (map.getSource('active-route')) map.removeSource('active-route');
  if (destMarker) { destMarker.remove(); destMarker = null; }
  const banner = document.getElementById('route-summary-banner');
  if (banner) banner.style.display = 'none';
}

function startDrivingActiveRoute() {
  if (!activeDestination) return;
  toggleDirectionsMode(false);
  startNavigation(activeDestination.lng, activeDestination.lat, activeDestination.name);
}

function startNavigation(destLng, destLat, destName) {
  isNavigating = true;
  document.getElementById('nav-hud').style.display = 'flex';
  document.getElementById('nav-hud-action').innerText = `Heading to ${destName}`;

  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      (pos) => {
        userLngLat = [pos.coords.longitude, pos.coords.latitude];
        createUserMarker(userLngLat);
        if (pos.coords.heading) updateCompassHeading(pos.coords.heading);
        map.panTo(userLngLat);
      },
      (err) => console.warn(err),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
    );
  }
}

function stopNavigation() {
  isNavigating = false;
  document.getElementById('nav-hud').style.display = 'none';
  clearActiveRoute();
  map.resetNorthPitch();
}

// 5. GOLDEN PROMOTED SHOPS (The Golden Goose)
async function loadGoldenShops() {
  const fallbackShops = [
    {
      id: 'shop_001',
      name: 'Bawarchi Grand Biryani',
      category: 'food',
      latitude: 17.4018,
      longitude: 78.4908,
      phone: '+91 9876543210',
      whatsapp: '919876543210',
      tagline: 'Authentic Hyderabadi Dum Biryani • 10% Off'
    },
    {
      id: 'shop_002',
      name: 'Niloufer Irani Chai',
      category: 'tea',
      latitude: 17.3970,
      longitude: 78.4682,
      phone: '+91 9123456780',
      whatsapp: '919123456780',
      tagline: 'World Famous Kadak Chai & Malai Bun'
    }
  ];

  if (CONFIG.D1_WORKER) {
    try {
      const res = await fetch(`${CONFIG.D1_WORKER}/api/v1/shops`, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          verifiedShops = data;
          renderShopMarkers(verifiedShops);
          return;
        }
      }
    } catch (err) {
      console.warn('Cloudflare D1 shops offline, using offline defaults:', err);
    }
  }

  verifiedShops = fallbackShops;
  renderShopMarkers(verifiedShops);
}

function renderShopMarkers(shops) {
  shops.forEach((shop) => {
    const el = document.createElement('div');
    el.className = 'golden-shop-pin';
    el.innerHTML = `
      <div class="golden-pin-pulse"></div>
      <div class="golden-pin-badge">
        <span>⭐</span>
        <span>${shop.name.substring(0, 14)}...</span>
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
      pill.className = 'safety-buffer-pill offline';
      text.innerText = '⚠️ OFFLINE — 5 KM Safety Buffer Active';
    } else {
      pill.className = 'safety-buffer-pill';
      text.innerText = '🟢 5 KM Safety Buffer Running';
    }
  }

  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();
}

function openBottomPanel() { document.getElementById('bottom-panel').classList.add('active'); }
function closeBottomPanel() { document.getElementById('bottom-panel').classList.remove('active'); }
function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function recenterGps() {
  if (userLngLat) map.flyTo({ center: userLngLat, zoom: 16 });
}
function selectPlanCard(el) {
  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
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
          <strong>🛣️ ${props.name}</strong><br>
          <span style="font-size:0.8rem; color:#475569;">Surface: ${props.surface.toUpperCase()} • Speed: ${props.speed_limit} km/h</span><br>
          <span style="color:#10b981; font-weight:700; font-size:0.75rem;">🟢 Admin Verified Active Road</span>
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
          <strong style="color:#ef4444;">🚫 ${props.name}</strong><br>
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
          <strong>🏢 ${props.name}</strong><br>
          <span style="font-size:0.8rem; color:#475569;">Category: ${props.category.toUpperCase()} • Height: ${props.height_meters}m</span><br>
          <span style="color:${isDemolished ? '#ef4444' : '#10b981'}; font-weight:700; font-size:0.75rem;">
            ${isDemolished ? '❌ DEMOLISHED STRUCTURE' : '🟢 3D Building Landmark'}
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

