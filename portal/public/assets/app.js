/* ==================================================================
   Imam School Portal — front-end v2
   ================================================================== */
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    user: null,
    csrf: '',
    page: 'files',
    view: localStorage.getItem('darsjo_view') || 'list',
    files: { path: '/', owner: '', items: [], usage: null, filter: '', ownerInfo: null },
    owners: [],
    mediaKind: 'all',
    mediaItems: [],
    sessions: [],
    users: [],
    backups: { settings: null, runs: [], summary: null },
    backupPoll: null,
    busy: false,
  };

  /* ---------------------------------------------------------------- */
  /*  icons                                                            */
  /* ---------------------------------------------------------------- */
  const S = (inner) => `<svg viewBox="0 0 24 24" aria-hidden="true">${inner}</svg>`;
  const ICONS = {
    dir: S('<path d="M4 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    image: S('<rect x="3" y="4" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor"/><path d="m4 17 4.5-4.5 3.5 3.5 3-3L20 18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    video: S('<rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m10 9.5 5 2.5-5 2.5v-5Z" fill="currentColor"/>'),
    audio: S('<path d="M9 18V6l10-2v12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16.5" cy="16" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/>'),
    pdf: S('<path d="M6 3h8l4 4v14H6V3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 13h6M9 16.5h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    doc: S('<path d="M6 3h8l4 4v14H6V3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v4h4M9 12h6M9 15.5h6M9 19h4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    sheet: S('<path d="M6 3h8l4 4v14H6V3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v4h4M9 12h6M9 16h6M12 12v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    slide: S('<rect x="3" y="4" width="18" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 16v4M8 20h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    archive: S('<path d="M6 3h8l4 4v14H6V3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M10 3v2m0 2v2m0 2v2m0 2v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>'),
    other: S('<path d="M6 3h8l4 4v14H6V3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    download: S('<path d="M12 4v12M8 12l4 4 4-4M4 20h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    rename: S('<path d="M4 20h4l10-10-4-4L4 16v4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m14 6 4 4" stroke="currentColor" stroke-width="1.8"/>'),
    trash: S('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    eye: S('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.7"/>'),
    play: S('<path d="m9 7 9 5-9 5V7Z" fill="currentColor"/>'),
    home: S('<path d="m4 11 8-7 8 7v8a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'),
    chevron: S('<path d="m14 7-5 5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    check: S('<path d="m5 12 4 4 10-10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    warn: S('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5v5.5M12 16.5h.01" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>'),
    close: S('<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    edit: S('<path d="M4 20h4l10-10-4-4L4 16v4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m14 6 4 4" stroke="currentColor" stroke-width="1.8"/>'),
    power: S('<path d="M12 4v8" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M7.5 7a7 7 0 1 0 9 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    user: S('<circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M4 20a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    users: S('<path d="M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M17 8h4M19 6v4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    shield: S('<path d="M12 3 4 6v6c0 4.4 3.4 8.2 8 9 4.6-.8 8-4.6 8-9V6l-8-3Z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>'),
    refresh: S('<path d="M20 11a8 8 0 0 0-14.3-4.7L4 8" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 4v4h4M4 13a8 8 0 0 0 14.3 4.7L20 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 20v-4h-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    key: S('<circle cx="8" cy="15" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m11 12 8-8M16 7l3 3M14 9l3 3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>'),
    clock: S('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    chart: S('<path d="M4 19V9M10 19V5M16 19v-7M22 19H2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>'),
    database: S('<ellipse cx="12" cy="6" rx="8" ry="3" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" fill="none" stroke="currentColor" stroke-width="1.7"/>'),
    folder: S('<path d="M4 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>'),
  };

  /* ---------------------------------------------------------------- */
  /*  formatting                                                       */
  /* ---------------------------------------------------------------- */
  function fmtNum(n, digits = 0) {
    const v = Number(n);
    if (!Number.isFinite(v)) return '۰';
    return v.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
  }

  function fmtBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n <= 0) return '۰';
    const units = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت', 'ترابایت'];
    let i = 0;
    let v = n;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${fmtNum(v, v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch { return '—'; }
  }

  function initials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '؟';
    return parts.slice(0, 2).map((p) => Array.from(p)[0]).join('');
  }

  function scorePassword(p) {
    let s = 0;
    if (p.length >= 8) s += 1;
    if (p.length >= 12) s += 1;
    if (/[A-Za-z]/.test(p) && /[0-9]/.test(p)) s += 1;
    if (/[^A-Za-z0-9]/.test(p)) s += 1;
    return Math.min(s, 4);
  }

  const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  const faDigits = (s) => String(s).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);

  /* ---------------------------------------------------------------- */
  /*  API                                                              */
  /* ---------------------------------------------------------------- */
  class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  async function api(path, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const headers = Object.assign({}, opts.headers || {});
    let body = opts.body;

    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    if (!['GET', 'HEAD'].includes(method) && state.csrf) headers['X-CSRF-Token'] = state.csrf;

    const res = await fetch(path, { credentials: 'same-origin', method, headers, body });
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();

    if (!res.ok) {
      if (res.status === 401 && state.user && !path.startsWith('/api/auth/')) {
        state.user = null;
        showAuth();
        toast('نشست شما منقضی شد. دوباره وارد شوید.', 'err');
      }
      throw new ApiError((data && data.error) || `خطای ${res.status}`, res.status);
    }
    return data;
  }

  /* ---------------------------------------------------------------- */
  /*  toast                                                            */
  /* ---------------------------------------------------------------- */
  function toast(message, type = 'info') {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.style.transition = 'opacity .35s ease, transform .35s ease';
    el.innerHTML = type === 'ok' ? ICONS.check : type === 'err' ? ICONS.warn : ICONS.shield;
    const span = document.createElement('span');
    span.textContent = message;
    el.appendChild(span);
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(10px)'; }, 3300);
    setTimeout(() => el.remove(), 3800);
  }

  /* ---------------------------------------------------------------- */
  /*  auth                                                             */
  /* ---------------------------------------------------------------- */
  let captchaId = '';

  async function refreshCaptcha() {
    const box = $('#captcha-box');
    const btn = $('#captcha-refresh');
    box.classList.add('loading');
    btn.classList.add('spin');
    try {
      const data = await api('/api/auth/captcha');
      captchaId = data.id;
      box.innerHTML = '';
      const img = document.createElement('img');
      img.src = data.image;
      img.alt = 'کد امنیتی تصویری';
      img.draggable = false;
      box.appendChild(img);
    } catch (err) {
      captchaId = '';
      box.textContent = 'خطا در دریافت کد';
    } finally {
      box.classList.remove('loading');
      const input = $('#login-captcha');
      if (input) input.value = '';
      setTimeout(() => btn.classList.remove('spin'), 500);
    }
  }

  function showAuth() {
    state.user = null;
    state.csrf = '';
    $('#app-view').classList.add('hidden');
    $('#auth-view').classList.remove('hidden');
    const pwd = $('#login-password');
    if (pwd) pwd.value = '';
    const err = $('#login-error');
    if (err) err.textContent = '';
    refreshCaptcha();
    setTimeout(() => $('#login-username').focus(), 120);
  }

  function showApp() {
    $('#auth-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
    applyUser();
    const page = (location.hash || '').replace(/^#/, '');
    const target = ['files', 'media', 'sessions', 'profile', 'overview', 'users', 'backups'].includes(page) ? page : 'files';
    setPage(target, true);
    if (state.user.role === 'admin') loadOwners();
  }

  function applyUser() {
    const u = state.user;
    if (!u) return;
    const roleLabel = u.role === 'admin' ? 'مدیر سامانه' : 'معلم';
    $('#side-name').textContent = u.displayName || u.username;
    $('#side-role').textContent = roleLabel;
    $('#side-avatar').textContent = initials(u.displayName || u.username);
    $('#top-avatar').textContent = initials(u.displayName || u.username);

    $$('.admin-only').forEach((el) => el.classList.toggle('hidden', u.role !== 'admin'));
    $('#owner-picker').classList.toggle('hidden', u.role !== 'admin');
  }

  function shakeCard() {
    const card = $('.auth-card');
    if (!card) return;
    card.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-7px)' },
        { transform: 'translateX(6px)' },
        { transform: 'translateX(-4px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 320, easing: 'ease-in-out' }
    );
  }

  async function doLogin(e) {
    e.preventDefault();
    const btn = $('#login-btn');
    const label = btn.querySelector('.btn-label');
    const spinner = btn.querySelector('.spinner');
    const err = $('#login-error');

    err.textContent = '';
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    const captchaAnswer = $('#login-captcha').value.trim();

    if (!username || !password) { err.textContent = 'نام کاربری و رمز عبور را وارد کنید.'; return; }
    if (!captchaAnswer) { err.textContent = 'کد امنیتی را وارد کنید.'; return; }
    if (!captchaId) { err.textContent = 'کد امنیتی بارگذاری نشده است. دوباره تلاش کنید.'; await refreshCaptcha(); return; }

    btn.disabled = true;
    spinner.classList.remove('hidden');
    label.textContent = 'در حال بررسی…';

    try {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: { username, password, captchaId, captchaAnswer },
      });
      state.user = data.user;
      state.csrf = data.csrf;
      state.files.owner = '';
      state.files.path = '/';
      showApp();
      toast(`خوش آمدید، ${data.user.displayName || data.user.username}`, 'ok');
    } catch (ex) {
      err.textContent = ex.message;
      $('#login-password').value = '';
      await refreshCaptcha();
      shakeCard();
    } finally {
      btn.disabled = false;
      spinner.classList.add('hidden');
      label.textContent = 'ورود به سامانه';
    }
  }

  async function doLogout() {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    state.user = null;
    state.csrf = '';
    state.files = { path: '/', owner: '', items: [], usage: null, filter: '', ownerInfo: null };
    state.users = [];
    state.owners = [];
    state.backups = { settings: null, runs: [], summary: null };
    clearBackupPoll();
    document.body.classList.remove('nav-open');
    showAuth();
  }

  /* ---------------------------------------------------------------- */
  /*  navigation                                                       */
  /* ---------------------------------------------------------------- */
  const PAGE_META = {
    files: { title: 'فایل‌های من', sub: 'مدیریت فایل‌ها و پوشه‌ها' },
    media: { title: 'رسانه‌ها', sub: 'ویدیو، تصویر و صوت' },
    sessions: { title: 'جلسات و ضبط‌ها', sub: 'ضبط جلسه‌های کلاس با شماره و تاریخ' },
    profile: { title: 'حساب کاربری', sub: 'اطلاعات و امنیت حساب' },
    overview: { title: 'نمای کلی', sub: 'وضعیت سامانه' },
    users: { title: 'کاربران', sub: 'مدیریت معلمان و مدیران' },
    backups: { title: 'پشتیبان‌گیری', sub: 'نسخه‌ها، زمان‌بندی و جزئیات' },
  };

  function setPage(page, initial = false) {
    if (!PAGE_META[page]) page = 'files';
    state.page = page;

    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.page === page));
    $$('.page').forEach((p) => p.classList.add('hidden'));
    const section = $(`#page-${page}`);
    if (section) section.classList.remove('hidden');

    $('#top-title').textContent = PAGE_META[page].title;
    $('#top-sub').textContent = PAGE_META[page].sub;

    const searchable = page === 'files' || page === 'media';
    $('#search-wrap').classList.toggle('hidden', !searchable);
    if (searchable) {
      $('#search').value = '';
      $('#search').placeholder = page === 'media' ? 'جستجوی رسانه…' : 'جستجو در این پوشه…';
    }
    if (page === 'files') state.files.filter = '';
    if (page === 'media') state.files.filter = '';

    if (!initial) {
      if (location.hash !== `#${page}`) {
        try { history.replaceState(null, '', `#${page}`); } catch { location.hash = page; }
      }
    }

    document.body.classList.remove('nav-open');

    if (page === 'files') loadFiles(state.files.path);
    if (page === 'media') loadMedia();
    if (page === 'sessions') loadSessions();
    if (page === 'profile') fillProfile();
    if (page === 'users') { loadOwners(); loadUsers(); }
    if (page === 'overview') loadOverview();
    if (page === 'backups') loadBackups({ settings: true });
  }

  /* ---------------------------------------------------------------- */
  /*  storage / headings                                               */
  /* ---------------------------------------------------------------- */
  function updateStorage(usage) {
    const ring = $('#storage-ring');
    if (!usage) {
      ring.style.setProperty('--p', '0');
      $('#storage-pct').textContent = '—';
      $('#storage-used').textContent = '—';
      $('#storage-quota').textContent = '—';
      return;
    }
    if (usage.unlimited) {
      ring.style.setProperty('--p', '0');
      $('#storage-pct').textContent = '∞';
      $('#storage-used').textContent = fmtBytes(usage.used);
      $('#storage-quota').textContent = 'بدون محدودیت';
      return;
    }
    const pct = usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0;
    ring.style.setProperty('--p', pct.toFixed(2));
    $('#storage-pct').textContent = `${fmtNum(pct, pct < 10 ? 1 : 0)}٪`;
    $('#storage-used').textContent = fmtBytes(usage.used);
    $('#storage-quota').textContent = `از ${fmtBytes(usage.quota)}`;
  }

  function updateFilesHeading(ownerInfo) {
    const viewingOther = ownerInfo && state.user && ownerInfo.username !== state.user.username;
    if (viewingOther) {
      $('#files-title').textContent = `فایل‌های ${ownerInfo.displayName || ownerInfo.username}`;
      $('#files-sub').textContent = `اتاق اختصاصی @${ownerInfo.username} — دسترسی مدیر`;
    } else {
      $('#files-title').textContent = 'فایل‌های من';
      $('#files-sub').textContent = 'همهٔ فایل‌ها و پوشه‌های اتاق اختصاصی شما';
    }
  }

  /* ---------------------------------------------------------------- */
  /*  owners (admin)                                                   */
  /* ---------------------------------------------------------------- */
  async function loadOwners() {
    if (!state.user || state.user.role !== 'admin') return;
    try {
      const data = await api('/api/owners');
      state.owners = data.owners || [];
      const sel = $('#owner-select');
      const current = state.files.owner || '';
      sel.innerHTML = '';

      const own = document.createElement('option');
      own.value = '';
      own.textContent = `خانهٔ من (${state.user.username})`;
      sel.appendChild(own);

      state.owners
        .filter((o) => o.username !== state.user.username)
        .forEach((o) => {
          const opt = document.createElement('option');
          opt.value = o.username;
          opt.textContent = `${o.displayName} — ${o.role === 'admin' ? 'مدیر' : 'معلم'}`;
          sel.appendChild(opt);
        });

      if (current && !state.owners.some((o) => o.username === current)) {
        state.files.owner = '';
        sel.value = '';
      } else {
        sel.value = current;
      }
    } catch { /* ignore */ }
  }

  /* ---------------------------------------------------------------- */
  /*  files                                                            */
  /* ---------------------------------------------------------------- */
  function ownerQuery() {
    const q = new URLSearchParams();
    if (state.user && state.user.role === 'admin' && state.files.owner) q.set('owner', state.files.owner);
    return q;
  }

  async function loadFiles(path) {
    try {
      const q = ownerQuery();
      q.set('path', path || '/');
      const data = await api(`/api/files?${q.toString()}`);
      state.files.path = data.path;
      state.files.items = data.items || [];
      state.files.usage = data.usage;
      state.files.ownerInfo = data.owner;
      renderCrumbs();
      renderFiles();
      updateStorage(data.usage);
      updateFilesHeading(data.owner);
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'err');
    }
  }

  function openDir(path) {
    state.files.path = path;
    state.files.filter = '';
    $('#search').value = '';
    loadFiles(path);
  }

  function renderCrumbs() {
    const wrap = $('#crumbs');
    wrap.innerHTML = '';
    const path = state.files.path || '/';
    const parts = path.split('/').filter(Boolean);

    const home = document.createElement('button');
    home.className = 'crumb' + (parts.length ? '' : ' current');
    home.innerHTML = ICONS.home;
    const homeText = document.createElement('span');
    homeText.textContent = state.files.owner ? (state.files.ownerInfo?.displayName || 'خانه') : 'خانه';
    home.appendChild(homeText);
    home.addEventListener('click', () => { if (parts.length) openDir('/'); });
    wrap.appendChild(home);

    let acc = '';
    parts.forEach((part, i) => {
      acc += `/${part}`;
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.innerHTML = ICONS.chevron;
      wrap.appendChild(sep);

      const b = document.createElement('button');
      b.className = 'crumb' + (i === parts.length - 1 ? ' current' : '');
      b.textContent = part;
      const target = acc;
      b.addEventListener('click', () => { if (i !== parts.length - 1) openDir(target); });
      wrap.appendChild(b);
    });
  }

  function actionBtn(icon, title, onClick, extra = '') {
    const b = document.createElement('button');
    b.className = `icon-btn ${extra}`.trim();
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon;
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }

  function fileMeta(item) {
    if (item.isDir) return 'پوشه';
    const e = String(item.ext || '').toUpperCase();
    return e || 'فایل';
  }

  function rowFor(item) {
    const row = document.createElement('div');
    row.className = 'file-row' + (item.isDir ? ' is-dir' : '');
    row.tabIndex = 0;

    const ico = document.createElement('div');
    ico.className = `file-ico ${item.kind || 'other'}`;
    ico.innerHTML = ICONS[item.kind] || ICONS.other;

    const title = document.createElement('div');
    title.className = 'file-title';
    const b = document.createElement('b');
    b.textContent = item.name;
    const meta = document.createElement('span');
    meta.textContent = fileMeta(item);
    title.append(b, meta);

    const size = document.createElement('div');
    size.className = 'file-size';
    size.textContent = item.isDir ? '—' : fmtBytes(item.size);

    const date = document.createElement('div');
    date.className = 'file-date';
    date.textContent = fmtDate(item.modified);

    const actions = document.createElement('div');
    actions.className = 'file-actions';
    const isMedia = ['image', 'video', 'audio'].includes(item.kind);
    if (isMedia) actions.appendChild(actionBtn(ICONS.eye, 'پیش‌نمایش', () => openPreview(item)));
    if (!item.isDir) actions.appendChild(actionBtn(ICONS.download, 'دانلود', () => downloadItem(item)));
    actions.appendChild(actionBtn(ICONS.rename, 'تغییر نام', () => renameItem(item)));
    actions.appendChild(actionBtn(ICONS.trash, 'حذف', () => deleteItem(item), 'danger'));

    row.append(ico, title, size, date, actions);

    const activate = () => {
      if (item.isDir) openDir(item.path);
      else if (isMedia) openPreview(item);
    };
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); activate(); }
    });

    return row;
  }

  function renderFiles() {
    const wrap = $('#files-wrap');
    wrap.className = 'files-wrap' + (state.view === 'grid' ? ' grid' : '');
    wrap.innerHTML = '';
    const empty = $('#empty-state');

    let items = state.files.items.slice();
    const q = state.files.filter.trim().toLowerCase();
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q));
    items.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'fa'));

    if (!items.length) {
      empty.classList.remove('hidden');
      const h = empty.querySelector('h3');
      const p = empty.querySelector('p');
      if (q) {
        h.textContent = 'نتیجه‌ای پیدا نشد';
        p.textContent = 'نام دیگری را جستجو کنید.';
      } else {
        h.textContent = 'این پوشه خالی است';
        p.textContent = 'فایل‌ها را بکشید و رها کنید یا دکمهٔ بارگذاری را بزنید.';
      }
      return;
    }
    empty.classList.add('hidden');

    if (state.view !== 'grid') {
      const head = document.createElement('div');
      head.className = 'file-row head';
      const spans = ['', 'نام', 'حجم', 'تاریخ', 'عملیات'];
      spans.forEach((text) => {
        const s = document.createElement('span');
        s.textContent = text;
        head.appendChild(s);
      });
      wrap.appendChild(head);
    }

    items.forEach((item, i) => {
      const row = rowFor(item);
      row.style.animationDelay = `${Math.min(i * 16, 220)}ms`;
      wrap.appendChild(row);
    });
  }

  function downloadItem(item) {
    const q = ownerQuery();
    q.set('path', item.path);
    q.set('download', '1');
    const a = document.createElement('a');
    a.href = `/api/files/download?${q.toString()}`;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function fileUrl(item, download = false) {
    const q = ownerQuery();
    q.set('path', item.path);
    if (download) q.set('download', '1');
    return `/api/files/download?${q.toString()}`;
  }

  /* ---------------------------------------------------------------- */
  /*  modals                                                           */
  /* ---------------------------------------------------------------- */
  function openModal(opts) {
    const back = document.createElement('div');
    back.className = 'modal-back';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const h = document.createElement('h3');
    h.textContent = opts.title;
    modal.appendChild(h);

    if (opts.desc) {
      const p = document.createElement('p');
      p.textContent = opts.desc;
      modal.appendChild(p);
    }

    let input = null;
    if (opts.input) {
      const wrap = document.createElement('div');
      wrap.className = 'input-wrap';
      input = document.createElement('input');
      input.type = 'text';
      input.value = opts.value || '';
      input.placeholder = opts.placeholder || '';
      wrap.appendChild(input);
      modal.appendChild(wrap);
    }

    const err = document.createElement('p');
    err.className = 'form-error';
    modal.appendChild(err);

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    const ok = document.createElement('button');
    ok.className = `btn ${opts.danger ? 'btn-danger' : 'btn-primary'}`;
    ok.textContent = opts.confirmText || 'تأیید';
    const cancel = document.createElement('button');
    cancel.className = 'btn';
    cancel.textContent = 'انصراف';
    actions.append(ok, cancel);
    modal.appendChild(actions);

    back.appendChild(modal);
    $('#modal-root').appendChild(back);

    const close = () => {
      document.removeEventListener('keydown', onKey);
      back.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    cancel.addEventListener('click', close);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });

    ok.addEventListener('click', async () => {
      ok.disabled = true;
      cancel.disabled = true;
      err.textContent = '';
      try {
        await opts.onConfirm(input ? input.value.trim() : undefined);
        close();
      } catch (ex) {
        err.textContent = ex.message || 'خطا';
        ok.disabled = false;
        cancel.disabled = false;
      }
    });

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); ok.click(); }
      });
    }
    setTimeout(() => (input || ok).focus(), 50);
    return { close, input };
  }

  function newFolder() {
    openModal({
      title: 'پوشهٔ جدید',
      desc: 'نام پوشه را وارد کنید. پوشه در مسیر جاری ساخته می‌شود.',
      placeholder: 'مثلاً تکالیف هفتهٔ اول',
      confirmText: 'ایجاد پوشه',
      onConfirm: async (name) => {
        if (!name) throw new Error('نام پوشه را وارد کنید');
        const body = { path: state.files.path, name };
        if (state.user.role === 'admin' && state.files.owner) body.owner = state.files.owner;
        await api('/api/files/folder', { method: 'POST', body });
        toast('پوشه ساخته شد', 'ok');
        loadFiles(state.files.path);
      },
    });
  }

  function renameItem(item) {
    openModal({
      title: 'تغییر نام',
      desc: 'نام جدید را وارد کنید.',
      value: item.name,
      confirmText: 'ذخیره',
      onConfirm: async (name) => {
        if (!name) throw new Error('نام جدید را وارد کنید');
        if (name === item.name) return;
        const body = { path: item.path, name };
        if (state.user.role === 'admin' && state.files.owner) body.owner = state.files.owner;
        await api('/api/files/rename', { method: 'POST', body });
        toast('نام تغییر کرد', 'ok');
        loadFiles(state.files.path);
      },
    });
  }

  function deleteItem(item) {
    openModal({
      title: `حذف ${item.isDir ? 'پوشه' : 'فایل'}`,
      desc: `«${item.name}» برای همیشه حذف می‌شود. این عمل قابل بازگشت نیست.`,
      confirmText: 'حذف کن',
      danger: true,
      onConfirm: async () => {
        const body = { path: item.path };
        if (state.user.role === 'admin' && state.files.owner) body.owner = state.files.owner;
        await api('/api/files/delete', { method: 'POST', body });
        toast('حذف شد', 'ok');
        loadFiles(state.files.path);
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /*  preview                                                          */
  /* ---------------------------------------------------------------- */
  function openPreview(item) {
    const back = document.createElement('div');
    back.className = 'preview-back';
    const box = document.createElement('div');
    box.className = 'preview-box';

    const head = document.createElement('div');
    head.className = 'preview-head';
    const name = document.createElement('b');
    name.textContent = item.name;
    head.appendChild(name);

    const dl = actionBtn(ICONS.download, 'دانلود', () => downloadItem(item));
    const closeBtn = actionBtn(ICONS.close, 'بستن', () => close());
    head.append(dl, closeBtn);

    const media = document.createElement('div');
    media.className = 'preview-media';
    const src = fileUrl(item, false);

    if (item.kind === 'image') {
      const img = document.createElement('img');
      img.src = src;
      img.alt = item.name;
      media.appendChild(img);
    } else if (item.kind === 'video') {
      const v = document.createElement('video');
      v.src = src;
      v.controls = true;
      v.autoplay = true;
      v.playsInline = true;
      media.appendChild(v);
    } else if (item.kind === 'audio') {
      const a = document.createElement('audio');
      a.src = src;
      a.controls = true;
      a.autoplay = true;
      media.appendChild(a);
    }

    box.append(head, media);
    back.appendChild(box);
    document.body.appendChild(back);

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });

    function close() {
      document.removeEventListener('keydown', onKey);
      const v = media.querySelector('video');
      if (v) { try { v.pause(); } catch { /* ignore */ } }
      const a = media.querySelector('audio');
      if (a) { try { a.pause(); } catch { /* ignore */ } }
      back.remove();
    }
  }

  /* ---------------------------------------------------------------- */
  /*  uploads                                                          */
  /* ---------------------------------------------------------------- */
  function uploadCard(name) {
    const card = document.createElement('div');
    card.className = 'up-card';
    const t = document.createElement('div');
    t.className = 't';
    const b = document.createElement('b');
    b.textContent = name;
    const pct = document.createElement('span');
    pct.textContent = '۰٪';
    t.append(b, pct);
    const bar = document.createElement('div');
    bar.className = 'bar';
    const fill = document.createElement('i');
    bar.appendChild(fill);
    card.append(t, bar);
    $('#uploads').appendChild(card);
    return { card, fill, pct };
  }

  function uploadOne(file) {
    return new Promise((resolve) => {
      const ui = uploadCard(file.name);
      const q = ownerQuery();
      q.set('path', state.files.path);
      q.set('overwrite', '1');

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/files/upload?${q.toString()}`);
      xhr.setRequestHeader('X-CSRF-Token', state.csrf);

      xhr.upload.addEventListener('progress', (e) => {
        if (!e.lengthComputable) return;
        const p = Math.round((e.loaded / e.total) * 100);
        ui.fill.style.width = `${p}%`;
        ui.pct.textContent = `${faDigits(p)}٪`;
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          ui.fill.style.width = '100%';
          ui.card.classList.add('done');
          setTimeout(() => ui.card.remove(), 1300);
          resolve(true);
        } else {
          let msg = 'بارگذاری ناموفق بود';
          try { const d = JSON.parse(xhr.responseText); if (d.error) msg = d.error; } catch { /* ignore */ }
          ui.card.classList.add('fail');
          ui.pct.textContent = 'خطا';
          toast(msg, 'err');
          setTimeout(() => ui.card.remove(), 4500);
          resolve(false);
        }
      });

      xhr.addEventListener('error', () => {
        ui.card.classList.add('fail');
        ui.pct.textContent = 'خطای شبکه';
        toast('خطای شبکه در بارگذاری', 'err');
        setTimeout(() => ui.card.remove(), 4500);
        resolve(false);
      });

      const fd = new FormData();
      fd.append('file', file);
      xhr.send(fd);
    });
  }

  async function uploadFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    for (const f of files) await uploadOne(f);
    toast(`${fmtNum(files.length)} فایل بارگذاری شد`, 'ok');
    await loadFiles(state.files.path);
  }

  /* ---------------------------------------------------------------- */
  /*  media                                                            */
  /* ---------------------------------------------------------------- */
  async function loadMedia() {
    const grid = $('#media-grid');
    grid.innerHTML = '';
    try {
      const q = ownerQuery();
      q.set('kind', state.mediaKind);
      const data = await api(`/api/media?${q.toString()}`);
      state.mediaItems = data.items || [];
      renderMedia();
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'err');
    }
  }

  function renderMedia() {
    const grid = $('#media-grid');
    grid.innerHTML = '';
    const empty = $('#media-empty');

    let items = state.mediaItems.slice();
    const q = ($('#search').value || '').trim().toLowerCase();
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q));

    if (!items.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    items.forEach((item, i) => {
      const card = document.createElement('article');
      card.className = 'media-card';
      card.tabIndex = 0;
      card.style.animationDelay = `${Math.min(i * 16, 220)}ms`;

      const thumb = document.createElement('div');
      thumb.className = 'media-thumb';

      if (item.kind === 'image') {
        const img = document.createElement('img');
        img.src = fileUrl(item, false);
        img.alt = item.name;
        img.loading = 'lazy';
        thumb.appendChild(img);
      } else {
        const play = document.createElement('span');
        play.className = 'play';
        play.innerHTML = item.kind === 'video' ? ICONS.play : ICONS.audio;
        thumb.appendChild(play);
      }

      const kindBadge = document.createElement('span');
      kindBadge.className = 'badge-kind';
      kindBadge.textContent = item.kind === 'video' ? 'ویدیو' : item.kind === 'image' ? 'تصویر' : 'صوت';
      thumb.appendChild(kindBadge);

      const meta = document.createElement('div');
      meta.className = 'media-meta';
      const name = document.createElement('b');
      name.textContent = item.name;
      const sub = document.createElement('span');
      const s1 = document.createElement('span');
      s1.textContent = fmtBytes(item.size);
      const s2 = document.createElement('span');
      s2.textContent = fmtDate(item.modified);
      sub.append(s1, s2);
      meta.append(name, sub);

      card.append(thumb, meta);
      card.addEventListener('click', () => openPreview(item));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') openPreview(item); });
      grid.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------- */
  /*  recorded sessions (mirrored from the LMS)                        */
  /* ---------------------------------------------------------------- */
  const SESSION_STATUS = {
    planned: { label: 'در انتظار شروع', cls: 'warn' },
    running: { label: 'در حال برگزاری', cls: 'run' },
    ended: { label: 'ضبط‌شده', cls: 'ok' },
  };

  function fmtSessionDate(iso) {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR', {
        calendar: 'persian',
        weekday: 'long',
        dateStyle: 'medium',
      }).format(new Date(iso));
    } catch {
      return fmtDate(iso);
    }
  }

  async function loadSessions() {
    const list = $('#session-list');
    if (!list) return;
    list.innerHTML = '';
    try {
      const data = await api('/api/sessions');
      state.sessions = data.items || [];
      renderSessions();
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'err');
    }
  }

  function renderSessions() {
    const list = $('#session-list');
    const empty = $('#sessions-empty');
    if (!list || !empty) return;
    list.innerHTML = '';

    if (!state.sessions.length) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    state.sessions.forEach((item, index) => {
      const status = SESSION_STATUS[item.status] || SESSION_STATUS.ended;
      const card = document.createElement('article');
      card.className = `session-card${item.status === 'running' ? ' live' : ''}`;
      card.style.animationDelay = `${Math.min(index * 22, 240)}ms`;

      const top = document.createElement('div');
      top.className = 'session-top';

      const num = document.createElement('span');
      num.className = 'session-num';
      num.textContent = faDigits(item.sessionNumber);

      const info = document.createElement('div');
      info.className = 'session-info';
      const title = document.createElement('b');
      title.textContent = `جلسهٔ ${faDigits(item.sessionNumber)}${item.sessionTitle ? ` — ${item.sessionTitle}` : ''}`;
      const meta = document.createElement('span');
      const teacher = state.user && state.user.role === 'admin' ? ` · ${item.teacherName}` : '';
      meta.textContent = `${item.offeringTitle} · ${item.className}${teacher}`;
      info.append(title, meta);

      const badge = document.createElement('span');
      badge.className = `badge ${status.cls}`.trim();
      badge.textContent = status.label;
      top.append(num, info, badge);

      const sub = document.createElement('div');
      sub.className = 'session-sub';
      const when = document.createElement('span');
      when.textContent = fmtSessionDate(item.sessionDate);
      sub.appendChild(when);
      if (item.durationLabel) {
        const duration = document.createElement('span');
        duration.textContent = `مدت: ${item.durationLabel}`;
        sub.appendChild(duration);
      }
      if (item.recordedAt) {
        const recorded = document.createElement('span');
        recorded.textContent = `ثبت ضبط: ${fmtDate(item.recordedAt)}`;
        sub.appendChild(recorded);
      }

      const actions = document.createElement('div');
      actions.className = 'session-actions';
      if (item.playbackUrl) {
        const watch = document.createElement('a');
        watch.className = 'btn btn-primary';
        watch.href = item.playbackUrl;
        watch.target = '_blank';
        watch.rel = 'noopener noreferrer';
        watch.textContent = 'تماشا';
        actions.appendChild(watch);
      }
      if (item.downloadUrl) {
        const download = document.createElement('a');
        download.className = 'btn';
        download.href = item.downloadUrl;
        download.textContent = 'دانلود';
        actions.appendChild(download);
      }
      if (!actions.childElementCount) {
        const pending = document.createElement('span');
        pending.className = 'session-pending';
        pending.textContent = 'ضبط در حال آماده‌سازی است';
        actions.appendChild(pending);
      }

      card.append(top, sub, actions);
      list.appendChild(card);
    });
  }

  /* ---------------------------------------------------------------- */
  /*  profile                                                          */
  /* ---------------------------------------------------------------- */
  async function fillProfile() {
    const u = state.user;
    if (!u) return;
    $('#profile-avatar').textContent = initials(u.displayName || u.username);
    $('#profile-name').textContent = u.displayName || u.username;
    const role = $('#profile-role');
    role.textContent = u.role === 'admin' ? 'مدیر سامانه' : 'معلم';
    role.className = `badge ${u.role === 'admin' ? 'admin' : ''}`;
    $('#profile-username').textContent = u.username;
    $('#profile-root').textContent = `/srv/files/teachers/${u.username}`;
    $('#profile-last-login').textContent = u.lastLoginAt ? fmtDate(u.lastLoginAt) : '—';
    $('#profile-storage').textContent = '—';

    try {
      const data = await api('/api/files?path=/');
      const usage = data.usage;
      $('#profile-storage').textContent = usage.unlimited
        ? `${fmtBytes(usage.used)} — بدون محدودیت`
        : `${fmtBytes(usage.used)} از ${fmtBytes(usage.quota)}`;
    } catch { /* ignore */ }
  }

  function bindPasswordForm() {
    const form = $('#password-form');
    const neu = $('#pw-new');
    const meter = $('#pw-strength');

    const updateMeter = () => { meter.dataset.score = String(scorePassword(neu.value)); };
    neu.addEventListener('input', updateMeter);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#pw-error');
      err.textContent = '';
      const currentPassword = $('#pw-current').value;
      const newPassword = neu.value;
      const confirm = $('#pw-confirm').value;

      if (!currentPassword) { err.textContent = 'رمز فعلی را وارد کنید.'; return; }
      if (newPassword.length < 8) { err.textContent = 'رمز جدید باید حداقل ۸ کاراکتر باشد.'; return; }
      if (!/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) { err.textContent = 'رمز جدید باید شامل حرف و عدد باشد.'; return; }
      if (newPassword !== confirm) { err.textContent = 'تکرار رمز با رمز جدید یکسان نیست.'; return; }

      const btn = $('#pw-submit');
      btn.disabled = true;
      try {
        await api('/api/auth/password', { method: 'POST', body: { currentPassword, newPassword } });
        form.reset();
        meter.dataset.score = '0';
        toast('رمز عبور با موفقیت تغییر کرد', 'ok');
      } catch (ex) {
        err.textContent = ex.message;
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  users (admin)                                                    */
  /* ---------------------------------------------------------------- */
  async function loadUsers() {
    if (!state.user || state.user.role !== 'admin') return;
    try {
      const data = await api('/api/admin/users');
      state.users = data.users || [];
      renderUsers();
      renderUsersStrip();
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'err');
    }
  }

  function renderUsersStrip() {
    const strip = $('#users-strip');
    strip.innerHTML = '';
    const total = state.users.length;
    const teachers = state.users.filter((u) => u.role === 'teacher').length;
    const admins = state.users.filter((u) => u.role === 'admin').length;
    const active = state.users.filter((u) => u.isActive).length;

    const items = [
      { ico: ICONS.users, cls: '', value: total, label: 'کل کاربران' },
      { ico: ICONS.user, cls: 'blue', value: teachers, label: 'معلمان' },
      { ico: ICONS.shield, cls: 'gold', value: admins, label: 'مدیران' },
      { ico: ICONS.check, cls: 'green', value: active, label: 'فعال' },
    ];

    items.forEach((it) => {
      const el = document.createElement('div');
      el.className = 'mini-stat';
      const ico = document.createElement('span');
      ico.className = `ico ${it.cls}`.trim();
      ico.innerHTML = it.ico;
      const box = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = fmtNum(it.value);
      const span = document.createElement('span');
      span.textContent = it.label;
      box.append(b, span);
      el.append(ico, box);
      strip.appendChild(el);
    });
  }

  function quotaBar(used, quota) {
    const wrap = document.createElement('div');
    wrap.className = 'quota-bar';
    const fill = document.createElement('i');
    const pct = quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
    fill.style.width = `${pct}%`;
    if (pct >= 95) wrap.classList.add('full');
    else if (pct >= 75) wrap.classList.add('warn');
    wrap.appendChild(fill);
    return wrap;
  }

  function userCard(u, index) {
    const card = document.createElement('article');
    card.className = `user-card${u.isActive ? '' : ' inactive'}`;
    card.style.animationDelay = `${Math.min(index * 30, 240)}ms`;

    const top = document.createElement('div');
    top.className = 'user-card-top';

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.textContent = initials(u.displayName || u.username);
    if (u.avatarColor) avatar.style.background = u.avatarColor;

    const nameBox = document.createElement('div');
    nameBox.className = 'user-card-name';
    const nm = document.createElement('b');
    nm.textContent = u.displayName || u.username;
    const un = document.createElement('span');
    un.textContent = `@${u.username}`;
    nameBox.append(nm, un);

    const actions = document.createElement('div');
    actions.className = 'user-card-actions';
    actions.append(
      actionBtn(ICONS.edit, 'ویرایش کاربر', () => openUserSheet(u)),
      actionBtn(ICONS.power, u.isActive ? 'غیرفعال‌کردن' : 'فعال‌کردن', () => toggleUser(u), u.isActive ? '' : 'danger')
    );
    if (u.id !== state.user.id) {
      actions.append(actionBtn(ICONS.trash, 'حذف کاربر', () => deleteUser(u), 'danger'));
    }

    top.append(avatar, nameBox, actions);

    const badges = document.createElement('div');
    badges.style.display = 'flex';
    badges.style.gap = '5px';
    badges.style.flexWrap = 'wrap';
    const roleBadge = document.createElement('span');
    roleBadge.className = `badge ${u.role === 'admin' ? 'admin' : ''}`;
    roleBadge.textContent = u.role === 'admin' ? 'مدیر سامانه' : 'معلم';
    const activeBadge = document.createElement('span');
    activeBadge.className = `badge ${u.isActive ? 'ok' : 'off'}`;
    activeBadge.textContent = u.isActive ? 'فعال' : 'غیرفعال';
    badges.append(roleBadge, activeBadge);

    const meta = document.createElement('div');
    meta.className = 'user-card-meta';
    meta.style.marginTop = '10px';

    const quotaLabel = document.createElement('div');
    quotaLabel.className = 'quota-line';
    const q1 = document.createElement('span');
    q1.textContent = u.role === 'admin' ? 'دسترسی کامل' : 'سهمیهٔ فضا';
    const q2 = document.createElement('span');
    q2.textContent = u.role === 'admin'
      ? `${fmtBytes(u.used)} مصرف‌شده`
      : `${fmtBytes(u.used)} از ${fmtBytes(u.quotaBytes)}`;
    quotaLabel.append(q1, q2);

    if (u.role !== 'admin') meta.append(quotaLabel, quotaBar(u.used, u.quotaBytes));
    else meta.append(quotaLabel);

    const foot = document.createElement('div');
    foot.className = 'user-card-foot';
    const openBtn = document.createElement('button');
    openBtn.className = 'btn btn-ghost';
    openBtn.style.height = '34px';
    openBtn.style.fontSize = '12px';
    openBtn.innerHTML = ICONS.folder;
    const txt = document.createElement('span');
    txt.textContent = 'مشاهدهٔ فایل‌ها';
    openBtn.appendChild(txt);
    openBtn.addEventListener('click', () => {
      state.files.owner = u.username;
      state.files.path = '/';
      const sel = $('#owner-select');
      if (sel) sel.value = u.username;
      setPage('files');
    });
    foot.appendChild(openBtn);

    card.append(top, badges, meta, foot);
    return card;
  }

  function renderUsers() {
    const grid = $('#users-grid');
    grid.innerHTML = '';
    state.users.forEach((u, i) => grid.appendChild(userCard(u, i)));
  }

  async function toggleUser(u) {
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } });
      toast(u.isActive ? 'کاربر غیرفعال شد' : 'کاربر فعال شد', 'ok');
      loadUsers();
      loadOwners();
    } catch (ex) { toast(ex.message, 'err'); }
  }

  function deleteUser(u) {
    openModal({
      title: 'حذف کاربر',
      desc: `حساب «${u.displayName || u.username}» حذف می‌شود. پوشهٔ فایل‌های او به آرشیو منتقل خواهد شد و حذف نمی‌شود.`,
      confirmText: 'حذف کاربر',
      danger: true,
      onConfirm: async () => {
        await api(`/api/admin/users/${u.id}`, { method: 'DELETE' });
        toast('کاربر حذف شد', 'ok');
        if (state.files.owner === u.username) { state.files.owner = ''; state.files.path = '/'; }
        loadUsers();
        loadOwners();
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /*  user sheet (create / edit)                                       */
  /* ---------------------------------------------------------------- */
  function randInt(max) {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % max;
  }

  function generatePassword() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const symbols = '!@#$%&*?';
    const all = letters + digits + symbols;
    const chars = [
      letters[randInt(letters.length)],
      digits[randInt(digits.length)],
      symbols[randInt(symbols.length)],
    ];
    while (chars.length < 16) chars.push(all[randInt(all.length)]);
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = randInt(i + 1);
      [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
  }

  function openUserSheet(existing) {
    const isEdit = !!existing;
    const back = document.createElement('div');
    back.className = 'sheet-back';

    back.innerHTML = `
      <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div class="sheet-head">
          <span class="sheet-ico">${isEdit ? ICONS.edit : ICONS.user}</span>
          <div>
            <h2 id="sheet-title">${isEdit ? 'ویرایش کاربر' : 'کاربر جدید'}</h2>
            <p>${isEdit ? 'اطلاعات، دسترسی و سهمیهٔ کاربر را تغییر دهید' : 'حساب ورود و اتاق اختصاصی بسازید'}</p>
          </div>
          <button class="icon-btn" data-close aria-label="بستن">${ICONS.close}</button>
        </div>

        <div class="sheet-body">
          <div class="steps">
            <div class="step active" data-step="1"><i>۱</i><span>مشخصات</span></div>
            <div class="line" data-line><i></i></div>
            <div class="step" data-step="2"><i>۲</i><span>امنیت و فضا</span></div>
          </div>

          <form class="user-form" novalidate>
            <div class="step-pane" data-pane="1">
              <label class="field">
                <span>نام و نام خانوادگی</span>
                <div class="input-wrap">
                  <input name="displayName" type="text" placeholder="مثلاً سارا محمدی" autocomplete="off" required />
                </div>
              </label>

              <label class="field">
                <span>نام کاربری</span>
                <div class="input-wrap">
                  <input name="username" type="text" dir="ltr" placeholder="sara.mohammadi" autocomplete="off" spellcheck="false" ${isEdit ? 'disabled' : ''} required />
                </div>
                <span class="hint">۳ تا ۳۲ کاراکتر؛ حروف انگلیسی، عدد، نقطه یا خط تیره</span>
              </label>

              <div class="field">
                <span>نقش کاربر</span>
                <div class="role-cards">
                  <label class="role-card">
                    <input type="radio" name="role" value="teacher" />
                    <span class="role-ico">${ICONS.user}</span>
                    <div><b>معلم</b><span>اتاق اختصاصی؛ فایل معلمان دیگر را نمی‌بیند</span></div>
                  </label>
                  <label class="role-card">
                    <input type="radio" name="role" value="admin" />
                    <span class="role-ico">${ICONS.shield}</span>
                    <div><b>مدیر</b><span>دسترسی کامل به همهٔ اتاق‌ها و کاربران</span></div>
                  </label>
                </div>
              </div>
              <p class="form-error" data-err="1"></p>
            </div>

            <div class="step-pane hidden" data-pane="2" data-dir="forward">
              <label class="field">
                <span>${isEdit ? 'رمز عبور جدید (اختیاری)' : 'رمز عبور'}</span>
                <div class="pw-wrap">
                  <div class="input-wrap">
                    <input name="password" type="password" dir="ltr" autocomplete="new-password" placeholder="${isEdit ? 'برای تغییر رمز پر کنید' : 'حداقل ۸ کاراکتر'}" />
                  </div>
                  <button type="button" class="pw-gen" data-gen title="تولید رمز قوی" aria-label="تولید رمز قوی">${ICONS.key}</button>
                </div>
                <div class="strength" data-score="0"><i></i><i></i><i></i><i></i></div>
                <span class="hint">حداقل ۸ کاراکتر، شامل حرف و عدد</span>
              </label>

              <label class="field">
                <span>تکرار رمز عبور</span>
                <div class="input-wrap">
                  <input name="password2" type="password" dir="ltr" autocomplete="new-password" />
                </div>
              </label>

              <div class="field" data-quota-field>
                <span>سهمیهٔ فضای اختصاصی</span>
                <div class="quota-row">
                  <input type="range" name="quotaRange" min="1" max="500" step="1" value="15" aria-label="سهمیهٔ فضا" />
                  <div class="quota-num">
                    <input name="quotaNum" type="number" min="1" max="500" step="1" value="15" aria-label="سهمیه به گیگابایت" />
                    <span>گیگابایت</span>
                  </div>
                </div>
              </div>

              <div class="summary" data-summary></div>
              <p class="form-error" data-err="2"></p>
            </div>
          </form>
        </div>

        <div class="sheet-foot">
          <button class="btn" data-back disabled>مرحلهٔ قبل</button>
          <div class="spacer"></div>
          <button class="btn" data-cancel>انصراف</button>
          <button class="btn btn-primary" data-next>ادامه</button>
        </div>
      </div>
    `;

    document.body.appendChild(back);
    document.body.style.overflow = 'hidden';

    const sheet = back.querySelector('.sheet');
    const form = back.querySelector('.user-form');
    const panes = Array.from(back.querySelectorAll('.step-pane'));
    const stepEls = Array.from(back.querySelectorAll('.step'));
    const line = back.querySelector('[data-line]');
    const btnBack = back.querySelector('[data-back]');
    const btnNext = back.querySelector('[data-next]');
    const btnCancel = back.querySelector('[data-cancel]');
    const closeBtn = back.querySelector('[data-close]');
    const nameInput = form.elements.displayName;
    const userInput = form.elements.username;
    const passInput = form.elements.password;
    const pass2Input = form.elements.password2;
    const range = form.elements.quotaRange;
    const num = form.elements.quotaNum;
    const quotaField = back.querySelector('[data-quota-field]');
    const summary = back.querySelector('[data-summary]');
    const strength = back.querySelector('.strength');
    let step = 1;
    let busy = false;

    // prefill
    if (isEdit) {
      nameInput.value = existing.displayName || '';
      userInput.value = existing.username || '';
      const roleRadio = form.querySelector(`input[name="role"][value="${existing.role}"]`);
      if (roleRadio) roleRadio.checked = true;
    } else {
      form.querySelector('input[name="role"][value="teacher"]').checked = true;
    }

    const updateQuotaVisibility = () => {
      const role = form.querySelector('input[name="role"]:checked');
      const isAdmin = role && role.value === 'admin';
      quotaField.classList.toggle('hidden', isAdmin);
    };
    form.querySelectorAll('input[name="role"]').forEach((r) => r.addEventListener('change', () => {
      updateQuotaVisibility();
      updateSummary();
    }));
    updateQuotaVisibility();

    const updateStrength = () => {
      strength.dataset.score = String(scorePassword(passInput.value));
    };
    passInput.addEventListener('input', updateStrength);

    const syncQuota = (value) => {
      const v = Math.max(1, Math.min(500, Number(value) || 15));
      range.value = v;
      num.value = v;
      updateSummary();
    };
    range.addEventListener('input', () => syncQuota(range.value));
    num.addEventListener('input', () => {
      if (num.value !== '') syncQuota(num.value);
    });

    back.querySelector('[data-gen]').addEventListener('click', () => {
      const p = generatePassword();
      passInput.value = p;
      pass2Input.value = p;
      passInput.type = 'text';
      pass2Input.type = 'text';
      updateStrength();
      toast('رمز قوی تولید شد — آن را کپی کنید', 'info');
    });

    const updateSummary = () => {
      const role = (form.querySelector('input[name="role"]:checked') || {}).value || 'teacher';
      summary.innerHTML = '';
      const rows = [
        ['نام کاربری', `@${userInput.value.trim() || '—'}`],
        ['نقش', role === 'admin' ? 'مدیر سامانه' : 'معلم'],
        ['مسیر اتاق', `/srv/files/teachers/${userInput.value.trim() || '—'}`],
        ['سهمیه', role === 'admin' ? 'بدون محدودیت' : `${num.value || 15} گیگابایت`],
      ];
      rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        if (label === 'نام کاربری' || label === 'مسیر اتاق') dd.className = 'ltr';
        row.append(dt, dd);
        summary.appendChild(row);
      });
    };
    userInput.addEventListener('input', updateSummary);
    updateSummary();

    const setStep = (next, dir) => {
      step = next;
      panes.forEach((p) => {
        const n = Number(p.dataset.pane);
        p.classList.toggle('hidden', n !== next);
        if (n === next) {
          p.dataset.dir = dir === 'back' ? 'back' : 'forward';
          // restart animation
          p.style.animation = 'none';
          void p.offsetWidth;
          p.style.animation = '';
        }
      });
      stepEls.forEach((el) => {
        const n = Number(el.dataset.step);
        el.classList.toggle('active', n === step);
        el.classList.toggle('done', n < step);
      });
      line.classList.toggle('done', step > 1);
      btnBack.disabled = step === 1;
      btnNext.textContent = step === 1 ? 'ادامه' : (isEdit ? 'ذخیرهٔ تغییرات' : 'ایجاد کاربر');
      btnNext.classList.toggle('btn-gold', step === 2);
      const err1 = back.querySelector('[data-err="1"]');
      if (err1) err1.textContent = '';
      setTimeout(() => {
        if (step === 1) nameInput.focus();
        else passInput.focus();
      }, 80);
    };

    const validateStep1 = () => {
      const err = back.querySelector('[data-err="1"]');
      err.textContent = '';
      if (String(nameInput.value).trim().length < 2) {
        err.textContent = 'نام و نام خانوادگی را کامل وارد کنید.';
        nameInput.focus();
        return false;
      }
      if (!isEdit) {
        const u = String(userInput.value).trim().toLowerCase();
        if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(u)) {
          err.textContent = 'نام کاربری باید ۳ تا ۳۲ کاراکتر و شامل حروف انگلیسی، عدد، نقطه یا خط تیره باشد.';
          userInput.focus();
          return false;
        }
      }
      return true;
    };

    const validateStep2 = () => {
      const err = back.querySelector('[data-err="2"]');
      err.textContent = '';
      const p = passInput.value;
      const p2 = pass2Input.value;
      const role = (form.querySelector('input[name="role"]:checked') || {}).value || 'teacher';

      if (!isEdit || p || p2) {
        if (p.length < 8) { err.textContent = 'رمز عبور باید حداقل ۸ کاراکتر باشد.'; passInput.focus(); return false; }
        if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) { err.textContent = 'رمز عبور باید شامل حرف و عدد باشد.'; passInput.focus(); return false; }
        if (p !== p2) { err.textContent = 'تکرار رمز با رمز عبور یکسان نیست.'; pass2Input.focus(); return false; }
      }
      if (role !== 'admin') {
        const q = Number(num.value);
        if (!Number.isFinite(q) || q < 1 || q > 500) { err.textContent = 'سهمیه باید بین ۱ تا ۵۰۰ گیگابایت باشد.'; return false; }
      }
      return true;
    };

    btnNext.addEventListener('click', async () => {
      if (busy) return;
      if (step === 1) {
        if (!validateStep1()) return;
        setStep(2, 'forward');
        updateSummary();
        return;
      }

      if (!validateStep2()) return;

      const role = (form.querySelector('input[name="role"]:checked') || {}).value || 'teacher';
      const payload = {
        displayName: String(nameInput.value).trim(),
        role,
        quotaGB: Number(num.value) || 15,
      };
      if (passInput.value) payload.password = passInput.value;

      busy = true;
      btnNext.disabled = true;
      const originalText = btnNext.textContent;
      btnNext.textContent = isEdit ? 'در حال ذخیره…' : 'در حال ساخت…';

      try {
        if (isEdit) {
          await api(`/api/admin/users/${existing.id}`, { method: 'PATCH', body: payload });
          toast('تغییرات ذخیره شد', 'ok');
        } else {
          payload.username = String(userInput.value).trim().toLowerCase();
          await api('/api/admin/users', { method: 'POST', body: payload });
          toast(`حساب «${payload.displayName}» ساخته شد`, 'ok');
        }
        close();
        await loadUsers();
        await loadOwners();
      } catch (ex) {
        back.querySelector('[data-err="2"]').textContent = ex.message;
        btnNext.disabled = false;
        btnNext.textContent = originalText;
      } finally {
        busy = false;
      }
    });

    btnBack.addEventListener('click', () => {
      if (step > 1) setStep(step - 1, 'back');
    });

    const close = () => {
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      back.remove();
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);

    btnCancel.addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    back.addEventListener('click', (e) => { if (e.target === back) close(); });

    setStep(1, 'forward');
  }

  /* ---------------------------------------------------------------- */
  /*  backups (admin)                                                  */
  /* ---------------------------------------------------------------- */
  const DAY_LABELS = {
    Sat: 'شنبه', Sun: 'یکشنبه', Mon: 'دوشنبه', Tue: 'سه‌شنبه',
    Wed: 'چهارشنبه', Thu: 'پنجشنبه', Fri: 'جمعه',
  };

  function fmtDuration(ms) {
    if (ms == null) return '—';
    const s = Math.round(Number(ms) / 1000);
    if (s < 60) return `${fmtNum(s)} ثانیه`;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${fmtNum(m)} دقیقه و ${fmtNum(r)} ثانیه` : `${fmtNum(m)} دقیقه`;
  }

  async function loadBackups(opts = {}) {
    if (!state.user || state.user.role !== 'admin') return;
    try {
      const data = await api('/api/admin/backups');
      state.backups = data;
      renderBackupStats(data);
      if (opts.settings) renderBackupSettings(data.settings);
      renderBackupRuns(data.runs || []);
      if (data.summary && data.summary.running > 0) scheduleBackupPoll();
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'err');
    }
  }

  function renderBackupStats(data) {
    const grid = $('#backup-stats');
    if (!grid) return;
    grid.innerHTML = '';
    const s = data.summary || {};
    const last = s.last;
    const cards = [
      {
        cls: 'blue', ico: ICONS.database, label: 'کل نسخه‌ها', value: fmtNum(s.total || 0),
        sub: last ? `آخرین: ${fmtDate(last.finishedAt || last.startedAt)}` : 'هنوز بکاپی گرفته نشده',
      },
      {
        cls: 'green', ico: ICONS.archive, label: 'حجم کل بکاپ‌ها', value: fmtBytes(s.totalBytes || 0),
        sub: `${fmtNum(s.total || 0)} نسخه`,
      },
      {
        cls: 'gold', ico: ICONS.clock, label: 'در حال اجرا', value: fmtNum(s.running || 0),
        sub: s.running ? 'در پس‌زمینه در حال اجراست' : 'بدون اجرای هم‌زمان',
      },
      {
        cls: '', ico: ICONS.warn, label: 'اجرای ناموفق', value: fmtNum(s.failed || 0),
        sub: 'در تاریخچهٔ بکاپ‌ها',
      },
    ];
    cards.forEach((c) => {
      const el = document.createElement('div');
      el.className = `stat-card ${c.cls}`.trim();
      const label = document.createElement('div');
      label.className = 'label';
      label.innerHTML = c.ico;
      const ls = document.createElement('span');
      ls.textContent = c.label;
      label.appendChild(ls);
      const b = document.createElement('b');
      b.textContent = c.value;
      const sub = document.createElement('span');
      sub.className = 'sub';
      sub.textContent = c.sub;
      el.append(label, b, sub);
      grid.appendChild(el);
    });
  }

  function renderBackupSettings(settings) {
    const f = $('#backup-settings-form');
    if (!f || !settings) return;
    f.elements.autoEnabled.checked = !!settings.autoEnabled;
    f.elements.dbTime.value = settings.dbTime || '03:17';
    f.elements.filesDay.value = settings.filesDay || 'Sun';
    f.elements.filesTime.value = settings.filesTime || '03:42';
    f.elements.retentionDb.value = settings.retentionDb || 21;
    f.elements.retentionFiles.value = settings.retentionFiles || 35;
  }

  function backupMetaText(run) {
    const m = run.meta || {};
    if (run.kind === 'db') {
      const parts = ['پایگاه دادهٔ مدرسه'];
      if (m.users != null) parts.push(`${fmtNum(m.users)} کاربر`);
      if (m.teachers != null) parts.push(`${fmtNum(m.teachers)} معلم`);
      if (m.entries != null) parts.push(`${fmtNum(m.entries)} آیتم`);
      return parts.join(' • ');
    }
    const parts = ['پوشهٔ فایل معلمان'];
    if (m.entries != null) parts.push(`${fmtNum(m.entries)} آیتم`);
    return parts.join(' • ');
  }

  function renderBackupRuns(runs) {
    const list = $('#backup-list');
    if (!list) return;
    list.innerHTML = '';

    if (!runs.length) {
      const empty = document.createElement('div');
      empty.className = 'backup-empty';
      empty.textContent = 'هنوز نسخهٔ پشتیبانی ساخته نشده است. با دکمه‌های بالا یک بکاپ دستی بگیرید.';
      list.appendChild(empty);
      return;
    }

    const head = document.createElement('div');
    head.className = 'backup-head';
    ['نوع', 'حالت', 'وضعیت', 'حجم', 'مدت', 'تاریخ', 'جزئیات', 'عملیات'].forEach((t) => {
      const s = document.createElement('span');
      s.textContent = t;
      head.appendChild(s);
    });
    list.appendChild(head);

    runs.forEach((run) => {
      const row = document.createElement('div');
      row.className = 'backup-row';

      const kind = document.createElement('div');
      kind.className = 'backup-kind c-kind';
      const ico = document.createElement('span');
      ico.className = `ico${run.kind === 'files' ? ' gold' : ''}`;
      ico.innerHTML = run.kind === 'db' ? ICONS.database : ICONS.archive;
      const kt = document.createElement('span');
      kt.textContent = run.kind === 'db' ? 'دیتابیس' : 'فایل‌ها';
      kind.append(ico, kt);

      const mode = document.createElement('div');
      mode.className = 'c-mode';
      const mb = document.createElement('span');
      mb.className = `badge${run.mode === 'auto' ? ' admin' : ''}`;
      mb.textContent = run.mode === 'auto' ? 'زمان‌بندی‌شده' : 'دستی';
      mode.appendChild(mb);

      const st = document.createElement('div');
      st.className = 'c-status';
      const sb = document.createElement('span');
      if (run.status === 'ok') { sb.className = 'badge ok'; sb.textContent = 'موفق'; }
      else if (run.status === 'failed') { sb.className = 'badge off'; sb.textContent = 'ناموفق'; }
      else { sb.className = 'badge run'; sb.innerHTML = '<span class="spin-dot"></span> در حال اجرا'; }
      st.appendChild(sb);

      const size = document.createElement('div');
      size.className = 'c-size mono';
      size.textContent = run.sizeBytes == null ? '—' : fmtBytes(run.sizeBytes);

      const dur = document.createElement('div');
      dur.className = 'c-dur';
      dur.textContent = fmtDuration(run.durationMs);

      const date = document.createElement('div');
      date.className = 'c-date';
      date.textContent = fmtDate(run.startedAt);

      const meta = document.createElement('div');
      meta.className = 'backup-meta c-meta';
      meta.textContent = run.status === 'failed' && run.message ? run.message : backupMetaText(run);

      const actions = document.createElement('div');
      actions.className = 'backup-actions c-actions';
      if (run.status === 'ok') {
        actions.appendChild(actionBtn(ICONS.download, 'دانلود بکاپ', () => {
          window.location.href = `/api/admin/backups/${run.id}/download`;
        }));
      }
      actions.appendChild(actionBtn(ICONS.trash, 'حذف بکاپ', () => deleteBackupRun(run), 'danger'));

      row.append(kind, mode, st, size, dur, date, meta, actions);
      list.appendChild(row);
    });
  }

  function scheduleBackupPoll() {
    if (state.backupPoll) return;
    let ticks = 0;
    state.backupPoll = setInterval(async () => {
      ticks += 1;
      if (ticks > 200) { clearBackupPoll(); return; }
      try {
        const data = await api('/api/admin/backups');
        state.backups = data;
        renderBackupStats(data);
        renderBackupRuns(data.runs || []);
        if (!data.summary || data.summary.running === 0) {
          clearBackupPoll();
          toast('اجرای بکاپ به پایان رسید', 'ok');
        }
      } catch { clearBackupPoll(); }
    }, 3000);
  }

  function clearBackupPoll() {
    if (state.backupPoll) { clearInterval(state.backupPoll); state.backupPoll = null; }
  }

  async function runBackupNow(kind) {
    const btn = kind === 'db' ? $('#backup-db-btn') : $('#backup-files-btn');
    if (btn) btn.disabled = true;
    try {
      await api('/api/admin/backups/run', { method: 'POST', body: { kind } });
      toast(kind === 'db' ? 'بکاپ دیتابیس آغاز شد' : 'بکاپ فایل‌ها آغاز شد', 'info');
      await loadBackups();
    } catch (ex) {
      toast(ex.message, 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function deleteBackupRun(run) {
    const label = run.fileName || (run.kind === 'db' ? 'بکاپ دیتابیس' : 'بکاپ فایل‌ها');
    openModal({
      title: 'حذف نسخهٔ پشتیبان',
      desc: `«${label}» برای همیشه حذف می‌شود و قابل بازگشت نیست.`,
      confirmText: 'حذف کن',
      danger: true,
      onConfirm: async () => {
        await api(`/api/admin/backups/${run.id}`, { method: 'DELETE' });
        toast('نسخهٔ پشتیبان حذف شد', 'ok');
        await loadBackups();
      },
    });
  }

  async function saveBackupSettings(e) {
    e.preventDefault();
    const f = e.target;
    const msg = $('#backup-settings-msg');
    msg.textContent = '';
    const payload = {
      autoEnabled: f.elements.autoEnabled.checked,
      dbTime: f.elements.dbTime.value,
      filesDay: f.elements.filesDay.value,
      filesTime: f.elements.filesTime.value,
      retentionDb: Number(f.elements.retentionDb.value),
      retentionFiles: Number(f.elements.retentionFiles.value),
    };
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const data = await api('/api/admin/backups/settings', { method: 'PUT', body: payload });
      renderBackupSettings(data.settings);
      msg.textContent = 'ذخیره شد — زمان‌بندی جدید از همین لحظه اعمال می‌شود.';
      msg.style.color = 'var(--ok)';
      toast('تنظیمات پشتیبان‌گیری ذخیره شد', 'ok');
    } catch (ex) {
      msg.textContent = ex.message;
      msg.style.color = 'var(--danger)';
    } finally {
      btn.disabled = false;
    }
  }

  /* ---------------------------------------------------------------- */
  /*  overview (admin)                                                 */
  /* ---------------------------------------------------------------- */
  async function loadOverview() {
    if (!state.user || state.user.role !== 'admin') return;
    const grid = $('#stats-grid');
    const list = $('#usage-list');
    grid.innerHTML = '';
    list.innerHTML = '';
    try {
      const data = await api('/api/admin/stats');
      const s = data.stats || {};
      const perUser = data.perUser || [];

      const cards = [
        { cls: '', ico: ICONS.user, label: 'معلمان', value: fmtNum(s.teachers || 0), sub: `${fmtNum(s.active || 0)} حساب فعال` },
        { cls: 'blue', ico: ICONS.database, label: 'فضای مصرفی', value: fmtBytes(s.usedBytes || 0), sub: `${fmtNum(s.fileCount || 0)} فایل` },
        { cls: 'green', ico: ICONS.folder, label: 'فضای آزاد دیسک', value: s.disk ? fmtBytes(s.disk.free) : '—', sub: s.disk ? `از ${fmtBytes(s.disk.total)}` : 'نامشخص' },
        { cls: 'gold', ico: ICONS.shield, label: 'مدیران', value: fmtNum(s.admins || 0), sub: `${fmtNum(s.total || 0)} کاربر کل` },
      ];

      cards.forEach((c) => {
        const el = document.createElement('div');
        el.className = `stat-card ${c.cls}`.trim();
        const label = document.createElement('div');
        label.className = 'label';
        label.innerHTML = c.ico;
        const lspan = document.createElement('span');
        lspan.textContent = c.label;
        label.appendChild(lspan);
        const b = document.createElement('b');
        b.textContent = c.value;
        const sub = document.createElement('span');
        sub.className = 'sub';
        sub.textContent = c.sub;
        el.append(label, b, sub);
        grid.appendChild(el);
      });

      if (!perUser.length) {
        const p = document.createElement('p');
        p.className = 'hint';
        p.textContent = 'کاربری ثبت نشده است.';
        list.appendChild(p);
        return;
      }

      perUser.forEach((u) => {
        const row = document.createElement('div');
        row.className = 'usage-row';

        const name = document.createElement('div');
        name.className = 'usage-name';
        const av = document.createElement('span');
        av.className = 'avatar';
        av.textContent = initials(u.displayName || u.username);
        const box = document.createElement('div');
        const b = document.createElement('b');
        b.textContent = u.displayName || u.username;
        const un = document.createElement('span');
        un.textContent = `@${u.username}`;
        box.append(b, un);
        name.append(av, box);

        const bar = quotaBar(u.used, u.role === 'admin' ? 0 : u.quota);

        const num = document.createElement('div');
        num.className = 'usage-num';
        num.textContent = u.role === 'admin'
          ? `${fmtBytes(u.used)} — مدیر`
          : `${fmtBytes(u.used)} از ${fmtBytes(u.quota)}`;

        row.append(name, bar, num);
        list.appendChild(row);
      });
    } catch (err) {
      if (err.status !== 401) toast(err.message, 'err');
    }
  }

  /* ---------------------------------------------------------------- */
  /*  event wiring                                                     */
  /* ---------------------------------------------------------------- */
  function bind() {
    // auth
    $('#login-form').addEventListener('submit', doLogin);
    $('#peek-password').addEventListener('click', () => {
      const input = $('#login-password');
      const btn = $('#peek-password');
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-label', show ? 'مخفی‌کردن رمز' : 'نمایش رمز');
      btn.title = show ? 'مخفی‌کردن رمز' : 'نمایش رمز';
    });
    $('#login-password').addEventListener('keyup', (e) => {
      const on = typeof e.getModifierState === 'function' && e.getModifierState('CapsLock');
      $('#caps-warn').classList.toggle('hidden', !on);
    });
    $('#captcha-refresh').addEventListener('click', refreshCaptcha);
    $('#captcha-box').addEventListener('click', refreshCaptcha);

    // nav
    $$('.nav-item').forEach((b) => b.addEventListener('click', () => setPage(b.dataset.page)));
    $('#logout-btn').addEventListener('click', doLogout);
    $('#sessions-refresh')?.addEventListener('click', loadSessions);
    $('#menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));

    window.addEventListener('hashchange', () => {
      const page = (location.hash || '').replace(/^#/, '');
      if (page && PAGE_META[page] && page !== state.page) setPage(page, true);
    });

    // files
    $('#upload-btn').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', (e) => {
      uploadFiles(e.target.files);
      e.target.value = '';
    });
    $('#newfolder-btn').addEventListener('click', newFolder);

    $$('#view-seg .seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === state.view);
      b.addEventListener('click', () => {
        state.view = b.dataset.view;
        localStorage.setItem('darsjo_view', state.view);
        $$('#view-seg .seg-btn').forEach((x) => x.classList.toggle('active', x === b));
        renderFiles();
      });
    });

    $('#search').addEventListener('input', (e) => {
      if (state.page === 'media') { renderMedia(); return; }
      state.files.filter = e.target.value;
      renderFiles();
    });

    $('#owner-select').addEventListener('change', (e) => {
      state.files.owner = e.target.value || '';
      state.files.path = '/';
      if (state.page === 'media') loadMedia();
      else if (state.page === 'files') loadFiles('/');
    });

    // drag and drop
    let dragDepth = 0;
    window.addEventListener('dragenter', (e) => {
      if (!state.user) return;
      e.preventDefault();
      dragDepth += 1;
      $('#drop-overlay').classList.remove('hidden');
    });
    window.addEventListener('dragover', (e) => { if (state.user) e.preventDefault(); });
    window.addEventListener('dragleave', (e) => {
      if (!state.user) return;
      e.preventDefault();
      dragDepth -= 1;
      if (dragDepth <= 0) { dragDepth = 0; $('#drop-overlay').classList.add('hidden'); }
    });
    window.addEventListener('drop', (e) => {
      if (!state.user) return;
      e.preventDefault();
      dragDepth = 0;
      $('#drop-overlay').classList.add('hidden');
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        uploadFiles(e.dataTransfer.files);
      }
    });

    // media chips
    $$('#media-chips .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        state.mediaKind = chip.dataset.kind;
        $$('#media-chips .chip').forEach((x) => x.classList.toggle('active', x === chip));
        loadMedia();
      });
    });

    // profile
    bindPasswordForm();

    // users
    $('#add-user-btn').addEventListener('click', () => openUserSheet(null));
    $('#refresh-stats').addEventListener('click', loadOverview);

    // backups — manual only for now; the automatic form is intentionally absent
    $('#backup-db-btn').addEventListener('click', () => runBackupNow('db'));
    $('#backup-files-btn').addEventListener('click', () => runBackupNow('files'));
    $('#backup-refresh').addEventListener('click', () => loadBackups({ settings: true }));
    const backupSettingsForm = $('#backup-settings-form');
    if (backupSettingsForm) backupSettingsForm.addEventListener('submit', saveBackupSettings);

    // prevent accidental close while uploading? not needed
  }

  /* ---------------------------------------------------------------- */
  /*  boot                                                             */
  /* ---------------------------------------------------------------- */
  bind();

  (async function boot() {
    try {
      const data = await api('/api/auth/me');
      state.user = data.user;
      state.csrf = data.csrf;
      showApp();
    } catch {
      showAuth();
    }
  })();
})();
