'use strict';

const crypto = require('crypto');
const { query } = require('./db');

const SESSION_COOKIE = 'darsjo_sid';
const CSRF_COOKIE = 'darsjo_csrf';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;   // 12h
const SESSION_SLIDE_MS = 6 * 60 * 60 * 1000;  // renew when < 6h left

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/* ---------- password hashing (scrypt, no external deps) ---------- */

function hashPassword(password) {
  const N = 16384, r = 8, p = 1, keylen = 64;
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 });
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  try {
    const [algo, sN, sR, sP, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const N = Number(sN), r = Number(sR), p = Number(sP);
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N, r, p, maxmem: 128 * N * r * 2 });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* ---------- cookies ---------- */

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const pair of header.split(';')) {
    const i = pair.indexOf('=');
    if (i < 0) continue;
    const key = pair.slice(0, i).trim();
    if (!key) continue;
    let value = pair.slice(i + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

function cookieString(name, value, opts = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${opts.path || '/'}`);
  if (opts.maxAge != null) parts.push(`Max-Age=${Math.floor(opts.maxAge / 1000)}`);
  if (opts.httpOnly !== false) parts.push('HttpOnly');
  if (opts.secure !== false) parts.push('Secure');
  parts.push(`SameSite=${opts.sameSite || 'Lax'}`);
  return parts.join('; ');
}

function setSessionCookies(res, token, csrf) {
  res.append('Set-Cookie', cookieString(SESSION_COOKIE, token, { maxAge: SESSION_TTL_MS, httpOnly: true }));
  res.append('Set-Cookie', cookieString(CSRF_COOKIE, csrf, { maxAge: SESSION_TTL_MS, httpOnly: false }));
}

function clearSessionCookies(res) {
  res.append('Set-Cookie', cookieString(SESSION_COOKIE, '', { maxAge: 0, httpOnly: true }));
  res.append('Set-Cookie', cookieString(CSRF_COOKIE, '', { maxAge: 0, httpOnly: false }));
}

/* ---------- request middleware ---------- */

function mapUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    displayName: row.display_name || row.username,
    role: row.role,
    quotaBytes: Number(row.quota_bytes || 0),
    isActive: row.is_active !== false,
    mustChangePassword: row.must_change_password === true,
    avatarColor: row.avatar_color || '',
    lastLoginAt: row.last_login_at || null,
    createdAt: row.created_at || null,
  };
}

async function attachUser(req, res, next) {
  try {
    req.cookies = parseCookies(req.headers.cookie);
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return next();

    const tokenHash = sha256(token);
    const { rows } = await query(
      `SELECT s.id AS sid, s.expires_at, s.csrf, u.*
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now() AND u.is_active = TRUE
        LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) {
      clearSessionCookies(res);
      return next();
    }

    const row = rows[0];
    req.user = mapUser(row);
    req.sessionId = row.sid;

    // sliding expiration
    const expires = new Date(row.expires_at).getTime();
    if (expires - Date.now() < SESSION_SLIDE_MS) {
      const nextExpiry = new Date(Date.now() + SESSION_TTL_MS);
      await query('UPDATE sessions SET expires_at = $1 WHERE id = $2', [nextExpiry, row.sid]);
      res.append('Set-Cookie', cookieString(SESSION_COOKIE, token, { maxAge: SESSION_TTL_MS, httpOnly: true }));
      res.append('Set-Cookie', cookieString(CSRF_COOKIE, req.cookies[CSRF_COOKIE] || '', { maxAge: SESSION_TTL_MS, httpOnly: false }));
    }
    next();
  } catch (err) {
    next(err);
  }
}

function csrfProtect(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // Login/logout happen before a CSRF cookie may exist; login is protected by captcha + SameSite.
  if (req.path === '/api/auth/login') return next();
  // Server-to-server calls carry an HMAC signature instead of a browser session.
  if (req.path === '/api/internal/users/delete') return next();
  const cookie = req.cookies && req.cookies[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie !== header) {
    return res.status(403).json({ error: 'توکن امنیتی نامعتبر است. صفحه را تازه کنید.' });
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'وارد نشده‌اید' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'وارد نشده‌اید' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'دسترسی مدیر لازم است' });
  next();
}

/* ---------- sessions ---------- */

async function createSession(userId, req, res, csrf) {
  const token = randomToken(32);
  const tokenHash = sha256(token);
  const id = crypto.randomUUID();
  const expires = new Date(Date.now() + SESSION_TTL_MS);
  const csrfToken = csrf || randomToken(24);
  await query(
    `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, expires_at, csrf)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, userId, tokenHash, clientIp(req), String(req.get('user-agent') || '').slice(0, 300), expires, csrfToken]
  );
  setSessionCookies(res, token, csrfToken);
  return { id, csrf: csrfToken };
}

async function destroySession(sessionId) {
  if (!sessionId) return;
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

async function destroyUserSessions(userId, exceptSessionId) {
  if (exceptSessionId) {
    await query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [userId, exceptSessionId]);
  } else {
    await query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  }
}

function clientIp(req) {
  const xff = req.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim().slice(0, 64);
  return String(req.ip || req.socket?.remoteAddress || '').slice(0, 64);
}

module.exports = {
  SESSION_COOKIE,
  CSRF_COOKIE,
  sha256,
  randomToken,
  hashPassword,
  verifyPassword,
  parseCookies,
  setSessionCookies,
  clearSessionCookies,
  attachUser,
  csrfProtect,
  requireAuth,
  requireAdmin,
  createSession,
  destroySession,
  destroyUserSessions,
  mapUser,
  clientIp,
};
