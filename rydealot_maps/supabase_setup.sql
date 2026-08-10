-- RYDEALOT MAPS — DATABASE SCHEMA SETUP SCRIPT
-- Paste and run this script in your Supabase SQL Editor (SQL Query Runner)

-- 1. Create Custom Places & Landmarks Table
CREATE TABLE IF NOT EXISTS public.map_places (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'food',
  lat NUMERIC NOT NULL,
  lng NUMERIC NOT NULL,
  address TEXT,
  verified BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Custom Buildings & Polygons Table
CREATE TABLE IF NOT EXISTS public.map_buildings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'residential',
  geometry JSONB NOT NULL, -- Stores GeoJSON Polygon / MultiPolygon
  status TEXT DEFAULT 'active', -- 'active', 'demolished', 'under_construction'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create User Edit Suggestions & Demolition Reports Table
CREATE TABLE IF NOT EXISTS public.map_edits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  suggested_by TEXT DEFAULT 'User',
  type TEXT NOT NULL, -- 'new_place', 'demolition', 'road_fix'
  details JSONB NOT NULL,
  status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Public Read & Write Access (Row Level Security)
ALTER TABLE public.map_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_edits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read/write map_places" ON public.map_places FOR ALL USING (true);
CREATE POLICY "Allow public read/write map_buildings" ON public.map_buildings FOR ALL USING (true);
CREATE POLICY "Allow public read/write map_edits" ON public.map_edits FOR ALL USING (true);
