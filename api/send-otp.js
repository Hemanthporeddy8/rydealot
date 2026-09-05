// /api/send-otp.js — Vercel serverless function
// Generates a 6-digit OTP, stores its SHA-256 HASH in Postgres with 5-min expiry,
// and emails the code via SMTP using Nodemailer (100% self-hosted, zero third-party auth lock-in).

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { Pool } = require('pg');

let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
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

  const { email } = req.body || {};
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  const cleanEmail = email.trim().toLowerCase();

  try {
    const code = String(crypto.randomInt(100000, 999999)); // 6-digit OTP
    const codeHash = hashCode(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    if (pool) {
      // Check rate-limit (30s cooldown)
      const recent = await pool.query(
        `select created_at from otp_codes
         where email = $1 and consumed = false and created_at > now() - interval '30 seconds'
         order by created_at desc limit 1`,
        [cleanEmail]
      );
      if (recent.rows && recent.rows.length > 0) {
        return res.status(429).json({ error: 'Please wait before requesting another code.' });
      }

      await pool.query(
        `insert into otp_codes (email, code_hash, expires_at) values ($1, $2, $3)`,
        [cleanEmail, codeHash, expiresAt]
      );
    }

    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = getTransporter();
      await transporter.sendMail({
        from: `"Rydealot" <${process.env.SMTP_USER}>`,
        to: cleanEmail,
        subject: 'Your Rydealot verification code',
        text: `Your Rydealot verification code is ${code}. It expires in 5 minutes.`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:12px;">
            <h2 style="color:#0f172a;margin-top:0;">Rydealot Verification</h2>
            <p style="color:#475569;font-size:15px;">Use the 6-digit verification code below to complete your sign in:</p>
            <div style="background:#f8fafc;padding:16px;border-radius:8px;text-align:center;margin:20px 0;">
              <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#2563eb;font-family:monospace;">${code}</span>
            </div>
            <p style="color:#64748b;font-size:13px;margin-bottom:0;">This code expires in 5 minutes. If you did not request this code, you can safely ignore this email.</p>
          </div>
        `
      });
    } else {
      console.log(`[Rydealot OTP Simulator] Code for ${cleanEmail}: ${code}`);
    }

    return res.status(200).json({ ok: true, message: 'Verification code sent.' });
  } catch (err) {
    console.error('send-otp error:', err);
    return res.status(500).json({ error: 'Could not send the code. Please try again.' });
  }
};
