'use strict';

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn, execFile } = require('child_process');
const { query } = require('./db');
const { httpError } = require('./files');

const ROOT = path.resolve(process.env.BACKUP_ROOT || '/srv/backup');
const TZ = process.env.BACKUP_TZ || 'Asia/Tehran';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DEFAULTS = {
  // The school asked for manual backups for now. Automatic scheduling stays
  // available in code so it can be enabled later without a redeploy.
  autoEnabled: 'false',
  dbTime: '03:17',
  filesDay: 'Sun',
  filesTime: '03:42',
  retentionDb: '21',
  retentionFiles: '35',
};

/* ------------------------------------------------------------------ */
/*  settings                                                           */
/* ------------------------------------------------------------------ */
function typedSettings(raw) {
  return {
    autoEnabled: raw.autoEnabled === 'true',
    dbTime: raw.dbTime || DEFAULTS.dbTime,
    filesDay: DAYS.includes(raw.filesDay) ? raw.filesDay : DEFAULTS.filesDay,
    filesTime: raw.filesTime || DEFAULTS.filesTime,
    retentionDb: Math.max(1, Math.min(365, Number(raw.retentionDb) || 21)),
    retentionFiles: Math.max(1, Math.min(365, Number(raw.retentionFiles) || 35)),
  };
}

async function getSettings() {
  const { rows } = await query('SELECT key, value FROM settings');
  const raw = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) raw[r.key] = r.value;
  return typedSettings(raw);
}

async function saveSettings(patch) {
  const next = {};
  if (patch.autoEnabled != null) next.autoEnabled = patch.autoEnabled ? 'true' : 'false';
  if (patch.dbTime != null) {
    assertTime(patch.dbTime, 'ساعت بکاپ دیتابیس');
    next.dbTime = patch.dbTime;
  }
  if (patch.filesTime != null) {
    assertTime(patch.filesTime, 'ساعت بکاپ فایل‌ها');
    next.filesTime = patch.filesTime;
  }
  if (patch.filesDay != null) {
    if (!DAYS.includes(patch.filesDay)) throw httpError(400, 'روز بکاپ فایل‌ها نامعتبر است');
    next.filesDay = patch.filesDay;
  }
  if (patch.retentionDb != null) next.retentionDb = String(assertRetention(patch.retentionDb, 'نگهداری بکاپ دیتابیس'));
  if (patch.retentionFiles != null) next.retentionFiles = String(assertRetention(patch.retentionFiles, 'نگهداری بکاپ فایل‌ها'));

  for (const [key, value] of Object.entries(next)) {
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, value]
    );
  }
  return getSettings();
}

function assertTime(v, label) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw httpError(400, `${label} باید به شکل HH:MM باشد`);
}

function assertRetention(v, label) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 365) throw httpError(400, `${label} باید بین ۱ تا ۳۶۵ روز باشد`);
  return n;
}

/* ------------------------------------------------------------------ */
/*  time helpers (Tehran)                                              */
/* ------------------------------------------------------------------ */
function localParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  let hour = p.hour === '24' ? '00' : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    weekday: p.weekday,
  };
}

function localDateOf(ts) {
  if (!ts) return '';
  return localParts(new Date(ts)).date;
}

/* ------------------------------------------------------------------ */
/*  process runners                                                    */
/* ------------------------------------------------------------------ */
function runToFile(cmd, args, outFile) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(outFile);
    let stderr = '';
    const child = spawn(cmd, args, { env: process.env });
    child.stdout.pipe(out);
    child.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d.toString();
    });
    child.on('error', (err) => {
      out.destroy();
      reject(err);
    });
    child.on('close', (code) => {
      out.end(() => {
        if (code === 0) resolve();
        else reject(new Error(stderr.trim() || `${cmd} exited with code ${code}`));
      });
    });
  });
}

function capture(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: process.env, maxBuffer: 8 * 1024 * 1024, timeout: 10 * 60 * 1000 }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout));
    });
  });
}

/* ------------------------------------------------------------------ */
/*  runs                                                               */
/* ------------------------------------------------------------------ */
const active = new Set();

function mapRun(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    mode: row.mode,
    status: row.status,
    fileName: row.file_path ? path.basename(row.file_path) : '',
    sizeBytes: row.size_bytes == null ? null : Number(row.size_bytes),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    meta: row.meta || {},
    message: row.message || '',
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

async function listRuns(limit = 60) {
  const { rows } = await query('SELECT * FROM backup_runs ORDER BY started_at DESC, id DESC LIMIT $1', [limit]);
  return rows.map(mapRun);
}

async function findRun(id) {
  const { rows } = await query('SELECT * FROM backup_runs WHERE id = $1', [id]);
  return rows[0] || null;
}

async function startBackup({ kind, mode = 'manual', userId = null }) {
  if (!['db', 'files'].includes(kind)) throw httpError(400, 'نوع بکاپ نامعتبر است');
  if (active.has(kind)) throw httpError(409, 'یک بکاپ از این نوع در حال اجراست');

  const running = await query("SELECT id FROM backup_runs WHERE kind = $1 AND status = 'running' LIMIT 1", [kind]);
  if (running.rows.length) throw httpError(409, 'یک بکاپ از این نوع در حال اجراست');

  active.add(kind);
  const { rows } = await query(
    "INSERT INTO backup_runs (kind, mode, status, created_by) VALUES ($1, $2, 'running', $3) RETURNING *",
    [kind, mode, userId]
  );
  const run = rows[0];

  executeRun(run.id, kind)
    .catch((err) => console.error('[backup]', kind, err.message))
    .finally(() => active.delete(kind));

  return mapRun(run);
}

async function executeRun(runId, kind) {
  const started = Date.now();
  const dir = path.join(ROOT, kind);
  await fsp.mkdir(dir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const name = kind === 'db' ? `darsjo_portal-${stamp}.dump` : `files-${stamp}.tar.gz`;
  const target = path.join(dir, name);
  const tmp = path.join(dir, `.${name}.part`);
  let meta = {};

  try {
    if (kind === 'db') {
      const counts = await query(
        "SELECT count(*)::int AS total, count(*) FILTER (WHERE role='teacher')::int AS teachers FROM users"
      );
      meta = {
        database: process.env.PGDATABASE || 'darsjo_portal',
        users: counts.rows[0].total,
        teachers: counts.rows[0].teachers,
      };
      await runToFile('pg_dump', [
        '-Fc',
        '-h', process.env.PGHOST || '127.0.0.1',
        '-p', String(process.env.PGPORT || 5432),
        '-U', process.env.PGUSER || 'darsjo_app',
        '-d', process.env.PGDATABASE || 'darsjo_portal',
      ], tmp);
      try {
        const list = await capture('pg_restore', ['-l', tmp]);
        meta.entries = list.split('\n').filter((l) => l && !l.startsWith(';')).length;
      } catch { meta.entries = null; }
    } else {
      meta = { source: '/srv/files/teachers' };
      await runToFile('nice', ['-n', '19', 'tar', '-czf', '-', '-C', '/srv/files', 'teachers'], tmp);
      try {
        const list = await capture('tar', ['-tzf', tmp]);
        meta.entries = list.split('\n').filter(Boolean).length;
      } catch { meta.entries = null; }
    }

    await fsp.rename(tmp, target);
    const st = await fsp.stat(target);
    await query(
      `UPDATE backup_runs
          SET status = 'ok', file_path = $1, size_bytes = $2, duration_ms = $3,
              meta = $4, finished_at = now()
        WHERE id = $5`,
      [target, st.size, Date.now() - started, JSON.stringify(meta), runId]
    );
    await prune(kind).catch((err) => console.error('[backup prune]', err.message));
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    await query(
      `UPDATE backup_runs
          SET status = 'failed', message = $1, duration_ms = $2, finished_at = now()
        WHERE id = $3`,
      [String(err.stack || err.message || err).slice(0, 1200), Date.now() - started, runId]
    );
    throw err;
  }
}

async function deleteRun(id) {
  const run = await findRun(id);
  if (!run) throw httpError(404, 'نسخهٔ پشتیبان یافت نشد');
  if (run.status === 'running') throw httpError(409, 'این بکاپ در حال اجراست و قابل حذف نیست');

  if (run.file_path) {
    const abs = path.resolve(run.file_path);
    if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) throw httpError(400, 'مسیر فایل نامعتبر است');
    await fsp.unlink(abs).catch((err) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
  await query('DELETE FROM backup_runs WHERE id = $1', [id]);
}

async function prune(kind) {
  const s = await getSettings();
  const days = kind === 'db' ? s.retentionDb : s.retentionFiles;
  const { rows } = await query(
    `SELECT * FROM backup_runs
      WHERE kind = $1 AND status = 'ok' AND finished_at < now() - ($2 || ' days')::interval`,
    [kind, String(days)]
  );
  for (const row of rows) {
    if (row.file_path) {
      const abs = path.resolve(row.file_path);
      if (abs.startsWith(ROOT + path.sep)) await fsp.unlink(abs).catch(() => {});
    }
    await query('DELETE FROM backup_runs WHERE id = $1', [row.id]);
  }

  // keep the history tidy: drop failed attempts older than 90 days
  const old = await query(
    "SELECT id FROM backup_runs WHERE status = 'failed' AND started_at < now() - interval '90 days'"
  );
  for (const row of old.rows) await query('DELETE FROM backup_runs WHERE id = $1', [row.id]);
}

async function summary() {
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            coalesce(sum(size_bytes) FILTER (WHERE status = 'ok'), 0)::bigint AS total_bytes,
            count(*) FILTER (WHERE status = 'running')::int AS running,
            count(*) FILTER (WHERE status = 'failed')::int AS failed
       FROM backup_runs`
  );
  const last = await query(
    "SELECT * FROM backup_runs WHERE status = 'ok' ORDER BY finished_at DESC LIMIT 1"
  );
  return {
    total: rows[0].total,
    totalBytes: Number(rows[0].total_bytes),
    running: rows[0].running,
    failed: rows[0].failed,
    last: last.rows[0] ? mapRun(last.rows[0]) : null,
  };
}

/* ------------------------------------------------------------------ */
/*  scheduler                                                          */
/* ------------------------------------------------------------------ */
let timer = null;

async function tick() {
  try {
    const s = await getSettings();
    if (!s.autoEnabled) return;

    const p = localParts();
    const recent = await query(
      "SELECT kind, status, started_at FROM backup_runs WHERE started_at > now() - interval '10 minutes'"
    );
    const cooling = (kind) => recent.rows.some((r) => r.kind === kind);

    const lastAuto = async (kind) => {
      const { rows } = await query(
        "SELECT started_at FROM backup_runs WHERE kind = $1 AND mode = 'auto' AND status = 'ok' ORDER BY started_at DESC LIMIT 1",
        [kind]
      );
      return rows[0] ? rows[0].started_at : null;
    };

    // database — daily
    if (!cooling('db') && p.time >= s.dbTime) {
      const last = await lastAuto('db');
      if (localDateOf(last) !== p.date) {
        await startBackup({ kind: 'db', mode: 'auto' });
        console.log('[backup] auto db started at', p.time);
      }
    }

    // files — weekly (with catch-up if a run was missed by more than 8 days)
    if (!cooling('files')) {
      const last = await lastAuto('files');
      const lastDate = localDateOf(last);
      const stale = !lastDate || (Date.now() - new Date(last).getTime()) > 8 * 24 * 3600 * 1000;
      const dueToday = lastDate !== p.date;
      const weeklyDue = p.weekday === s.filesDay && p.time >= s.filesTime;

      if (dueToday && (weeklyDue || stale)) {
        await startBackup({ kind: 'files', mode: 'auto' });
        console.log('[backup] auto files started at', p.time, weeklyDue ? '(weekly)' : '(catch-up)');
      }
    }
  } catch (err) {
    console.error('[backup scheduler]', err.message);
  }
}

function startScheduler() {
  if (timer) return;
  setTimeout(() => { tick(); }, 8_000).unref();
  timer = setInterval(() => { tick(); }, 45_000);
  timer.unref();
}

/* ------------------------------------------------------------------ */
/*  import backups that already exist on disk (pre-v2 files)           */
/* ------------------------------------------------------------------ */
async function importExisting() {
  for (const kind of ['db', 'files']) {
    const dir = path.join(ROOT, kind);
    let entries = [];
    try { entries = await fsp.readdir(dir); } catch { continue; }
    const pattern = kind === 'db' ? /^darsjo_portal-.*\.dump$/ : /^files-.*\.tar\.gz$/;

    for (const name of entries) {
      if (!name || name.startsWith('.') || name.endsWith('.part') || !pattern.test(name)) continue;
      const abs = path.join(dir, name);
      const known = await query('SELECT 1 FROM backup_runs WHERE file_path = $1 LIMIT 1', [abs]);
      if (known.rows.length) continue;
      try {
        const st = await fsp.stat(abs);
        await query(
          `INSERT INTO backup_runs (kind, mode, status, file_path, size_bytes, meta, started_at, finished_at)
           VALUES ($1, 'auto', 'ok', $2, $3, $4, $5, $5)`,
          [kind, abs, st.size, JSON.stringify({ imported: true }), st.mtime]
        );
      } catch (err) {
        console.error('[backup import]', name, err.message);
      }
    }
  }
}

module.exports = {
  ROOT,
  DAYS,
  getSettings,
  saveSettings,
  listRuns,
  startBackup,
  deleteRun,
  findRun,
  summary,
  startScheduler,
  importExisting,
  localParts,
  mapRun,
};
