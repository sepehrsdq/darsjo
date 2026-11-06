'use strict';

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { execFile } = require('child_process');

const ROOT = path.resolve(process.env.FILES_ROOT || '/srv/files/teachers');

const KIND_BY_EXT = {
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', avif: 'image', heic: 'image',
  mp4: 'video', mkv: 'video', mov: 'video', avi: 'video', webm: 'video', m4v: 'video', flv: 'video', wmv: 'video',
  mp3: 'audio', wav: 'audio', ogg: 'audio', m4a: 'audio', flac: 'audio', aac: 'audio',
  pdf: 'pdf',
  doc: 'doc', docx: 'doc', odt: 'doc', rtf: 'doc', txt: 'doc', md: 'doc',
  xls: 'sheet', xlsx: 'sheet', csv: 'sheet', ods: 'sheet',
  ppt: 'slide', pptx: 'slide', odp: 'slide',
  zip: 'archive', rar: 'archive', '7z': 'archive', tar: 'archive', gz: 'archive', bz2: 'archive', xz: 'archive',
};

const MIME_BY_EXT = {
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', m4a: 'audio/mp4', flac: 'audio/flac',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', heic: 'image/heic', ico: 'image/x-icon',
  pdf: 'application/pdf', txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
  json: 'application/json; charset=utf-8',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
};

const usageCache = new Map(); // username -> { at, bytes }

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

function extOf(name) {
  const i = String(name).lastIndexOf('.');
  return i > 0 ? String(name).slice(i + 1).toLowerCase() : '';
}

function kindOf(name, isDir) {
  if (isDir) return 'dir';
  return KIND_BY_EXT[extOf(name)] || 'other';
}

function mimeOf(name) {
  return MIME_BY_EXT[extOf(name)] || 'application/octet-stream';
}

function userRoot(username) {
  return path.join(ROOT, username);
}

async function ensureUserRoot(username) {
  const dir = userRoot(username);
  await fsp.mkdir(dir, { recursive: true, mode: 0o750 });
  return dir;
}

function normalizeRel(rel) {
  let s = String(rel == null ? '/' : rel).replace(/\\/g, '/');
  if (s.includes('\0')) throw httpError(400, 'مسیر نامعتبر است');
  s = path.posix.normalize('/' + s.replace(/^\/+/, ''));
  if (s !== '/' && s.endsWith('/')) s = s.slice(0, -1);
  return s || '/';
}

function safePath(root, rel) {
  const base = path.resolve(root);
  const abs = path.resolve(base, '.' + normalizeRel(rel));
  if (abs !== base && !abs.startsWith(base + path.sep)) throw httpError(400, 'مسیر نامعتبر است');
  return abs;
}

async function realInside(root, abs, mustExist) {
  try {
    const [real, realRoot] = await Promise.all([fsp.realpath(abs), fsp.realpath(root)]);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) throw httpError(400, 'مسیر نامعتبر است');
  } catch (err) {
    if (err.code === 'ENOENT') {
      if (mustExist) throw httpError(404, 'موردی یافت نشد');
      return;
    }
    throw err;
  }
}

function safeName(name) {
  let s = String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f]/g, '').trim();
  s = path.basename(s).replace(/\//g, '').replace(/\\/g, '');
  if (!s || s === '.' || s === '..') throw httpError(400, 'نام نامعتبر است');
  if (s.length > 180) s = s.slice(0, 180);
  return s;
}

function relJoin(rel, name) {
  const base = normalizeRel(rel);
  return base === '/' ? '/' + name : base + '/' + name;
}

async function listDir(root, rel) {
  const abs = safePath(root, rel);
  await realInside(root, abs, true);
  const stat = await fsp.stat(abs);
  if (!stat.isDirectory()) throw httpError(400, 'این مسیر پوشه نیست');

  const entries = await fsp.readdir(abs, { withFileTypes: true });
  const items = [];
  for (const ent of entries) {
    if (ent.isSymbolicLink()) continue;
    const full = path.join(abs, ent.name);
    let st;
    try { st = await fsp.lstat(full); } catch { continue; }
    if (st.isSymbolicLink()) continue;
    items.push({
      name: ent.name,
      path: relJoin(rel, ent.name),
      isDir: st.isDirectory(),
      size: st.isDirectory() ? 0 : st.size,
      modified: st.mtime.toISOString(),
      kind: kindOf(ent.name, st.isDirectory()),
      ext: extOf(ent.name),
    });
  }
  items.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'fa'));
  return { path: normalizeRel(rel), items };
}

async function uniqueDest(dirAbs, name) {
  const ext = path.extname(name);
  const base = name.slice(0, name.length - ext.length);
  let candidate = path.join(dirAbs, name);
  let i = 1;
  while (true) {
    try { await fsp.access(candidate); } catch { return candidate; }
    candidate = path.join(dirAbs, `${base} (${i})${ext}`);
    i += 1;
    if (i > 999) throw httpError(409, 'نام تکراری است');
  }
}

async function usageBytes(username, { fresh = false } = {}) {
  const cached = usageCache.get(username);
  if (!fresh && cached && Date.now() - cached.at < 15_000) return cached.bytes;

  const dir = userRoot(username);
  const bytes = await new Promise((resolve) => {
    execFile('du', ['-sb', dir], { timeout: 120_000 }, (err, stdout) => {
      if (err) return resolve(0);
      const n = parseInt(String(stdout).trim().split(/\s+/)[0], 10);
      resolve(Number.isFinite(n) ? n : 0);
    });
  });
  usageCache.set(username, { at: Date.now(), bytes });
  return bytes;
}

function invalidateUsage(username) {
  usageCache.delete(username);
}

async function walkMedia(root, rel, kindFilter, limit = 600) {
  const out = [];
  const base = normalizeRel(rel);
  const visited = new Set();

  async function walk(currentRel, depth) {
    if (out.length >= limit || depth > 8) return;
    const abs = safePath(root, currentRel);
    let entries;
    try { entries = await fsp.readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (out.length >= limit) return;
      if (ent.isSymbolicLink()) continue;
      const full = path.join(abs, ent.name);
      let st;
      try { st = await fsp.lstat(full); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      const itemRel = relJoin(currentRel, ent.name);
      if (st.isDirectory()) {
        if (!visited.has(itemRel)) { visited.add(itemRel); await walk(itemRel, depth + 1); }
      } else {
        const kind = kindOf(ent.name, false);
        if (kind === 'video' || kind === 'image' || kind === 'audio') {
          if (!kindFilter || kindFilter === 'all' || kindFilter === kind) {
            out.push({
              name: ent.name,
              path: itemRel,
              size: st.size,
              modified: st.mtime.toISOString(),
              kind,
              ext: extOf(ent.name),
            });
          }
        }
      }
    }
  }

  await walk(base, 0);
  out.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return out;
}

module.exports = {
  ROOT,
  httpError,
  extOf,
  kindOf,
  mimeOf,
  userRoot,
  ensureUserRoot,
  normalizeRel,
  safePath,
  safeName,
  relJoin,
  listDir,
  uniqueDest,
  usageBytes,
  invalidateUsage,
  walkMedia,
};
