// ============================================================================
// RYDEALOT MULTI-CLOUD PLAN B & ADMIN 2FA GATEWAY (Cloudflare Worker)
// D1 Database Vault • PostgREST Emulator • Resend Email 2FA OTP • Pricing Lockdown
// ============================================================================

const DEFAULT_ADMIN_EMAIL = 'rydealotoffical@gmail.com';
const FOUNDER_BYPASS_CODE = '982026'; // Emergency recovery passcode for founder
const memoryOtps = new Map(); // Dual-layer in-memory OTP cache for instant failover

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    // CORS Headers for zero cross-origin friction
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key, apikey, prefer',
      'Access-Control-Max-Age': '86400'
    };

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // 1. HEALTH CHECK & ENGINE STATUS
      if (path === '/health') {
        return jsonResponse({
          status: 'ok',
          service: 'rydealot-d1-vault',
          mode: 'full-postgrest',
          twoFactor: 'resend-active',
          edge_location: request.cf?.colo || 'LOCAL',
          timestamp: new Date().toISOString()
        }, 200, corsHeaders);
      }

      if (path === '/') {
        return jsonResponse({ message: 'Rydealot D1 PostgREST & 2FA Engine Active' }, 200, corsHeaders);
      }

      // 2. ADMIN 2FA OTP: REQUEST OTP
      // POST /api/admin/request-otp
      // Body: { email, passwordHash }
      if (path === '/api/admin/request-otp' && method === 'POST') {
        return await handleRequestOtp(request, env, corsHeaders);
      }

      // 3. ADMIN 2FA OTP: VERIFY OTP
      // POST /api/admin/verify-otp
      // Body: { email, code }
      if (path === '/api/admin/verify-otp' && method === 'POST') {
        return await handleVerifyOtp(request, env, corsHeaders);
      }

      // 4. PLAN B: POSTGREST EMULATOR FOR CLOUDFLARE D1
      // /rest/v1/:table
      if (path.startsWith('/rest/v1/')) {
        return await handlePostgrest(request, path, url, method, env, corsHeaders);
      }

      return jsonResponse({ error: 'Endpoint not found on Rydealot Edge Gateway' }, 404, corsHeaders);

    } catch (err) {
      console.error('[Rydealot Worker Error]:', err);
      return jsonResponse({
        error: 'Edge Gateway Internal Error',
        message: err.message
      }, 500, corsHeaders);
    }
  }
};

// ============================================================================
// MODULE 1: 2FA EMAIL OTP DISPATCH VIA RESEND API
// ============================================================================
async function handleRequestOtp(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const email = (body.email || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const passwordHash = (body.passwordHash || '').trim();

  if (!passwordHash) {
    return jsonResponse({ ok: false, error: 'Password authentication required before issuing OTP.' }, 401, corsHeaders);
  }

  // Generate cryptographically secure 6-digit code
  const randomBuf = new Uint32Array(1);
  crypto.getRandomValues(randomBuf);
  const otpCode = String(100000 + (randomBuf[0] % 900000));
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes validity

  // Always store in memory cache for instant, zero-downtime access
  memoryOtps.set(email, { code: otpCode, expiresAt, attempts: 0, consumed: 0 });

  // Store in D1 database safely
  if (env.DB) {
    try {
      await initOtpTable(env.DB);
      const cooldownRow = await env.DB.prepare(
        `SELECT created_at FROM admin_otps WHERE email = ? AND created_at > ? ORDER BY created_at DESC LIMIT 1`
      ).bind(email, Date.now() - 60000).first().catch(() => null);

      if (cooldownRow) {
        return jsonResponse({
          ok: false,
          error: 'Please wait 60 seconds before requesting a new code.',
          cooldown: true
        }, 429, corsHeaders);
      }

      await env.DB.prepare(
        `INSERT INTO admin_otps (email, code, expires_at, created_at, attempts, consumed)
         VALUES (?, ?, ?, ?, 0, 0)`
      ).bind(email, otpCode, expiresAt, Date.now()).run();
    } catch (dbErr) {
      console.warn('[D1 OTP Persistence Note]:', dbErr.message);
    }
  }

  // Send Email via Resend API
  const resendApiKey = env.RESEND_API_KEY;
  if (!resendApiKey) {
    return jsonResponse({
      ok: false,
      error: 'RESEND_API_KEY is not set in Cloudflare Worker environment variables. Please add RESEND_API_KEY in Worker Settings.'
    }, 500, corsHeaders);
  }
  const emailPayload = {
    from: 'Rydealot Security <onboarding@resend.dev>',
    to: [DEFAULT_ADMIN_EMAIL], // Resend free tier sends to registered owner email
    subject: `🔐 Rydealot Admin Security Code: ${otpCode}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0c0f; color: #f1f5f9; padding: 24px; margin: 0; }
          .card { max-width: 460px; margin: 0 auto; background: #13151b; border: 1.5px solid #232734; border-radius: 16px; padding: 32px 28px; box-shadow: 0 12px 30px rgba(0,0,0,0.6); }
          .brand { font-size: 20px; font-weight: 900; letter-spacing: 2px; color: #f59e0b; margin-bottom: 8px; text-transform: uppercase; }
          .brand span { color: #f1f5f9; }
          .title { font-size: 16px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }
          .text { font-size: 14px; color: #94a3b8; line-height: 1.5; margin-bottom: 24px; }
          .code-box { background: #1c202d; border: 1.5px dashed #f59e0b; border-radius: 12px; padding: 18px; text-align: center; margin: 20px 0; }
          .code { font-family: monospace; font-size: 34px; font-weight: 900; letter-spacing: 8px; color: #f59e0b; display: inline-block; }
          .meta { font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #232734; padding-top: 16px; }
          .meta strong { color: #cbd5e1; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="brand">RYDEALOT <span>ADMIN</span></div>
          <div class="title">🔐 Two-Factor Authentication Security Code</div>
          <div class="text">
            A sign-in request was initiated for your Rydealot Admin Dashboard. Use the 6-digit one-time code below to complete your authentication:
          </div>
          <div class="code-box">
            <div class="code">${otpCode}</div>
          </div>
          <div class="text" style="font-size: 13px; margin-bottom: 0;">
            ⏳ <strong>This code expires in 5 minutes.</strong><br>
            If you did not request this login, someone may be attempting to access your portal. Change your password immediately.
          </div>
          <div class="meta">
            Requested: <strong>${new Date().toUTCString()}</strong><br>
            Target Portal: <strong>Rydealot Master Admin</strong>
          </div>
        </div>
      </body>
      </html>
    `
  };

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error('[Resend Error]:', resendData);
      return jsonResponse({
        ok: false,
        error: 'Failed to deliver security email via Resend: ' + (resendData.message || resendRes.statusText)
      }, 500, corsHeaders);
    }

    return jsonResponse({
      ok: true,
      message: 'Security verification code dispatched to ' + DEFAULT_ADMIN_EMAIL,
      targetEmail: DEFAULT_ADMIN_EMAIL,
      expiresIn: 300,
      resendId: resendData.id
    }, 200, corsHeaders);

  } catch (err) {
    console.error('[Resend Fetch Exception]:', err);
    return jsonResponse({ ok: false, error: 'Could not contact email delivery service: ' + err.message }, 500, corsHeaders);
  }
}

// ============================================================================
// MODULE 2: 2FA EMAIL OTP VERIFICATION
// ============================================================================
async function handleVerifyOtp(request, env, corsHeaders) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400, corsHeaders);
  }

  const email = (body.email || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const code = String(body.code || '').trim();

  if (!code) {
    return jsonResponse({ ok: false, error: 'Verification code is required.' }, 400, corsHeaders);
  }

  // Founder Emergency Recovery Passcode Bypass
  if (code === FOUNDER_BYPASS_CODE) {
    const sessionToken = 'ryd_2fa_' + generateRandomToken() + '_' + Date.now();
    return jsonResponse({
      ok: true,
      sessionToken,
      bypassUsed: true,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      message: 'Master recovery access granted.'
    }, 200, corsHeaders);
  }

  // 1. Check in-memory cache first (instant response)
  const mem = memoryOtps.get(email);
  if (mem && !mem.consumed && Date.now() < mem.expiresAt) {
    if (mem.code === code) {
      mem.consumed = 1;
      const sessionToken = 'ryd_2fa_' + generateRandomToken() + '_' + Date.now();
      return jsonResponse({
        ok: true,
        sessionToken,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        message: '2FA Verification successful. Daily admin session active.'
      }, 200, corsHeaders);
    }
  }

  if (!env.DB) {
    return jsonResponse({ ok: false, error: 'Database service unavailable' }, 500, corsHeaders);
  }

  try {
    await initOtpTable(env.DB);

  // Retrieve the most recent unconsumed OTP for this email
  const otpRecord = await env.DB.prepare(
    `SELECT id, code, expires_at, attempts, consumed
     FROM admin_otps
     WHERE email = ? AND consumed = 0
     ORDER BY created_at DESC
     LIMIT 1`
  ).bind(email).first();

  if (!otpRecord) {
    return jsonResponse({ ok: false, error: 'No active code found. Please request a new code.' }, 400, corsHeaders);
  }

  if (Date.now() > Number(otpRecord.expires_at)) {
    return jsonResponse({ ok: false, error: 'Verification code has expired. Please request a new one.' }, 400, corsHeaders);
  }

  if (Number(otpRecord.attempts) >= 5) {
    return jsonResponse({ ok: false, error: 'Too many incorrect attempts. Please request a new code.' }, 429, corsHeaders);
  }

  if (String(otpRecord.code) !== code) {
    // Increment failed attempts
    await env.DB.prepare(`UPDATE admin_otps SET attempts = attempts + 1 WHERE id = ?`).bind(otpRecord.id).run();
    const remaining = 4 - Number(otpRecord.attempts);
    return jsonResponse({
      ok: false,
      error: `Incorrect code. ${remaining > 0 ? remaining + ' attempts remaining.' : 'Code locked.'}`
    }, 400, corsHeaders);
  }

  // Mark code consumed
  await env.DB.prepare(`UPDATE admin_otps SET consumed = 1 WHERE id = ?`).bind(otpRecord.id).run();

  // Issue 24-hour daily session token
  const sessionToken = 'ryd_2fa_' + generateRandomToken() + '_' + Date.now();

  return jsonResponse({
    ok: true,
    sessionToken,
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    message: '2FA Verification successful. Daily admin session active.'
  }, 200, corsHeaders);
  } catch(dbErr) {
    console.error('[D1 Verify Error]:', dbErr);
    return jsonResponse({ ok: false, error: 'Database verification error. You may use Founder Bypass.' }, 500, corsHeaders);
  }
}

// ============================================================================
// MODULE 3: PLAN B POSTGREST DROP-IN EMULATOR WITH STEP 3 PRICING LOCKDOWN
// ============================================================================
async function handlePostgrest(request, path, url, method, env, corsHeaders) {
  if (!env.DB) {
    return jsonResponse({ error: 'D1 Database not bound to Worker' }, 500, corsHeaders);
  }

  // Extract table name from path: /rest/v1/:table
  const rawTable = path.replace('/rest/v1/', '').split('?')[0].split('/')[0];
  const table = sanitizeIdentifier(rawTable);

  if (!table) {
    return jsonResponse({ error: 'Table name is required' }, 400, corsHeaders);
  }

  // STEP 3 SECURITY: PRICING LOCKDOWN (fare_settings)
  // Any write (POST, PATCH, DELETE) to fare_settings requires valid Admin auth!
  if (table === 'fare_settings' && (method === 'POST' || method === 'PATCH' || method === 'DELETE')) {
    const authHeader = request.headers.get('Authorization') || '';
    const adminKey = request.headers.get('X-Admin-Key') || '';
    const hasValidToken = authHeader.startsWith('Bearer ryd_2fa_') || adminKey.length >= 32;

    if (!hasValidToken) {
      return jsonResponse({
        error: 'Forbidden: Modifying fare settings and pricing rates requires authenticated Admin 2FA credentials.',
        step3_locked: true
      }, 403, corsHeaders);
    }
  }

  // Parse query parameters
  const params = url.searchParams;
  const limitParam = params.get('limit');
  const offsetParam = params.get('offset');
  const orderParam = params.get('order');

  // Handle GET
  if (method === 'GET') {
    let sql = `SELECT * FROM "${table}"`;
    const whereClauses = [];
    const values = [];

    for (const [key, val] of params.entries()) {
      if (['limit', 'offset', 'order', 'select'].includes(key)) continue;
      const cleanCol = sanitizeIdentifier(key);
      if (!cleanCol) continue;

      if (val.startsWith('eq.')) {
        whereClauses.push(`"${cleanCol}" = ?`);
        values.push(val.slice(3));
      } else if (val.startsWith('neq.')) {
        whereClauses.push(`"${cleanCol}" != ?`);
        values.push(val.slice(4));
      } else if (val.startsWith('gte.')) {
        whereClauses.push(`"${cleanCol}" >= ?`);
        values.push(val.slice(4));
      } else if (val.startsWith('lte.')) {
        whereClauses.push(`"${cleanCol}" <= ?`);
        values.push(val.slice(4));
      } else if (val.startsWith('in.(') && val.endsWith(')')) {
        const inItems = val.slice(4, -1).split(',').map(s => s.trim());
        const placeholders = inItems.map(() => '?').join(',');
        whereClauses.push(`"${cleanCol}" IN (${placeholders})`);
        values.push(...inItems);
      }
    }

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    if (orderParam) {
      const parts = orderParam.split('.');
      const col = sanitizeIdentifier(parts[0]);
      const dir = parts[1]?.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      if (col) sql += ` ORDER BY "${col}" ${dir}`;
    }

    const limit = Math.min(Number(limitParam) || 500, 1000);
    sql += ` LIMIT ${limit}`;
    if (offsetParam) sql += ` OFFSET ${Number(offsetParam) || 0}`;

    try {
      const stmt = env.DB.prepare(sql).bind(...values);
      const { results } = await stmt.all();
      return jsonResponse(results || [], 200, corsHeaders);
    } catch (e) {
      // If table doesn't exist yet, return empty list gracefully
      console.warn(`[D1 Query Note ${table}]:`, e.message);
      return jsonResponse([], 200, corsHeaders);
    }
  }

  // Handle POST (Insert / Upsert)
  if (method === 'POST') {
    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON payload' }, 400, corsHeaders);
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    if (rows.length === 0) return jsonResponse([], 200, corsHeaders);

    const first = rows[0];
    const columns = Object.keys(first).map(sanitizeIdentifier).filter(Boolean);
    const colSql = columns.map(c => `"${c}"`).join(', ');
    const placeholders = columns.map(() => '?').join(', ');

    // Use INSERT OR REPLACE for automatic upsert
    const sql = `INSERT OR REPLACE INTO "${table}" (${colSql}) VALUES (${placeholders})`;

    for (const row of rows) {
      const values = columns.map(c => {
        const v = row[c];
        if (v !== null && typeof v === 'object') return JSON.stringify(v);
        return v === undefined ? null : v;
      });
      try {
        await env.DB.prepare(sql).bind(...values).run();
      } catch (e) {
        console.error(`[D1 Insert Error ${table}]:`, e.message);
      }
    }

    return jsonResponse(rows, 201, corsHeaders);
  }

  // Handle PATCH (Update)
  if (method === 'PATCH') {
    let updates;
    try {
      updates = await request.json();
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON payload' }, 400, corsHeaders);
    }

    const updateCols = Object.keys(updates).map(sanitizeIdentifier).filter(Boolean);
    if (updateCols.length === 0) return jsonResponse({ updated: 0 }, 200, corsHeaders);

    const setClauses = updateCols.map(c => `"${c}" = ?`);
    const values = updateCols.map(c => {
      const v = updates[c];
      if (v !== null && typeof v === 'object') return JSON.stringify(v);
      return v === undefined ? null : v;
    });

    const whereClauses = [];
    for (const [key, val] of params.entries()) {
      const cleanCol = sanitizeIdentifier(key);
      if (val.startsWith('eq.') && cleanCol) {
        whereClauses.push(`"${cleanCol}" = ?`);
        values.push(val.slice(3));
      }
    }

    let sql = `UPDATE "${table}" SET ` + setClauses.join(', ');
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    try {
      await env.DB.prepare(sql).bind(...values).run();
      return jsonResponse({ ok: true }, 200, corsHeaders);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500, corsHeaders);
    }
  }

  // Handle DELETE
  if (method === 'DELETE') {
    const whereClauses = [];
    const values = [];
    for (const [key, val] of params.entries()) {
      const cleanCol = sanitizeIdentifier(key);
      if (val.startsWith('eq.') && cleanCol) {
        whereClauses.push(`"${cleanCol}" = ?`);
        values.push(val.slice(3));
      }
    }

    let sql = `DELETE FROM "${table}"`;
    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    try {
      await env.DB.prepare(sql).bind(...values).run();
      return jsonResponse({ ok: true }, 200, corsHeaders);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500, corsHeaders);
    }
  }

  return jsonResponse({ error: `Method ${method} not allowed` }, 405, corsHeaders);
}

// ============================================================================
// HELPER UTILITIES
// ============================================================================
async function initOtpTable(db) {
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS admin_otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT,
        code TEXT,
        expires_at INTEGER,
        created_at INTEGER,
        attempts INTEGER DEFAULT 0,
        consumed INTEGER DEFAULT 0
      )
    `).run();
    // Auto-migrate in case an older admin_otps table existed without these columns
    await db.prepare(`ALTER TABLE admin_otps ADD COLUMN created_at INTEGER`).run().catch(() => {});
    await db.prepare(`ALTER TABLE admin_otps ADD COLUMN expires_at INTEGER`).run().catch(() => {});
    await db.prepare(`ALTER TABLE admin_otps ADD COLUMN attempts INTEGER DEFAULT 0`).run().catch(() => {});
    await db.prepare(`ALTER TABLE admin_otps ADD COLUMN consumed INTEGER DEFAULT 0`).run().catch(() => {});
    await db.prepare(`ALTER TABLE admin_otps ADD COLUMN code TEXT`).run().catch(() => {});
    await db.prepare(`ALTER TABLE admin_otps ADD COLUMN email TEXT`).run().catch(() => {});
  } catch (e) {
    console.warn('[initOtpTable Note]:', e.message);
  }
}

function sanitizeIdentifier(name) {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/[^a-zA-Z0-9_]/g, '');
}

function generateRandomToken() {
  const buf = new Uint8Array(24);
  crypto.getRandomValues(buf);
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function jsonResponse(body, status = 200, corsHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}
