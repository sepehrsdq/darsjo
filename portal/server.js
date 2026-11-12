'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const fsp = fs.promises;
const os = require('os');
const { execFile } = require('child_process');
const express = require('express');
const multer = require('multer');

const { query, pool, initDb } = require('./lib/db');
const sec = require('./lib/security');
const captcha = require('./lib/captcha');
const files = require('./lib/files');
const backup = require('./lib/backup');
const { httpError } = files;

const app = express();
const PORT = Number(process.env.PORT || 8090);
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_TMP = process.env.UPLOAD_TMP || path.join(os.tmpdir(), 'darsjo-uploads');
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_BYTES || 10 * 1024 * 1024 * 1024);

app.disable('x-powered-by');
app.set('trust proxy', 1);

/* ------------------------------------------------------------------ */
/*  security headers                                                   */
/* ------------------------------------------------------------------ */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ')
  );
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(sec.attachUser);
app.use(sec.csrfProtect);

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const buckets = new Map();
function rate(key, max, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  if (b.count > max) return false;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset < now) buckets.delete(k);
}, 60_000).unref();

async function audit(userId, action, detail, ip) {
  try {
    await query(
      'INSERT INTO audit_log (user_id, action, detail, ip) VALUES ($1, $2, $3, $4)',
      [userId || null, action, detail ? JSON.stringify(detail) : null, ip || null]
    );
  } catch (err) {
    console.error('[audit]', err.message);
  }
}

function validateUsername(value) {
  const v = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(v)) {
    throw httpError(400, 'نام کاربری باید ۳ تا ۳۲ کاراکتر و شامل حروف انگلیسی، عدد، نقطه یا خط تیره باشد');
  }
  return v;
}

function validatePassword(value) {
  const p = String(value || '');
  if (p.length < 8) throw httpError(400, 'رمز عبور باید حداقل ۸ کاراکتر باشد');
  if (p.length > 128) throw httpError(400, 'رمز عبور طولانی‌تر از حد مجاز است');
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) throw httpError(400, 'رمز عبور باید شامل حرف و عدد باشد');
  return p;
}

function validateDisplay(value) {
  const s = String(value || '').trim();
  if (s.length < 2 || s.length > 80) throw httpError(400, 'نام و نام خانوادگی را کامل وارد کنید');
  return s;
}

const PALETTE = ['#1E3A5F', '#2563EB', '#0F766E', '#7C3AED', '#B45309', '#BE123C', '#0369A1', '#4D7C0F'];
function colorFor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

async function ownerFrom(req) {
  if (req.user.role === 'admin') {
    const raw = String((req.query && req.query.owner) || (req.body && req.body.owner) || '').trim();
    if (raw) {
      const { rows } = await query(
        'SELECT id, username, display_name, role, quota_bytes FROM users WHERE lower(username) = lower($1) LIMIT 1',
        [raw]
      );
      if (!rows.length) throw httpError(404, 'کاربر مورد نظر یافت نشد');
      return rows[0];
    }
  }
  return {
    id: req.user.id,
    username: req.user.username,
    display_name: req.user.displayName,
    role: req.user.role,
    quota_bytes: req.user.quotaBytes,
  };
}

async function quotaInfo(owner) {
  const used = await files.usageBytes(owner.username);
  const quota = owner.role === 'admin' ? 0 : Number(owner.quota_bytes || 0);
  return { used, quota, unlimited: quota === 0 };
}

function human(bytes) {
  const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
  let n = Number(bytes) || 0;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/* ------------------------------------------------------------------ */
/*  auth                                                               */
/* ------------------------------------------------------------------ */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, name: 'darsjo-portal', version: '2.0.0', time: new Date().toISOString() });
});

app.get('/api/auth/captcha', ah(async (req, res) => {
  if (!rate(`captcha:${sec.clientIp(req)}`, 80, 60_000)) {
    return res.status(429).json({ error: 'درخواست بیش از حد. لطفاً کمی بعد تلاش کنید.' });
  }
  const c = await captcha.create(req);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.json(c);
}));

app.post('/api/auth/login', ah(async (req, res) => {
  const ip = sec.clientIp(req);
  if (!rate(`login:${ip}`, 15, 5 * 60_000)) {
    return res.status(429).json({ error: 'تلاش‌های ناموفق بیش از حد. چند دقیقه بعد تلاش کنید.', captcha: true });
  }

  const { username, password, captchaId, captchaAnswer } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'نام کاربری و رمز عبور لازم است', captcha: true });

  const captchaOk = await captcha.verify(captchaId, captchaAnswer);
  if (!captchaOk) {
    await audit(null, 'login_bad_captcha', { username: String(username).slice(0, 32) }, ip);
    return res.status(400).json({ error: 'کد امنیتی نادرست یا منقضی شده است. کد جدید بگیرید.', captcha: true });
  }

  const { rows } = await query('SELECT * FROM users WHERE lower(username) = lower($1) LIMIT 1', [String(username).trim()]);
  const user = rows[0];
  if (!user || !sec.verifyPassword(password, user.password_hash)) {
    await audit(user ? user.id : null, 'login_failed', { username: String(username).slice(0, 32) }, ip);
    return res.status(401).json({ error: 'نام کاربری یا رمز عبور نادرست است', captcha: true });
  }
  if (!user.is_active) {
    return res.status(403).json({ error: 'این حساب غیرفعال شده است. با مدیر سامانه تماس بگیرید.', captcha: true });
  }

  const session = await sec.createSession(user.id, req, res);
  await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
  await audit(user.id, 'login_ok', null, ip);
  buckets.delete(`login:${ip}`);

  res.json({ user: sec.mapUser(user), csrf: session.csrf });
}));

app.post('/api/auth/logout', ah(async (req, res) => {
  await sec.destroySession(req.sessionId);
  sec.clearSessionCookies(res);
  res.json({ ok: true });
}));

app.get('/api/auth/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'وارد نشده‌اید' });
  let csrf = req.cookies[sec.CSRF_COOKIE];
  if (!csrf) {
    csrf = sec.randomToken(24);
    res.append('Set-Cookie', `${sec.CSRF_COOKIE}=${csrf}; Path=/; Max-Age=43200; Secure; SameSite=Lax`);
  }
  res.json({ user: req.user, csrf });
});

app.post('/api/auth/password', sec.requireAuth, ah(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length || !sec.verifyPassword(currentPassword || '', rows[0].password_hash)) {
    return res.status(400).json({ error: 'رمز عبور فعلی نادرست است' });
  }
  validatePassword(newPassword);
  await query('UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = now() WHERE id = $2', [
    sec.hashPassword(newPassword),
    req.user.id,
  ]);
  await sec.destroyUserSessions(req.user.id, req.sessionId);
  await audit(req.user.id, 'password_change', null, sec.clientIp(req));
  res.json({ ok: true });
}));

/* ------------------------------------------------------------------ */
/*  files                                                              */
/* ------------------------------------------------------------------ */
app.get('/api/files', sec.requireAuth, ah(async (req, res) => {
  const owner = await ownerFrom(req);
  const root = await files.ensureUserRoot(owner.username);
  const rel = files.normalizeRel(req.query.path || '/');
  const data = await files.listDir(root, rel);
  const usage = await quotaInfo(owner);
  res.json({
    owner: { username: owner.username, displayName: owner.display_name || owner.username, role: owner.role },
    path: data.path,
    items: data.items,
    usage,
  });
}));

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_TMP),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}.part`),
});
const upload = multer({ storage: uploadStorage, limits: { fileSize: MAX_UPLOAD, files: 1 } });

app.post('/api/files/upload', sec.requireAuth, upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw httpError(400, 'فایلی انتخاب نشده است');
  let tmp = req.file.path;
  try {
    const owner = await ownerFrom(req);
    const root = await files.ensureUserRoot(owner.username);
    const dirRel = files.normalizeRel(req.query.path || '/');
    const dirAbs = files.safePath(root, dirRel);
    await fsp.mkdir(dirAbs, { recursive: true });

    const info = await quotaInfo(owner);
    if (!info.unlimited && info.used + req.file.size > info.quota) {
      throw httpError(413, `فضای این کاربر کافی نیست (${human(info.used)} از ${human(info.quota)} استفاده شده)`);
    }

    const original = files.safeName(req.file.originalname || 'file');
    const overwrite = String(req.query.overwrite || '') === '1';
    const dest = overwrite ? path.join(dirAbs, original) : await files.uniqueDest(dirAbs, original);

    await fsp.rename(tmp, dest).catch(async (err) => {
      if (err.code === 'EXDEV') {
        await fsp.copyFile(tmp, dest);
        await fsp.unlink(tmp);
      } else throw err;
    });
    tmp = null;

    files.invalidateUsage(owner.username);
    const st = await fsp.stat(dest);
    const rel = files.relJoin(dirRel, path.basename(dest));
    await audit(req.user.id, 'upload', { owner: owner.username, path: rel, size: st.size }, sec.clientIp(req));
    res.json({ ok: true, name: path.basename(dest), path: rel, size: st.size });
  } finally {
    if (tmp) fsp.unlink(tmp).catch(() => {});
  }
}));

app.get('/api/files/download', sec.requireAuth, ah(async (req, res) => {
  const owner = await ownerFrom(req);
  const root = await files.ensureUserRoot(owner.username);
  const rel = files.normalizeRel(req.query.path || '/');
  if (rel === '/') throw httpError(400, 'مسیر فایل لازم است');

  const abs = files.safePath(root, rel);
  const st = await fsp.stat(abs);
  if (!st.isFile()) throw httpError(400, 'این مسیر یک فایل نیست');

  const name = path.basename(abs);
  const ext = files.extOf(name);
  const risky = ext === 'svg' || ext === 'html' || ext === 'htm' || ext === 'xml' || ext === 'xhtml';
  const download = String(req.query.download || '') === '1' || risky;
  res.setHeader('Content-Type', files.mimeOf(name));
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  if (risky) {
    // Never render user-supplied markup on our origin.
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  }
  res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.sendFile(abs);
}));

app.post('/api/files/folder', sec.requireAuth, ah(async (req, res) => {
  const owner = await ownerFrom(req);
  const root = await files.ensureUserRoot(owner.username);
  const parent = files.normalizeRel((req.body && req.body.path) || '/');
  const name = files.safeName(req.body && req.body.name);
  const abs = files.safePath(root, files.relJoin(parent, name));

  try {
    await fsp.mkdir(abs, { recursive: false });
  } catch (err) {
    if (err.code === 'EEXIST') throw httpError(409, 'پوشه‌ای با این نام از قبل وجود دارد');
    throw err;
  }
  await audit(req.user.id, 'folder_create', { owner: owner.username, path: files.relJoin(parent, name) }, sec.clientIp(req));
  res.json({ ok: true, path: files.relJoin(parent, name) });
}));

app.post('/api/files/rename', sec.requireAuth, ah(async (req, res) => {
  const owner = await ownerFrom(req);
  const root = await files.ensureUserRoot(owner.username);
  const rel = files.normalizeRel(req.body && req.body.path);
  if (rel === '/') throw httpError(400, 'مسیر نامعتبر است');

  const name = files.safeName(req.body && req.body.name);
  const abs = files.safePath(root, rel);
  await fsp.access(abs);

  const parent = path.posix.dirname(rel);
  const destRel = files.relJoin(parent === '/' || parent === '.' ? '/' : parent, name);
  const destAbs = files.safePath(root, destRel);
  if (destAbs === abs) return res.json({ ok: true, path: destRel });

  try {
    await fsp.access(destAbs);
    throw httpError(409, 'نام مقصد تکراری است');
  } catch (err) {
    if (err.status) throw err;
  }

  await fsp.rename(abs, destAbs);
  files.invalidateUsage(owner.username);
  await audit(req.user.id, 'rename', { owner: owner.username, from: rel, to: destRel }, sec.clientIp(req));
  res.json({ ok: true, path: destRel });
}));

app.post('/api/files/delete', sec.requireAuth, ah(async (req, res) => {
  const owner = await ownerFrom(req);
  const root = await files.ensureUserRoot(owner.username);
  const rel = files.normalizeRel(req.body && req.body.path);
  if (rel === '/') throw httpError(400, 'ریشه قابل حذف نیست');

  const abs = files.safePath(root, rel);
  await fsp.rm(abs, { recursive: true, force: true });
  files.invalidateUsage(owner.username);
  await audit(req.user.id, 'delete', { owner: owner.username, path: rel }, sec.clientIp(req));
  res.json({ ok: true });
}));

app.get('/api/media', sec.requireAuth, ah(async (req, res) => {
  const owner = await ownerFrom(req);
  const root = await files.ensureUserRoot(owner.username);
  const kind = ['image', 'video', 'audio'].includes(req.query.kind) ? req.query.kind : 'all';
  const items = await files.walkMedia(root, req.query.path || '/', kind, 600);
  res.json({ owner: owner.username, items });
}));

// Recorded class sessions mirrored from the LMS. Teachers see their own; the
// manager sees every recorded session of the school.
app.get('/api/sessions', sec.requireAuth, ah(async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const params = [];
  let where = '';
  if (!isAdmin) {
    where = 'WHERE teacher_username = $1';
    params.push(String(req.user.username || '').toLowerCase());
  }
  const { rows } = await query(
    `SELECT lms_session_id, teacher_username, teacher_name, offering_title, class_name,
            session_number, session_title, session_date, status, recording_name,
            playback_url, download_url, duration_label, recorded_at
       FROM lms_sessions
       ${where}
       ORDER BY session_date DESC NULLS LAST, session_number DESC
       LIMIT 500`,
    params
  );
  res.json({
    items: rows.map((row) => ({
      id: row.lms_session_id,
      teacherUsername: row.teacher_username,
      teacherName: row.teacher_name,
      offeringTitle: row.offering_title,
      className: row.class_name,
      sessionNumber: row.session_number,
      sessionTitle: row.session_title,
      sessionDate: row.session_date,
      status: row.status,
      recordingName: row.recording_name,
      playbackUrl: row.playback_url,
      downloadUrl: row.download_url,
      durationLabel: row.duration_label,
      recordedAt: row.recorded_at,
    })),
  });
}));

/* ------------------------------------------------------------------ */
/*  admin                                                              */
/* ------------------------------------------------------------------ */
app.get('/api/owners', sec.requireAdmin, ah(async (req, res) => {
  const { rows } = await query(
    'SELECT id, username, display_name, role, quota_bytes, is_active FROM users ORDER BY role DESC, lower(username)'
  );
  const owners = [];
  for (const u of rows) {
    owners.push({
      id: Number(u.id),
      username: u.username,
      displayName: u.display_name || u.username,
      role: u.role,
      quotaBytes: Number(u.quota_bytes),
      used: await files.usageBytes(u.username),
      isActive: u.is_active,
    });
  }
  res.json({ owners });
}));

app.get('/api/admin/users', sec.requireAdmin, ah(async (req, res) => {
  const { rows } = await query('SELECT * FROM users ORDER BY role DESC, lower(username)');
  const users = [];
  for (const u of rows) {
    users.push({ ...sec.mapUser(u), used: await files.usageBytes(u.username) });
  }
  res.json({ users });
}));

app.post('/api/admin/users', sec.requireAdmin, ah(async (req, res) => {
  const body = req.body || {};
  const username = validateUsername(body.username);
  const displayName = validateDisplay(body.displayName);
  const role = body.role === 'admin' ? 'admin' : 'teacher';
  validatePassword(body.password);
  const quotaGB = Number(body.quotaGB == null ? 15 : body.quotaGB);
  const quota = role === 'admin' ? 0 : Math.round(quotaGB * 1024 ** 3);
  if (role !== 'admin' && (!Number.isFinite(quota) || quota < 1024 ** 3 || quota > 500 * 1024 ** 3)) {
    throw httpError(400, 'سهمیه باید بین ۱ تا ۵۰۰ گیگابایت باشد');
  }

  let row;
  try {
    const result = await query(
      `INSERT INTO users (username, display_name, role, password_hash, quota_bytes, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [username, displayName, role, sec.hashPassword(body.password), quota, colorFor(username)]
    );
    row = result.rows[0];
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'این نام کاربری قبلاً ثبت شده است');
    throw err;
  }

  await files.ensureUserRoot(username);
  await audit(req.user.id, 'user_create', { username, role }, sec.clientIp(req));
  res.status(201).json({ user: { ...sec.mapUser(row), used: 0 } });
}));

app.patch('/api/admin/users/:id', sec.requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'شناسه نامعتبر است');

  const { rows: existing } = await query('SELECT * FROM users WHERE id = $1', [id]);
  const user = existing[0];
  if (!user) throw httpError(404, 'کاربر یافت نشد');

  const body = req.body || {};
  const sets = [];
  const vals = [];
  let i = 1;

  if (body.displayName != null) {
    sets.push(`display_name = $${i++}`);
    vals.push(validateDisplay(body.displayName));
  }

  if (body.role != null) {
    if (!['teacher', 'admin'].includes(body.role)) throw httpError(400, 'نقش نامعتبر است');
    if (user.role === 'admin' && body.role !== 'admin') {
      const { rows } = await query("SELECT count(*)::int AS c FROM users WHERE role = 'admin'");
      if (rows[0].c <= 1) throw httpError(400, 'حداقل یک مدیر باید در سامانه باقی بماند');
    }
    sets.push(`role = $${i++}`);
    vals.push(body.role);
    if (body.role === 'admin') {
      sets.push(`quota_bytes = $${i++}`);
      vals.push(0);
    }
  }

  const effectiveRole = body.role != null ? body.role : user.role;
  if (body.quotaGB != null && effectiveRole !== 'admin') {
    const quota = Math.round(Number(body.quotaGB) * 1024 ** 3);
    if (!Number.isFinite(quota) || quota < 1024 ** 3 || quota > 500 * 1024 ** 3) {
      throw httpError(400, 'سهمیه باید بین ۱ تا ۵۰۰ گیگابایت باشد');
    }
    sets.push(`quota_bytes = $${i++}`);
    vals.push(quota);
  }

  if (body.isActive != null) {
    const active = !!body.isActive;
    if (id === req.user.id && !active) throw httpError(400, 'نمی‌توانید حساب خودتان را غیرفعال کنید');
    if (!active && user.role === 'admin') {
      const { rows } = await query("SELECT count(*)::int AS c FROM users WHERE role = 'admin' AND is_active = TRUE");
      if (rows[0].c <= 1) throw httpError(400, 'حداقل یک مدیر فعال لازم است');
    }
    sets.push(`is_active = $${i++}`);
    vals.push(active);
  }

  if (body.password) {
    validatePassword(body.password);
    sets.push(`password_hash = $${i++}`);
    vals.push(sec.hashPassword(body.password));
    sets.push('must_change_password = FALSE');
  }

  if (!sets.length) return res.json({ user: { ...sec.mapUser(user), used: await files.usageBytes(user.username) } });

  sets.push('updated_at = now()');
  vals.push(id);
  const { rows } = await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, vals);

  if (body.password || body.isActive === false) {
    await sec.destroyUserSessions(id, id === req.user.id ? req.sessionId : null);
  }

  await audit(req.user.id, 'user_update', { username: user.username }, sec.clientIp(req));
  res.json({ user: { ...sec.mapUser(rows[0]), used: await files.usageBytes(rows[0].username) } });
}));

app.delete('/api/admin/users/:id', sec.requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'شناسه نامعتبر است');
  if (id === req.user.id) throw httpError(400, 'حساب خودتان را نمی‌توانید حذف کنید');

  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  const user = rows[0];
  if (!user) throw httpError(404, 'کاربر یافت نشد');

  if (user.role === 'admin') {
    const { rows: admins } = await query("SELECT count(*)::int AS c FROM users WHERE role = 'admin'");
    if (admins[0].c <= 1) throw httpError(400, 'آخرین مدیر سامانه قابل حذف نیست');
  }

  await query('DELETE FROM users WHERE id = $1', [id]);

  // Archive the folder instead of destroying data.
  try {
    const src = files.userRoot(user.username);
    const trash = path.join(files.ROOT, '_deleted');
    await fsp.mkdir(trash, { recursive: true });
    await fsp.rename(src, path.join(trash, `${user.username}-${Date.now()}`));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[archive-user]', err.message);
  }

  files.invalidateUsage(user.username);
  await audit(req.user.id, 'user_delete', { username: user.username }, sec.clientIp(req));
  res.json({ ok: true });
}));

/* Mirrored deletion requested by the LMS (HMAC signed, no browser session). */
app.post('/api/internal/users/delete', ah(async (req, res) => {
  const secret = process.env.INTERNAL_SECRET || '';
  const username = String((req.body && req.body.username) || '').trim().toLowerCase();
  const signature = String(req.get('x-darsjo-signature') || '');
  if (!secret || !username || !signature) throw httpError(400, 'درخواست نامعتبر است');

  const expected = crypto.createHmac('sha256', secret).update(username).digest('hex');
  const given = Buffer.from(signature, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) {
    throw httpError(403, 'امضای درخواست نامعتبر است');
  }

  const { rows } = await query('SELECT * FROM users WHERE lower(username) = $1', [username]);
  const user = rows[0];
  if (!user) return res.json({ ok: true, deleted: false });

  if (user.role === 'admin') {
    const { rows: admins } = await query("SELECT count(*)::int AS c FROM users WHERE role = 'admin'");
    if (admins[0].c <= 1) throw httpError(409, 'آخرین مدیر سامانه قابل حذف نیست');
  }

  await query('DELETE FROM users WHERE id = $1', [user.id]);

  // Archive the folder instead of destroying files; username reuse stays safe.
  try {
    const src = files.userRoot(user.username);
    const trash = path.join(files.ROOT, '_deleted');
    await fsp.mkdir(trash, { recursive: true });
    await fsp.rename(src, path.join(trash, `${user.username}-${Date.now()}`));
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('[archive-user]', err.message);
  }

  files.invalidateUsage(user.username);
  await audit(null, 'user_delete', { username: user.username, source: 'lms' }, sec.clientIp(req));
  res.json({ ok: true, deleted: true });
}));

/* ------------------------------------------------------------------ */
/*  backups (admin only)                                               */
/* ------------------------------------------------------------------ */
app.get('/api/admin/backups', sec.requireAdmin, ah(async (req, res) => {
  const [settings, runs, sum] = await Promise.all([
    backup.getSettings(),
    backup.listRuns(60),
    backup.summary(),
  ]);
  res.json({ settings, runs, summary: sum, serverTime: new Date().toISOString(), timeZone: 'Asia/Tehran' });
}));

app.post('/api/admin/backups/run', sec.requireAdmin, ah(async (req, res) => {
  const kind = String((req.body && req.body.kind) || '');
  const run = await backup.startBackup({ kind, mode: 'manual', userId: req.user.id });
  await audit(req.user.id, 'backup_start', { kind, mode: 'manual' }, sec.clientIp(req));
  res.status(202).json({ run });
}));

app.put('/api/admin/backups/settings', sec.requireAdmin, ah(async (req, res) => {
  const settings = await backup.saveSettings(req.body || {});
  await audit(req.user.id, 'backup_settings', settings, sec.clientIp(req));
  res.json({ settings });
}));

app.get('/api/admin/backups/:id/download', sec.requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'شناسه نامعتبر است');

  const run = await backup.findRun(id);
  if (!run) throw httpError(404, 'نسخهٔ پشتیبان یافت نشد');
  if (run.status !== 'ok' || !run.file_path) throw httpError(400, 'این نسخه قابل دانلود نیست');

  const abs = path.resolve(run.file_path);
  if (abs !== backup.ROOT && !abs.startsWith(backup.ROOT + path.sep)) throw httpError(400, 'مسیر نامعتبر است');

  res.setHeader('Cache-Control', 'no-store');
  res.download(abs, path.basename(abs), (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'فایل بکاپ روی سرور موجود نیست' });
  });
}));

app.delete('/api/admin/backups/:id', sec.requireAdmin, ah(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'شناسه نامعتبر است');

  await backup.deleteRun(id);
  await audit(req.user.id, 'backup_delete', { id }, sec.clientIp(req));
  res.json({ ok: true });
}));

app.get('/api/admin/stats', sec.requireAdmin, ah(async (req, res) => {
  const { rows: counts } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE role = 'teacher')::int AS teachers,
            count(*) FILTER (WHERE role = 'admin')::int AS admins,
            count(*) FILTER (WHERE is_active)::int AS active
       FROM users`
  );
  const { rows: users } = await query('SELECT username, display_name, role, quota_bytes, is_active FROM users');

  let used = 0;
  const perUser = [];
  for (const u of users) {
    const bytes = await files.usageBytes(u.username);
    used += bytes;
    perUser.push({
      username: u.username,
      displayName: u.display_name || u.username,
      role: u.role,
      used: bytes,
      quota: Number(u.quota_bytes),
      isActive: u.is_active,
    });
  }
  perUser.sort((a, b) => b.used - a.used);

  let fileCount = 0;
  try {
    fileCount = await new Promise((resolve) => {
      execFile('bash', ['-lc', `find ${JSON.stringify(files.ROOT)} -type f 2>/dev/null | wc -l`], { timeout: 30_000 }, (err, stdout) => {
        resolve(err ? 0 : parseInt(String(stdout).trim(), 10) || 0);
      });
    });
  } catch { /* ignore */ }

  let disk = null;
  try {
    const st = await fsp.statfs(files.ROOT);
    disk = { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
  } catch { /* ignore */ }

  res.json({ stats: { ...counts[0], usedBytes: used, fileCount, disk }, perUser });
}));

/* ------------------------------------------------------------------ */
/*  static SPA                                                         */
/* ------------------------------------------------------------------ */
app.use(express.static(PUBLIC_DIR, { index: 'index.html', maxAge: '1h', etag: true }));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return next();
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

/* ------------------------------------------------------------------ */
/*  errors                                                             */
/* ------------------------------------------------------------------ */
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: `حجم فایل بیش از حد مجاز است (حداکثر ${human(MAX_UPLOAD)})` });
    }
    return res.status(400).json({ error: `خطای بارگذاری: ${err.code}` });
  }
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ error: status >= 500 ? 'خطای داخلی سرور' : err.message });
});

/* ------------------------------------------------------------------ */
/*  bootstrap                                                          */
/* ------------------------------------------------------------------ */
async function bootstrapAdmin() {
  const { rows } = await query("SELECT count(*)::int AS c FROM users WHERE role = 'admin'");
  if (rows[0].c === 0) {
    const username = String(process.env.ADMIN_USERNAME || 'admin').toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    if (!password) {
      throw new Error('ADMIN_PASSWORD must be set before the first admin account is created');
    }
    const displayName = process.env.ADMIN_DISPLAY_NAME || 'مدیر سامانه';
    await query(
      `INSERT INTO users (username, display_name, role, password_hash, quota_bytes, avatar_color)
       VALUES ($1, $2, 'admin', $3, 0, $4)`,
      [username, displayName, sec.hashPassword(password), colorFor(username)]
    );
    await files.ensureUserRoot(username);
    console.log('[bootstrap] admin account created:', username);
  }
}

async function start() {
  await fsp.mkdir(UPLOAD_TMP, { recursive: true });
  await fsp.mkdir(files.ROOT, { recursive: true });
  await fsp.mkdir(backup.ROOT, { recursive: true });
  await initDb();
  await bootstrapAdmin();
  await backup.importExisting();
  backup.startScheduler();

  const { rows: all } = await query('SELECT username FROM users');
  for (const u of all) await files.ensureUserRoot(u.username);

  setInterval(() => {
    query("DELETE FROM captchas WHERE expires_at < now() - interval '1 day'").catch(() => {});
    query("DELETE FROM sessions WHERE expires_at < now() - interval '7 days'").catch(() => {});
  }, 60 * 60 * 1000).unref();

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[darsjo-portal] listening on 127.0.0.1:${PORT}`);
    console.log(`[darsjo-portal] files root: ${files.ROOT}`);
  });
}

start().catch((err) => {
  console.error('[darsjo-portal] fatal:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
});
