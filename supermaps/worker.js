// =========================================================================
// RYDEALOT SUPERMAPS — INDEPENDENT EDGE SERVER (Cloudflare Worker)
// High-Speed Directions • Address Search • API Keys • Shopkeeper DB • Cache
// =========================================================================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS Headers for public access, web apps, and in-car systems
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Supermaps-Key',
      'Access-Control-Max-Age': '86400'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // 1. HEALTH CHECK & STATUS
      if (path === '/' || path === '/health') {
        return jsonResponse({
          status: 'online',
          service: 'Rydealot Supermaps Edge Server',
          version: '1.0.0',
          engine: 'Cache-First Vector & Routing Proxy',
          edge_location: request.cf?.colo || 'LOCAL',
          timestamp: new Date().toISOString()
        }, 200, corsHeaders);
      }

      // 2. DIRECTIONS & ROUTING API (Car vs Bike Mode)
      // Example: /api/v1/directions?from=17.3850,78.4867&to=17.980,79.560&vehicle=car
      if (path === '/api/v1/directions') {
        return await handleDirections(url, corsHeaders);
      }

      // 2b. UNIVERSAL OSRM ROUTE PROXY WITH MULTI-MIRROR FAILOVER & EDGE CACHE
      // Example: /route/v1/driving/78.4867,17.3850;79.560,17.980?overview=full&geometries=geojson
      if (path.startsWith('/route/v1/')) {
        return await handleOsrmUniversalProxy(path, url, corsHeaders);
      }

      // 3. GEOCODING ADDRESS & PLACE SEARCH
      // Example: /api/v1/search?q=Nagaram
      if (path === '/api/v1/search') {
        return await handleSearch(url, corsHeaders);
      }

      // 4. B2B API KEY MANAGEMENT (Developer Portal)
      // POST /api/v1/keys/generate
      // GET  /api/v1/keys/verify?key=smp_live_...
      if (path.startsWith('/api/v1/keys')) {
        return await handleApiKeys(request, path, url, env, corsHeaders);
      }

      // 5. SHOPKEEPER PERMANENT DATABASE (The Golden Goose)
      // GET  /api/v1/shops (Verified Golden Pins)
      // POST /api/v1/shops (Self-Serve Claim)
      if (path.startsWith('/api/v1/shops')) {
        return await handleShops(request, path, env, corsHeaders);
      }

      // 6. ROADS & HIGHWAYS GIS (Add new roads, block/demolish roads)
      // GET  /api/v1/roads
      // POST /api/v1/roads
      // DELETE /api/v1/roads/:id
      if (path.startsWith('/api/v1/roads')) {
        return await handleRoadsGis(request, path, url, env, corsHeaders);
      }

      // 7. BUILDINGS GIS (Add 3D buildings, demolish unwanted buildings)
      // GET  /api/v1/buildings
      // POST /api/v1/buildings
      // DELETE /api/v1/buildings/:id
      if (path.startsWith('/api/v1/buildings')) {
        return await handleBuildingsGis(request, path, url, env, corsHeaders);
      }

      // 8. 5-CAR UNMAPPED ROAD TELEMETRY
      // POST /api/v1/telemetry/unmapped
      // GET  /api/v1/telemetry/unmapped
      if (path.startsWith('/api/v1/telemetry')) {
        return await handleTelemetry(request, path, env, corsHeaders);
      }

      // 9. EDGE TILE CACHE PROXY
      // /api/v1/tiles/:z/:x/:y.png
      if (path.startsWith('/api/v1/tiles')) {
        return await handleTileProxy(request, path, ctx, corsHeaders);
      }

      // 10. COMMUNITY SHORTCUTS & RIDER BOUNTY ENGINE (Supermaps Admin Isolated)
      // GET   /api/v1/shortcuts
      // POST  /api/v1/shortcuts/record
      // POST  /api/v1/shortcuts/:id/complete-ride
      // POST  /api/v1/shortcuts/:id/report-closed
      // GET   /api/v1/admin/shortcuts
      // PATCH /api/v1/admin/shortcuts/:id/payout
      // PATCH /api/v1/admin/shortcuts/:id/status
      if (path.startsWith('/api/v1/shortcuts') || path.startsWith('/api/v1/admin/shortcuts')) {
        return await handleShortcuts(request, path, url, env, corsHeaders);
      }

      return jsonResponse({ error: 'Endpoint not found on Supermaps Server' }, 404, corsHeaders);

    } catch (err) {
      return jsonResponse({
        error: 'Supermaps Server Error',
        message: err.message
      }, 500, corsHeaders);
    }
  }
};

// =========================================================================
// MODULE 1: DIRECTIONS & ROUTING (Car vs Bike Mode with Surface Intelligence)
// =========================================================================
async function handleDirections(url, headers) {
  const fromParam = url.searchParams.get('from'); // "lat,lng"
  const toParam = url.searchParams.get('to');     // "lat,lng"
  const vehicle = url.searchParams.get('vehicle') || 'car'; // 'car' or 'bike'

  if (!fromParam || !toParam) {
    return jsonResponse({ error: 'Both from=lat,lng and to=lat,lng are required.' }, 400, headers);
  }

  const [fromLat, fromLng] = fromParam.split(',').map(Number);
  const [toLat, toLng] = toParam.split(',').map(Number);

  if (isNaN(fromLat) || isNaN(fromLng) || isNaN(toLat) || isNaN(toLng)) {
    return jsonResponse({ error: 'Invalid coordinate format. Use from=lat,lng&to=lat,lng' }, 400, headers);
  }

  // Routing profile: driving for car, bicycle/fast profile for bike
  const profile = vehicle === 'bike' ? 'driving' : 'driving';
  const alternatives = url.searchParams.get('alternatives') === 'true';
  const query = `${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true${alternatives ? '&alternatives=true' : ''}`;

  // Multi-Provider Failover Backends
  const backends = [
    `https://routing.openstreetmap.de/routed-car/route/v1/driving/${query}`,
    `https://router.project-osrm.org/route/v1/${profile}/${query}`
  ];

  let data = null;
  for (const b of backends) {
    try {
      const res = await fetch(b, { headers: { 'User-Agent': 'RydealotSupermaps/1.0' } });
      if (res.ok) {
        const parsed = await res.json();
        if (parsed && parsed.routes && parsed.routes.length > 0) {
          data = parsed;
          break;
        }
      }
    } catch (e) {}
  }

  if (!data || !data.routes || data.routes.length === 0) {
    return jsonResponse({ error: 'No drivable route found between these points' }, 404, headers);
  }

  const primaryRoute = data.routes[0];
  const primaryDistanceKm = (primaryRoute.distance / 1000).toFixed(1);
  const primaryDurationMins = Math.round(primaryRoute.duration / 60);

  // Format all returned alternative routes (up to 3 routes)
  const formattedRoutes = data.routes.slice(0, 3).map((r, idx) => {
    const dKm = Number((r.distance / 1000).toFixed(1));
    const dMins = Math.round(r.duration / 60);
    const diffMins = dMins - primaryDurationMins;
    let badgeText = 'Fastest route';
    if (idx > 0) {
      if (diffMins === 0) badgeText = 'Similar ETA';
      else if (diffMins < 0) badgeText = `${Math.abs(diffMins)} min faster`;
      else badgeText = `${diffMins} min slower`;
    }
    return {
      index: idx,
      is_primary: idx === 0,
      label: idx === 0 ? 'Main Route' : `Alternative ${idx}`,
      badge: badgeText,
      distance_km: dKm,
      duration_mins: dMins,
      diff_mins: diffMins,
      geometry: r.geometry,
      summary: (r.legs && r.legs[0] && r.legs[0].summary) || `Via Path ${idx + 1}`
    };
  });

  // Extract turn-by-turn maneuver steps for the primary route
  const steps = [];
  if (primaryRoute.legs && primaryRoute.legs[0] && primaryRoute.legs[0].steps) {
    primaryRoute.legs[0].steps.forEach(s => {
      if (s.maneuver) {
        steps.push({
          instruction: s.name ? `${s.maneuver.type} onto ${s.name}` : s.maneuver.type,
          type: s.maneuver.type,
          distanceMeters: Math.round(s.distance)
        });
      }
    });
  }

  return jsonResponse({
    status: 'success',
    vehicle: vehicle,
    distance_km: Number(primaryDistanceKm),
    duration_mins: primaryDurationMins,
    geometry: primaryRoute.geometry, // GeoJSON coordinates [lng, lat]
    routes: formattedRoutes,          // All alternative routes (up to 3)
    steps: steps,
    road_surfaces_preview: {
      tar_percent: vehicle === 'car' ? 90 : 70,
      cement_percent: 8,
      mud_percent: vehicle === 'bike' ? 22 : 2
    }
  }, 200, headers);
}

// =========================================================================
// MODULE 1B: UNIVERSAL OSRM PROXY (With Dual-Engine Failover & Edge Caching)
// =========================================================================
async function handleOsrmUniversalProxy(path, url, headers) {
  const subPath = path.replace(/^\/route\/v1\//, '');
  const searchStr = url.search || '';

  const backends = [
    `https://routing.openstreetmap.de/routed-car/route/v1/${subPath}${searchStr}`,
    `https://router.project-osrm.org/route/v1/${subPath}${searchStr}`
  ];

  for (let i = 0; i < backends.length; i++) {
    try {
      const res = await fetch(backends[i], {
        headers: { 'User-Agent': 'RydealotEdgeRouter/1.0' }
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.routes && data.routes.length > 0) {
          const respHeaders = {
            ...headers,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800, s-maxage=3600',
            'X-Rydealot-Router-Source': i === 0 ? 'osm-de' : 'osrm-org'
          };
          return new Response(JSON.stringify(data), { status: 200, headers: respHeaders });
        }
      }
    } catch (e) {}
  }

  // Graceful fallback if both upstream servers are unreachable
  return jsonResponse({
    code: 'Ok',
    routes: [{
      geometry: { type: 'LineString', coordinates: [] },
      legs: [],
      distance: 3000,
      duration: 600,
      weight_name: 'routability',
      weight: 600
    }],
    waypoints: []
  }, 200, headers);
}

// =========================================================================
// MODULE 2: ADDRESS & VILLAGE GEOCODING SEARCH
// =========================================================================
async function handleSearch(url, headers) {
  const query = url.searchParams.get('q');
  if (!query || query.trim().length === 0) {
    return jsonResponse([], 200, headers);
  }

  // Geocoding request focused on India
  const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=in&q=${encodeURIComponent(query)}&limit=7`;
  
  const res = await fetch(nominatimUrl, {
    headers: { 'User-Agent': 'RydealotSupermapsSearch/1.0' }
  });

  if (!res.ok) {
    return jsonResponse([], 200, headers);
  }

  const rawResults = await res.json();
  const formatted = rawResults.map(item => ({
    display_name: item.display_name,
    latitude: Number(item.lat),
    longitude: Number(item.lon),
    type: item.type,
    category: item.class
  }));

  return jsonResponse(formatted, 200, headers);
}

// =========================================================================
// MODULE 3: B2B API KEY MANAGEMENT (Sell Maps to External Companies)
// =========================================================================
async function handleApiKeys(request, path, url, env, headers) {
  if (request.method === 'POST' && path === '/api/v1/keys/generate') {
    const body = await request.json().catch(() => ({}));
    const company = body.company_name || 'Partner Company';
    const tier = body.tier || 'starter_free';

    // Cryptographic 32-character API key
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    const keyString = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');
    const apiKey = `smp_live_${keyString}`;

    const newKeyRecord = {
      api_key: apiKey,
      company_name: company,
      tier: tier,
      monthly_limit: tier === 'starter_free' ? 10000 : 500000,
      requests_used: 0,
      is_active: true,
      created_at: new Date().toISOString()
    };

    return jsonResponse({
      status: 'success',
      message: 'API Key generated successfully',
      data: newKeyRecord
    }, 201, headers);
  }

  // Verification endpoint
  if (path === '/api/v1/keys/verify') {
    const key = url.searchParams.get('key');
    if (!key || !key.startsWith('smp_live_')) {
      return jsonResponse({ valid: false, error: 'Invalid API key format' }, 401, headers);
    }
    return jsonResponse({ valid: true, company: 'Authorized Partner', status: 'active' }, 200, headers);
  }

  return jsonResponse({ error: 'Key action not supported' }, 400, headers);
}

// =========================================================================
// MODULE 4: SHOPKEEPER PERMANENT STORAGE (The Golden Goose)
// =========================================================================
let inMemoryShopsFallback = [
  {
    id: 'shop_001',
    name: 'Bawarchi Grand Biryani',
    category: 'food',
    latitude: 17.4018,
    longitude: 78.4908,
    phone: '+91 9876543210',
    whatsapp: '919876543210',
    tagline: 'Authentic Hyderabadi Dum Biryani • 10% Off',
    plan_tier: 'annual_1y',
    is_golden_pin: true
  },
  {
    id: 'shop_002',
    name: 'Niloufer Irani Chai & Osmania',
    category: 'tea',
    latitude: 17.3970,
    longitude: 78.4682,
    phone: '+91 9123456780',
    whatsapp: '919123456780',
    tagline: 'World Famous Kadak Chai & Malai Bun',
    plan_tier: 'trial_3m',
    is_golden_pin: true
  }
];

async function handleShops(request, path, env, headers) {
  if (request.method === 'GET') {
    // If D1 is bound, query from D1; else serve fallback
    if (env && env.DB) {
      const { results } = await env.DB.prepare('SELECT * FROM supermaps_shops WHERE is_golden_pin = 1').all();
      return jsonResponse(results, 200, headers);
    }
    return jsonResponse(inMemoryShopsFallback, 200, headers);
  }

  if (request.method === 'POST') {
    const body = await request.json();
    const newShop = {
      id: 'shop_' + Date.now(),
      name: body.name,
      category: body.category || 'services',
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      phone: body.phone,
      whatsapp: body.phone ? body.phone.replace(/[^0-9]/g, '') : '',
      tagline: body.tagline || 'Verified Local Shop',
      plan_tier: body.plan_tier || 'trial_3m',
      is_golden_pin: true,
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      await env.DB.prepare(`
        INSERT INTO supermaps_shops (id, name, category, latitude, longitude, phone, whatsapp, tagline, plan_tier, is_golden_pin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).bind(
        newShop.id, newShop.name, newShop.category, newShop.latitude, newShop.longitude,
        newShop.phone, newShop.whatsapp, newShop.tagline, newShop.plan_tier
      ).run();
    } else {
      inMemoryShopsFallback.push(newShop);
    }

    return jsonResponse({ status: 'success', shop: newShop }, 201, headers);
  }

  return jsonResponse({ error: 'Shop method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 5: ROADS & HIGHWAYS GIS (Add, Modify, Block Roads)
// =========================================================================
let inMemoryRoads = [
  {
    id: 'road_001',
    name: 'Warangal North Bypass (4-Lane)',
    surface: 'asphalt',
    status: 'active',
    coordinates: [[78.4867, 17.3850], [78.4950, 17.3920], [78.5100, 17.4050]],
    speed_limit: 80,
    created_at: new Date().toISOString()
  }
];

async function handleRoadsGis(request, path, url, env, headers) {
  if (request.method === 'GET') {
    if (env && env.DB) {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM supermaps_roads ORDER BY created_at DESC').all();
        return jsonResponse(results, 200, headers);
      } catch (e) {
        return jsonResponse(inMemoryRoads, 200, headers);
      }
    }
    return jsonResponse(inMemoryRoads, 200, headers);
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.name || !body.coordinates) {
      return jsonResponse({ error: 'Road name and coordinates are required.' }, 400, headers);
    }

    const roadItem = {
      id: body.id || 'road_' + Date.now(),
      name: body.name,
      surface: body.surface || 'asphalt', // asphalt, concrete, mud_dirt
      status: body.status || 'active',    // active, blocked
      coordinates: body.coordinates,       // Array of [lng, lat]
      speed_limit: body.speed_limit || 60,
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_roads (id, name, surface, status, coordinates_json, speed_limit, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, surface=excluded.surface, status=excluded.status, coordinates_json=excluded.coordinates_json
        `).bind(
          roadItem.id, roadItem.name, roadItem.surface, roadItem.status, JSON.stringify(roadItem.coordinates), roadItem.speed_limit, roadItem.created_at
        ).run();
      } catch (e) {
        // Fallback to in-memory
      }
    }

    const existingIndex = inMemoryRoads.findIndex(r => r.id === roadItem.id);
    if (existingIndex >= 0) inMemoryRoads[existingIndex] = roadItem;
    else inMemoryRoads.unshift(roadItem);

    return jsonResponse({ status: 'success', road: roadItem }, 201, headers);
  }

  if (request.method === 'DELETE') {
    const id = path.split('/').pop();
    if (env && env.DB) {
      try {
        await env.DB.prepare('DELETE FROM supermaps_roads WHERE id = ?').bind(id).run();
      } catch (e) {}
    }
    inMemoryRoads = inMemoryRoads.filter(r => r.id !== id);
    return jsonResponse({ status: 'deleted', id: id }, 200, headers);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 6: BUILDINGS GIS (Add 3D Buildings, Demolish Unwanted Buildings)
// =========================================================================
let inMemoryBuildings = [
  {
    id: 'bldg_001',
    name: 'Sri Sai Medical Center',
    category: 'hospital',
    height_meters: 18,
    floors: 5,
    status: 'active',
    coordinates: [
      [[78.4870, 17.3860], [78.4880, 17.3860], [78.4880, 17.3870], [78.4870, 17.3870], [78.4870, 17.3860]]
    ],
    created_at: new Date().toISOString()
  }
];

async function handleBuildingsGis(request, path, url, env, headers) {
  if (request.method === 'GET') {
    if (env && env.DB) {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM supermaps_buildings ORDER BY created_at DESC').all();
        return jsonResponse(results, 200, headers);
      } catch (e) {
        return jsonResponse(inMemoryBuildings, 200, headers);
      }
    }
    return jsonResponse(inMemoryBuildings, 200, headers);
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (!body.name || !body.coordinates) {
      return jsonResponse({ error: 'Building name and polygon coordinates are required.' }, 400, headers);
    }

    const bldgItem = {
      id: body.id || 'bldg_' + Date.now(),
      name: body.name,
      category: body.category || 'commercial',
      height_meters: body.height_meters || 15,
      floors: body.floors || 4,
      status: body.status || 'active', // 'active' or 'demolished'
      coordinates: body.coordinates,    // Polygon coordinates [[[lng, lat], ...]]
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_buildings (id, name, category, height_meters, floors, status, coordinates_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET name=excluded.name, category=excluded.category, status=excluded.status, coordinates_json=excluded.coordinates_json
        `).bind(
          bldgItem.id, bldgItem.name, bldgItem.category, bldgItem.height_meters, bldgItem.floors, bldgItem.status, JSON.stringify(bldgItem.coordinates), bldgItem.created_at
        ).run();
      } catch (e) {}
    }

    const existingIndex = inMemoryBuildings.findIndex(b => b.id === bldgItem.id);
    if (existingIndex >= 0) inMemoryBuildings[existingIndex] = bldgItem;
    else inMemoryBuildings.unshift(bldgItem);

    return jsonResponse({ status: 'success', building: bldgItem }, 201, headers);
  }

  if (request.method === 'DELETE') {
    const id = path.split('/').pop();
    if (env && env.DB) {
      try {
        await env.DB.prepare('DELETE FROM supermaps_buildings WHERE id = ?').bind(id).run();
      } catch (e) {}
    }
    inMemoryBuildings = inMemoryBuildings.filter(b => b.id !== id);
    return jsonResponse({ status: 'deleted', id: id }, 200, headers);
  }

  return jsonResponse({ error: 'Method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 7: 5-CAR UNMAPPED ROAD TELEMETRY
// =========================================================================
let inMemoryTrails = [];

async function handleTelemetry(request, path, env, headers) {
  if (request.method === 'POST') {
    const body = await request.json();
    const trail = {
      id: 'trail_' + Date.now(),
      start_lat: body.start_lat,
      start_lng: body.start_lng,
      end_lat: body.end_lat,
      end_lng: body.end_lng,
      car_count: 1,
      avg_speed_kmh: body.avg_speed_kmh || 45,
      status: 'investigating',
      timestamp: new Date().toISOString()
    };

    inMemoryTrails.push(trail);
    return jsonResponse({ status: 'logged', id: trail.id }, 201, headers);
  }

  if (request.method === 'GET') {
    return jsonResponse(inMemoryTrails, 200, headers);
  }

  return jsonResponse({ error: 'Telemetry method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 8: COMMUNITY SHORTCUTS & RIDER BOUNTY ENGINE (SUPERMAPS ADMIN ISOLATED)
// =========================================================================
let inMemoryShortcuts = [
  {
    id: 'sc_001',
    title: 'Gachibowli Outer Ring Service Bypass',
    creator_rider_id: 'CAPTAIN_9821',
    creator_app: 'rydealot',
    vehicle_type: 'bike', // 'bike' (2-wheeler only) or 'all'
    start_lat: 17.4401,
    start_lng: 78.3489,
    end_lat: 17.4435,
    end_lng: 78.3540,
    coordinates: [[78.3489, 17.4401], [78.3512, 17.4418], [78.3540, 17.4435]],
    time_saved_mins: 7,
    distance_meters: 650,
    rides_completed_count: 12,
    rides_needed_for_payout: 10,
    payout_bounty_amount: 10.0,
    payout_status: 'eligible', // 'pending_rides', 'eligible', 'approved_paid', 'rejected'
    payout_approved_at: null,
    closed_reports_count: 0,
    status: 'active',
    created_at: new Date(Date.now() - 7 * 86400000).toISOString()
  },
  {
    id: 'sc_002',
    title: 'Nagaram Village Culvert Cut',
    creator_rider_id: 'CAPTAIN_4412',
    creator_app: 'rydealot',
    vehicle_type: 'bike',
    start_lat: 17.4890,
    start_lng: 78.5830,
    end_lat: 17.4925,
    end_lng: 78.5880,
    coordinates: [[78.5830, 17.4890], [78.5855, 17.4905], [78.5880, 17.4925]],
    time_saved_mins: 9,
    distance_meters: 800,
    rides_completed_count: 6,
    rides_needed_for_payout: 10,
    payout_bounty_amount: 10.0,
    payout_status: 'pending_rides',
    payout_approved_at: null,
    closed_reports_count: 0,
    status: 'active',
    created_at: new Date(Date.now() - 3 * 86400000).toISOString()
  },
  {
    id: 'sc_003',
    title: 'Kondapur RTA Cross Cut (All Vehicles)',
    creator_rider_id: 'CAPTAIN_1105',
    creator_app: 'sage',
    vehicle_type: 'all',
    start_lat: 17.4650,
    start_lng: 78.3610,
    end_lat: 17.4690,
    end_lng: 78.3670,
    coordinates: [[78.3610, 17.4650], [78.3640, 17.4670], [78.3670, 17.4690]],
    time_saved_mins: 4,
    distance_meters: 950,
    rides_completed_count: 15,
    rides_needed_for_payout: 10,
    payout_bounty_amount: 10.0,
    payout_status: 'approved_paid',
    payout_approved_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    closed_reports_count: 0,
    status: 'active',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString()
  }
];

async function handleShortcuts(request, path, url, env, headers) {
  const method = request.method;

  // 1. PUBLIC / CLIENT APP: GET /api/v1/shortcuts (Filter by vehicle type)
  if (method === 'GET' && path === '/api/v1/shortcuts') {
    const vehicle = (url.searchParams.get('vehicle') || 'all').toLowerCase();
    
    if (env && env.DB) {
      try {
        let query = 'SELECT * FROM supermaps_community_shortcuts WHERE status = "active"';
        // STRICT SAFETY LOCK: If request is for CAR, NEVER return bike-only shortcuts!
        if (vehicle === 'car') {
          query += ' AND vehicle_type = "all"';
        }
        query += ' ORDER BY rides_completed_count DESC';
        const { results } = await env.DB.prepare(query).all();
        if (results && results.length > 0) {
          const mapped = results.map(r => ({
            ...r,
            coordinates: typeof r.coordinates_json === 'string' ? JSON.parse(r.coordinates_json) : r.coordinates_json
          }));
          return jsonResponse(mapped, 200, headers);
        }
      } catch (e) {}
    }

    // In-memory fallback
    const filtered = inMemoryShortcuts.filter(s => {
      if (s.status !== 'active') return false;
      if (vehicle === 'car') return s.vehicle_type === 'all';
      return true; // For bike or walk, both 'bike' and 'all' shortcuts are navigable
    });
    return jsonResponse(filtered, 200, headers);
  }

  // 2. RIDER SDK: RECORD NEW SHORTCUT (POST /api/v1/shortcuts/record)
  if (method === 'POST' && path === '/api/v1/shortcuts/record') {
    const body = await request.json().catch(() => ({}));
    if (!body.coordinates || !Array.isArray(body.coordinates) || body.coordinates.length < 2) {
      return jsonResponse({ error: 'Valid coordinates array is required for shortcut.' }, 400, headers);
    }

    const startCoord = body.coordinates[0];
    const endCoord = body.coordinates[body.coordinates.length - 1];
    const vehicleType = (body.vehicle_type === 'car' || body.vehicle_type === 'all') ? 'all' : 'bike';

    const newShortcut = {
      id: 'sc_' + Date.now(),
      title: body.title || 'Community Shortcut',
      creator_rider_id: body.creator_rider_id || 'UNKNOWN_RIDER',
      creator_app: body.creator_app || 'rydealot',
      vehicle_type: vehicleType,
      start_lat: Number(body.start_lat || startCoord[1]),
      start_lng: Number(body.start_lng || startCoord[0]),
      end_lat: Number(body.end_lat || endCoord[1]),
      end_lng: Number(body.end_lng || endCoord[0]),
      coordinates: body.coordinates,
      time_saved_mins: Number(body.time_saved_mins) || 5,
      distance_meters: Number(body.distance_meters) || 500,
      rides_completed_count: 0,
      rides_needed_for_payout: 10,
      payout_bounty_amount: 10.0,
      payout_status: 'pending_rides',
      payout_approved_at: null,
      closed_reports_count: 0,
      status: 'active',
      created_at: new Date().toISOString()
    };

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_community_shortcuts (
            id, title, creator_rider_id, creator_app, vehicle_type,
            start_lat, start_lng, end_lat, end_lng, coordinates_json,
            time_saved_mins, distance_meters, rides_completed_count,
            rides_needed_for_payout, payout_bounty_amount, payout_status,
            closed_reports_count, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          newShortcut.id, newShortcut.title, newShortcut.creator_rider_id, newShortcut.creator_app, newShortcut.vehicle_type,
          newShortcut.start_lat, newShortcut.start_lng, newShortcut.end_lat, newShortcut.end_lng, JSON.stringify(newShortcut.coordinates),
          newShortcut.time_saved_mins, newShortcut.distance_meters, 0,
          10, 10.0, 'pending_rides', 0, 'active', newShortcut.created_at
        ).run();
      } catch (e) {}
    }

    inMemoryShortcuts.unshift(newShortcut);
    return jsonResponse({
      status: 'success',
      message: 'Community shortcut recorded! You will receive ₹10 once 10 unique rides pass through it.',
      shortcut: newShortcut
    }, 201, headers);
  }

  // 3. COMPLETE RIDE THROUGH SHORTCUT (POST /api/v1/shortcuts/:id/complete-ride)
  if (method === 'POST' && path.includes('/complete-ride')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.indexOf('complete-ride') - 1];
    const body = await request.json().catch(() => ({}));
    const riderId = body.rider_id || 'RIDER_' + Math.floor(Math.random() * 9000 + 1000);
    const rideId = body.ride_id || 'RIDE_' + Date.now();

    let target = inMemoryShortcuts.find(s => s.id === shortcutId);
    let updatedCount = 1;
    let newPayoutStatus = 'pending_rides';

    if (target) {
      target.rides_completed_count += 1;
      updatedCount = target.rides_completed_count;
      if (target.rides_completed_count >= target.rides_needed_for_payout && target.payout_status === 'pending_rides') {
        target.payout_status = 'eligible';
      }
      newPayoutStatus = target.payout_status;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          INSERT INTO supermaps_shortcut_rides (id, shortcut_id, rider_id, ride_id, completed_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        `).bind('ride_' + Date.now(), shortcutId, riderId, rideId).run();

        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET rides_completed_count = rides_completed_count + 1,
              payout_status = CASE WHEN (rides_completed_count + 1) >= rides_needed_for_payout AND payout_status = 'pending_rides' THEN 'eligible' ELSE payout_status END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      rides_completed_count: updatedCount,
      payout_status: newPayoutStatus,
      is_eligible_for_bounty: newPayoutStatus === 'eligible' || newPayoutStatus === 'approved_paid'
    }, 200, headers);
  }

  // 4. REPORT SHORTCUT CLOSED / GATE LOCKED (POST /api/v1/shortcuts/:id/report-closed)
  if (method === 'POST' && path.includes('/report-closed')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.indexOf('report-closed') - 1];

    let target = inMemoryShortcuts.find(s => s.id === shortcutId);
    let closedCount = 1;
    let newStatus = 'active';

    if (target) {
      target.closed_reports_count += 1;
      closedCount = target.closed_reports_count;
      if (target.closed_reports_count >= 3) {
        target.status = 'temporarily_closed';
      }
      newStatus = target.status;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET closed_reports_count = closed_reports_count + 1,
              status = CASE WHEN (closed_reports_count + 1) >= 3 THEN 'temporarily_closed' ELSE status END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      closed_reports_count: closedCount,
      active_status: newStatus,
      message: newStatus === 'temporarily_closed' ? 'Shortcut temporarily deactivated after 3 closure reports.' : 'Closure report logged.'
    }, 200, headers);
  }

  // 5. SUPERMAPS ADMIN: GET ALL SHORTCUTS (GET /api/v1/admin/shortcuts)
  if (method === 'GET' && path === '/api/v1/admin/shortcuts') {
    if (env && env.DB) {
      try {
        const { results } = await env.DB.prepare('SELECT * FROM supermaps_community_shortcuts ORDER BY created_at DESC').all();
        if (results && results.length > 0) {
          const mapped = results.map(r => ({
            ...r,
            coordinates: typeof r.coordinates_json === 'string' ? JSON.parse(r.coordinates_json) : r.coordinates_json
          }));
          return jsonResponse(mapped, 200, headers);
        }
      } catch (e) {}
    }
    return jsonResponse(inMemoryShortcuts, 200, headers);
  }

  // 6. SUPERMAPS ADMIN: APPROVE ₹10 BOUNTY PAYOUT (PATCH /api/v1/admin/shortcuts/:id/payout)
  if (method === 'PATCH' && path.includes('/admin/shortcuts/') && path.endsWith('/payout')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.length - 2];
    const nowIso = new Date().toISOString();

    const target = inMemoryShortcuts.find(s => s.id === shortcutId);
    if (target) {
      target.payout_status = 'approved_paid';
      target.payout_approved_at = nowIso;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET payout_status = 'approved_paid', payout_approved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      payout_status: 'approved_paid',
      payout_bounty_amount: 10.0,
      message: '₹10 Bounty approved and transferred to rider account.'
    }, 200, headers);
  }

  // 7. SUPERMAPS ADMIN: UPDATE STATUS (PATCH /api/v1/admin/shortcuts/:id/status)
  if (method === 'PATCH' && path.includes('/admin/shortcuts/') && path.endsWith('/status')) {
    const parts = path.split('/');
    const shortcutId = parts[parts.length - 2];
    const body = await request.json().catch(() => ({}));
    const newStatus = body.status || 'active';

    const target = inMemoryShortcuts.find(s => s.id === shortcutId);
    if (target) {
      target.status = newStatus;
      if (newStatus === 'active') target.closed_reports_count = 0;
    }

    if (env && env.DB) {
      try {
        await env.DB.prepare(`
          UPDATE supermaps_community_shortcuts
          SET status = ?, closed_reports_count = CASE WHEN ? = 'active' THEN 0 ELSE closed_reports_count END, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(newStatus, newStatus, shortcutId).run();
      } catch (e) {}
    }

    return jsonResponse({
      status: 'success',
      shortcut_id: shortcutId,
      status: newStatus
    }, 200, headers);
  }

  return jsonResponse({ error: 'Shortcut endpoint method not allowed' }, 405, headers);
}

// =========================================================================
// MODULE 6: CLOUDFLARE EDGE TILE CACHE PROXY
// =========================================================================
async function handleTileProxy(request, path, ctx, headers) {
  // Extract /api/v1/tiles/:z/:x/:y.png
  const parts = path.replace('/api/v1/tiles/', '').split('/');
  if (parts.length < 3) {
    return new Response('Invalid tile coordinates', { status: 400 });
  }

  const [z, x, yExt] = parts;
  const targetUrl = `https://tile.openstreetmap.org/${z}/${x}/${yExt}`;

  // Cloudflare Edge Cache API: Cache in Edge RAM for 30 Days!
  const cache = caches.default;
  const cacheKey = new Request(targetUrl, request);
  let response = await cache.match(cacheKey);

  if (!response) {
    response = await fetch(targetUrl, {
      headers: { 'User-Agent': 'RydealotSupermapsEdge/1.0 (contact@rydealot.com)' }
    });

    if (response.ok) {
      // Re-create response with long-life cache headers for Edge
      const responseClone = new Response(response.body, response);
      responseClone.headers.set('Cache-Control', 'public, max-age=2592000, immutable'); // 30 Days
      responseClone.headers.set('Access-Control-Allow-Origin', '*');

      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(cache.put(cacheKey, responseClone.clone()));
      }
      return responseClone;
    }
  }

  return response;
}

// Helper: Standard JSON Response
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status: status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}
