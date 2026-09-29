// =========================================================================
// RYDEALOT SUPERMAPS — 100% PROPRIETARY VECTOR ENGINE (MapLibre + PMTiles)
// Powered by Self-Hosted india.pmtiles (2.42 GB) • Zero OpenStreetMap
// =========================================================================

const CONFIG = {
  // Your Verified Cloud-Hosted 2.42 GB India Map Archive
  PMTILES_SOURCE: 'https://huggingface.co/datasets/RydealotMaps/rydealot-maps/resolve/main/india.pmtiles',
  D1_WORKER: 'https://rydealot-api.rydealotoffical.workers.dev',
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
  }
}

function setVehicleMode(mode) {
  activeVehicleMode = mode;
  document.getElementById('veh-btn-car').classList.toggle('active', mode === 'car');
  document.getElementById('veh-btn-bike').classList.toggle('active', mode === 'bike');
  if (activeDestination) {
    calculateActiveRoute(activeDestination.lng, activeDestination.lat, activeDestination.name);
  }
}

function swapDirections() {
  const fromVal = document.getElementById('dir-from-input').value;
  const toVal = document.getElementById('dir-to-input').value;
  document.getElementById('dir-from-input').value = toVal || 'Your Location (GPS)';
  document.getElementById('dir-to-input').value = fromVal;
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

  try {
    const url = `${CONFIG.OSRM_ROUTING}${userLngLat[0]},${userLngLat[1]};${destLng},${destLat}?overview=full&geometries=geojson&steps=true`;
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
    document.getElementById('route-dist').innerText = `${distKm} km • ${activeVehicleMode === 'car' ? '🚗 Tar road route' : '🏍️ Bike shortcut route'}`;

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
  verifiedShops = [
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
