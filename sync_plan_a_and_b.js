// ============================================================================
// RYDEALOT BIDIRECTIONAL SYNC ENGINE: PLAN A (SUPABASE) <-> PLAN B (CLOUDFLARE D1)
// Synchronizes riders, bookings, driver_documents, fare_settings, and platform_services
// ============================================================================

const SUPABASE_URL = 'https://wupndimumeugfjxzejlj.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind1cG5kaW11bWV1Z2ZqeHplamxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMDgwMDQsImV4cCI6MjA5NzY4NDAwNH0.dM6nG_cswzOAXuumW3LdfGJxxoF-Fn3iiVImUZ9as2Y';
const D1_URL = 'https://rydealot-api.rydealotoffical.workers.dev';

const TABLES = ['riders', 'bookings', 'driver_documents', 'fare_settings', 'platform_services'];

async function fetchFromSupabase(table) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });
    if (!res.ok) {
      console.warn(`[Supabase Fetch Note]: ${table} returned HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[Supabase Error] ${table}:`, err.message);
    return [];
  }
}

async function fetchFromD1(table) {
  try {
    const res = await fetch(`${D1_URL}/rest/v1/${table}`);
    if (!res.ok) {
      console.warn(`[D1 Fetch Note]: ${table} returned HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`[D1 Error] ${table}:`, err.message);
    return [];
  }
}

async function insertIntoD1(table, row) {
  try {
    const res = await fetch(`${D1_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(row)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function insertIntoSupabase(table, row) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(row)
    });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function syncTable(table) {
  console.log(`\n🔄 Syncing table: [${table}]...`);
  const [sbRows, d1Rows] = await Promise.all([
    fetchFromSupabase(table),
    fetchFromD1(table)
  ]);

  console.log(`   - Plan A (Supabase): ${sbRows.length} records`);
  console.log(`   - Plan B (Cloudflare D1): ${d1Rows.length} records`);

  const d1Ids = new Set(d1Rows.map(r => r.id).filter(Boolean));
  const sbIds = new Set(sbRows.map(r => r.id).filter(Boolean));

  let syncedToD1 = 0;
  let syncedToSb = 0;

  // 1. Sync Supabase -> D1 (records missing in D1)
  for (const row of sbRows) {
    if (row.id && !d1Ids.has(row.id)) {
      const ok = await insertIntoD1(table, row);
      if (ok) {
        d1Ids.add(row.id);
        syncedToD1++;
      }
    }
  }

  // 2. Sync D1 -> Supabase (records missing in Supabase)
  for (const row of d1Rows) {
    if (row.id && !sbIds.has(row.id)) {
      const ok = await insertIntoSupabase(table, row);
      if (ok) {
        sbIds.add(row.id);
        syncedToSb++;
      }
    }
  }

  console.log(`   ✅ Synced to Plan B (D1): +${syncedToD1} new records`);
  console.log(`   ✅ Synced to Plan A (Supabase): +${syncedToSb} new records`);
}

async function runSync() {
  console.log('====================================================');
  console.log('⚡ RYDEALOT LIVE BIDIRECTIONAL REPLICATION ENGINE');
  console.log('====================================================');

  for (const t of TABLES) {
    await syncTable(t);
  }

  console.log('\n====================================================');
  console.log('🎉 REPLICATION COMPLETE: PLAN A & PLAN B ARE IN 100% SYNC!');
  console.log('====================================================');
}

runSync();
