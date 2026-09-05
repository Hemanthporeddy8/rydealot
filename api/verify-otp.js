// /api/verify-otp.js — Vercel serverless function
// Verifies OTP code against SHA-256 hash in Postgres, handles expiry & attempts,
// and issues your own JWT session token (Zero vendor lock-in).

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: 'Email and code are required.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    if (pool) {
      const { rows } = await pool.query(
        `select id, code_hash, attempts, expires_at, consumed
         from otp_codes
         where email = $1
         order by created_at desc
         limit 1`,
        [cleanEmail]
      );

      if (rows.length === 0) {
        return res.status(400).json({ error: 'No code found. Please request a new one.' });
      }

      const row = rows[0];

      if (row.consumed) {
        return res.status(400).json({ error: 'This code was already used. Please request a new one.' });
      }
      if (new Date(row.expires_at) < new Date()) {
        return res.status(400).json({ error: 'This code has expired. Please request a new one.' });
      }
      if (row.attempts >= 5) {
        return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
      }

      const matches = hashCode(String(code).trim()) === row.code_hash;

      if (!matches) {
        await pool.query(`update otp_codes set attempts = attempts + 1 where id = $1`, [row.id]);
        return res.status(400).json({ error: 'Incorrect code. Please try again.' });
      }

      // Mark consumed & upsert user
      await pool.query(`update otp_codes set consumed = true where id = $1`, [row.id]);
      await pool.query(
        `insert into app_users (email, last_login_at) values ($1, now())
         on conflict (email) do update set last_login_at = now()`,
        [cleanEmail]
      );
    }

    // Sign JWT
    const secret = process.env.JWT_SECRET || 'rydealot-pure-auth-jwt-secret-key-2026';
    const token = jwt.sign(
      { email: cleanEmail, role: 'customer' },
      secret,
      { expiresIn: '30d' }
    );

    return res.status(200).json({
      ok: true,
      token,
      user: {
        email: cleanEmail,
        name: cleanEmail.split('@')[0]
      }
    });
  } catch (err) {
    console.error('verify-otp error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
