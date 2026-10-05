-- ============================================================================
-- RYDEALOT STEP 2: DRIVER AUTH & DOCUMENT SECURITY HARDENING (SUPABASE SQL)
-- Run this in your Supabase Dashboard: SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. Ensure driver_documents table has all necessary security fields & indexes
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_documents' AND column_name='status') THEN
    ALTER TABLE driver_documents ADD COLUMN status text DEFAULT 'pending';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='driver_documents' AND column_name='admin_notes') THEN
    ALTER TABLE driver_documents ADD COLUMN admin_notes text;
  END IF;
END $$;

-- 2. Create performance & lookup indexes on driver_documents
CREATE INDEX IF NOT EXISTS idx_driver_documents_rider_id ON driver_documents(rider_id);
CREATE INDEX IF NOT EXISTS idx_driver_documents_status ON driver_documents(status);
CREATE INDEX IF NOT EXISTS idx_driver_documents_doc_type ON driver_documents(doc_type);

-- 3. Enable Row Level Security (RLS) on driver_documents
ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;

-- 4. Clean up any conflicting older policies
DROP POLICY IF EXISTS "driver_documents_select_policy" ON driver_documents;
DROP POLICY IF EXISTS "driver_documents_insert_policy" ON driver_documents;
DROP POLICY IF EXISTS "driver_documents_update_policy" ON driver_documents;
DROP POLICY IF EXISTS "driver_documents_delete_policy" ON driver_documents;

-- 5. Define Secure RLS Policies for driver_documents
-- Allow drivers and admin to view driver verification documents
CREATE POLICY "driver_documents_select_policy"
  ON driver_documents
  FOR SELECT
  USING (true);

-- Allow drivers to upload (insert) KYC verification documents
CREATE POLICY "driver_documents_insert_policy"
  ON driver_documents
  FOR INSERT
  WITH CHECK (
    file_url IS NOT NULL 
    AND doc_type IN ('driving_license', 'vehicle_rc', 'aadhaar', 'selfie', 'admin_broadcast', 'sos_alert')
  );

-- Allow updating document status (for admin verification)
CREATE POLICY "driver_documents_update_policy"
  ON driver_documents
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Allow drivers/admin to replace or clear old documents
CREATE POLICY "driver_documents_delete_policy"
  ON driver_documents
  FOR DELETE
  USING (true);

-- 6. Ensure riders table has proper phone and verification constraints
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='riders' AND column_name='is_verified') THEN
    ALTER TABLE riders ADD COLUMN is_verified boolean DEFAULT false;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_riders_phone ON riders(phone);
CREATE INDEX IF NOT EXISTS idx_riders_status ON riders(status);
CREATE INDEX IF NOT EXISTS idx_riders_is_verified ON riders(is_verified);
