-- =========================================================================
-- RYDEALOT SUPERMAPS — DATABASE SCHEMA (Supabase & Cloudflare D1 Compatible)
-- =========================================================================

-- 1. LOCAL SHOPKEEPER PROMOTED PINS (The Golden Goose)
CREATE TABLE IF NOT EXISTS supermaps_shops (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,           -- 'food', 'tea', 'kirana', 'salon', 'medical', 'auto', 'repair', 'services'
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    photo_url TEXT,
    tagline TEXT,
    plan_tier TEXT DEFAULT 'trial_3m', -- 'trial_3m', 'pro_6m', 'annual_1y'
    amount_paid REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending', -- 'trial', 'pending', 'active', 'expired'
    is_golden_pin BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);

-- Index for spatial range searches
CREATE INDEX IF NOT EXISTS idx_supermaps_shops_coords 
ON supermaps_shops(latitude, longitude);

-- 2. ANONYMOUS UNMAPPED ROAD TRAILS (5-Car Detection Engine)
CREATE TABLE IF NOT EXISTS supermaps_unmapped_trails (
    id TEXT PRIMARY KEY,
    start_lat REAL NOT NULL,
    start_lng REAL NOT NULL,
    end_lat REAL NOT NULL,
    end_lng REAL NOT NULL,
    coordinates_json TEXT NOT NULL,    -- Array of [lat, lng, speed] breadcrumbs
    car_count INTEGER DEFAULT 1,       -- Increments when unique vehicles drive the same path
    avg_speed_kmh REAL NOT NULL,
    status TEXT DEFAULT 'investigating', -- 'investigating', 'ready_for_review', 'verified_published', 'dismissed'
    satellite_verified BOOLEAN DEFAULT FALSE,
    first_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unmapped_trails_status 
ON supermaps_unmapped_trails(status);

-- 3. PROPRIETARY HIGHWAYS & CUSTOM ROADS (Admin Published)
CREATE TABLE IF NOT EXISTS supermaps_custom_roads (
    id TEXT PRIMARY KEY,
    road_name TEXT NOT NULL,
    road_type TEXT NOT NULL,           -- 'highway_4lane', 'highway_2lane', 'bypass', 'arterial', 'village_connector'
    surface TEXT NOT NULL DEFAULT 'asphalt', -- 'asphalt' (Black), 'concrete' (Grey), 'mud_dirt' (Brown)
    coordinates_geojson TEXT NOT NULL, -- GeoJSON LineString coordinates
    speed_limit INTEGER DEFAULT 80,
    is_toll BOOLEAN DEFAULT FALSE,
    toll_amount REAL DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. ROAD OBSTACLES & HAZARDS (Dormant Engine - Ready for B2B)
CREATE TABLE IF NOT EXISTS supermaps_road_obstacles (
    id TEXT PRIMARY KEY,
    obstacle_type TEXT NOT NULL,       -- 'pothole', 'roadblock', 'waterlogging', 'police_check', 'diversion'
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    reported_by_driver_id TEXT,
    verified_by_driver_id TEXT,
    consensus_confirmed BOOLEAN DEFAULT FALSE,
    reward_disbursed BOOLEAN DEFAULT FALSE,
    reward_amount REAL DEFAULT 5.0,
    status TEXT DEFAULT 'pending',     -- 'pending', 'confirmed', 'cleared'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP
);
