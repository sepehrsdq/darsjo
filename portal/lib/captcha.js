'use strict';

const crypto = require('crypto');
const zlib = require('zlib');
const { query } = require('./db');
const { sha256 } = require('./security');

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_SECONDS = 180;
const WIDTH = 212;
const HEIGHT = 72;

/* ------------------------------------------------------------------ */
/*  5x7 bitmap font (only unambiguous characters are used)             */
/* ------------------------------------------------------------------ */
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
};

function randInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function pickCode(length = 5) {
  let out = '';
  for (let i = 0; i < length; i += 1) out += CHARS[randInt(0, CHARS.length - 1)];
  return out;
}

/* ------------------------------------------------------------------ */
/*  tiny RGBA raster                                                   */
/* ------------------------------------------------------------------ */
function makeCanvas(w, h, bg) {
  const data = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i += 1) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  return { w, h, data };
}

function blend(c, x, y, rgb, alpha) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  const a = Math.max(0, Math.min(1, alpha));
  c.data[i] = Math.round(c.data[i] * (1 - a) + rgb[0] * a);
  c.data[i + 1] = Math.round(c.data[i + 1] * (1 - a) + rgb[1] * a);
  c.data[i + 2] = Math.round(c.data[i + 2] * (1 - a) + rgb[2] * a);
}

function rect(c, x, y, w, h, rgb, alpha) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) blend(c, xx, yy, rgb, alpha);
  }
}

function line(c, x0, y0, x1, y1, rgb, alpha, thickness = 1) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  let guard = 0;
  while (guard < 4000) {
    guard += 1;
    for (let oy = 0; oy < thickness; oy += 1) {
      for (let ox = 0; ox < thickness; ox += 1) blend(c, x + ox, y + oy, rgb, alpha);
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
  }
}

/* ------------------------------------------------------------------ */
/*  PNG encoder (zlib is built in)                                     */
/* ------------------------------------------------------------------ */
let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}

function crc32(buf) {
  const table = crcTable();
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(c) {
  const stride = c.w * 4;
  const raw = Buffer.alloc((stride + 1) * c.h);
  for (let y = 0; y < c.h; y += 1) {
    raw[y * (stride + 1)] = 0;
    c.data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(c.w, 0);
  ihdr.writeUInt32BE(c.h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ */
/*  image renderer                                                     */
/* ------------------------------------------------------------------ */
const INK = [
  [22, 48, 79],
  [37, 99, 235],
  [124, 58, 237],
  [15, 118, 110],
  [161, 98, 7],
];

function renderPng(code) {
  const c = makeCanvas(WIDTH, HEIGHT, [241, 245, 251]);

  // subtle vertical tint
  for (let y = 0; y < HEIGHT; y += 1) {
    const a = (y / HEIGHT) * 0.05;
    rect(c, 0, y, WIDTH, 1, [219, 229, 243], a);
  }

  // background noise dots
  for (let i = 0; i < 180; i += 1) {
    const color = INK[randInt(0, INK.length - 1)];
    rect(c, randInt(0, WIDTH - 1), randInt(0, HEIGHT - 1), 1, 1, color, 0.05 + Math.random() * 0.07);
  }

  // wavy interference lines
  for (let n = 0; n < 4; n += 1) {
    const amp = 2 + Math.random() * 5;
    const freq = 0.025 + Math.random() * 0.05;
    const phase = Math.random() * Math.PI * 2;
    const base = 10 + Math.random() * (HEIGHT - 20);
    const color = INK[randInt(0, INK.length - 1)];
    let px = 0;
    let py = Math.round(base + amp * Math.sin(phase));
    for (let x = 1; x < WIDTH; x += 1) {
      const y = Math.round(base + amp * Math.sin(phase + x * freq));
      line(c, px, py, x, y, color, 0.16, 1);
      px = x; py = y;
    }
  }

  // characters
  const glyphs = code.split('');
  const slot = (WIDTH - 26) / glyphs.length;
  glyphs.forEach((ch, idx) => {
    const pattern = FONT[ch];
    if (!pattern) return;

    const scale = randInt(5, 6);           // 25–30 px wide per glyph
    const gw = 5 * scale;
    const gh = 7 * scale;
    const x0 = 13 + Math.round(slot * idx + (slot - gw) / 2 + (Math.random() * 8 - 4));
    const y0 = Math.round((HEIGHT - gh) / 2 + (Math.random() * 10 - 5));
    const colour = INK[randInt(0, INK.length - 1)];
    const alpha = 0.82 + Math.random() * 0.16;
    const slant = (Math.random() * 0.7 - 0.35); // italic shear

    for (let row = 0; row < 7; row += 1) {
      const shift = Math.round((row - 3) * slant);
      for (let col = 0; col < 5; col += 1) {
        if (pattern[row][col] !== '1') continue;
        rect(
          c,
          x0 + col * scale + shift,
          y0 + row * scale,
          scale,
          scale,
          colour,
          alpha
        );
      }
    }

    // underline / strike accent
    if (Math.random() < 0.7) {
      const ly = y0 + Math.round(Math.random() < 0.5 ? -3 : gh + 2);
      line(c, x0 - 2, ly, x0 + gw + 2, ly + randInt(-2, 2), colour, 0.22, 1);
    }
  });

  // foreground speckles
  for (let i = 0; i < 70; i += 1) {
    const color = INK[randInt(0, INK.length - 1)];
    rect(c, randInt(0, WIDTH - 1), randInt(0, HEIGHT - 1), randInt(1, 2), 1, color, 0.12);
  }

  return encodePng(c);
}

/* ------------------------------------------------------------------ */
/*  persistence                                                        */
/* ------------------------------------------------------------------ */
function secret() {
  return process.env.CAPTCHA_SECRET || 'darsjo-captcha-secret';
}

function digest(id, answer) {
  return sha256(`${id}|${String(answer).trim().toLowerCase()}|${secret()}`);
}

async function create() {
  const id = crypto.randomUUID();
  const code = pickCode(5);
  const expires = new Date(Date.now() + TTL_SECONDS * 1000);
  await query('INSERT INTO captchas (id, answer_hash, expires_at) VALUES ($1, $2, $3)', [
    id,
    digest(id, code),
    expires,
  ]);
  const png = renderPng(code);
  return {
    id,
    image: `data:image/png;base64,${png.toString('base64')}`,
    expiresIn: TTL_SECONDS,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verify(id, answer) {
  if (!id || !answer) return false;
  const key = String(id).trim();
  if (!UUID_RE.test(key)) return false;
  const { rows } = await query(
    'SELECT id, answer_hash FROM captchas WHERE id = $1 AND used = FALSE AND expires_at > now() LIMIT 1',
    [key]
  );
  if (!rows.length) return false;
  const row = rows[0];
  await query('UPDATE captchas SET used = TRUE WHERE id = $1', [row.id]);
  const expected = Buffer.from(row.answer_hash, 'hex');
  const actual = Buffer.from(digest(row.id, answer), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

module.exports = { create, verify };
