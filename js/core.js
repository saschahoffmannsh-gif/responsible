'use strict';
// Responsible – Kern: Hilfsfunktionen, Konten, API, Synchronisation
const API = window.RS_API || 'https://wlujgkbtpjxuekwsgnmg.supabase.co/functions/v1/responsible';
const VERSION = '1.0.0';
const PALETTE = ['#467ba6','#d9778f','#36a78a','#e0a93b','#8a6fd1','#e2725b','#3aa6c9','#7a9a3a','#c45ab3','#5b6b7d','#d4a017','#2f9e6e'];
const EVENT_TYPES = [
  {id:'private',label:'Privat',c:'#36a78a'},{id:'work',label:'Arbeit',c:'#d6455d'},{id:'vacation',label:'Urlaub',c:'#e0a93b'},
  {id:'holidays',label:'Ferien / Feiertage',c:'rainbow'},{id:'birthday',label:'Geburtstag',c:'#e46d8c'},{id:'other',label:'Sonstiges',c:'#8a99a8'}];
const GENERAL = new Set(['holidays','birthday','other']);
const WASTE = {rest:{t:'Restabfall',s:'Rest',c:'#6b7785'},bio:{t:'Bioabfall',s:'Bio',c:'#8a5a2b'},yellow:{t:'Gelbe Tonne',s:'Gelb',c:'#e3b007'},paper:{t:'Altpapier',s:'Papier',c:'#3a86c8'},other:{t:'Termin',s:'Termin',c:'#5b6b7d'}};
const WD = ['Mo','Di','Mi','Do','Fr','Sa','So'];

// ---- Icons (Linien-Icons im Lucide-Stil) ----
const IP = {
  home:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  cal:'<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
  todo:'<path d="M4 6h2M4 12h2M4 18h2"/><path d="M10 6h10M10 12h10M10 18h10"/>',
  task:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  group:'<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.6c2.6.2 4.4 1.9 5 4.9"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>', plus:'<path d="M12 5v14M5 12h14"/>', left:'<path d="m15 18-6-6 6-6"/>', right:'<path d="m9 18 6-6-6-6"/>',
  down:'<path d="m6 9 6 6 6-6"/>', edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  cloud:'<path d="M7 18a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.6A3.7 3.7 0 0 1 17.5 18z"/>', sync:'<path d="M20 11a8 8 0 0 0-14.3-4.3L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15"/><path d="M20 20v-5h-5"/>',
  share:'<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4"/>',
  camera:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', bin:'<path d="M5 7h14l-1.2 13H6.2z"/><path d="M3.5 7h17M9 7V4.5h6V7"/><path d="M10 11v6M14 11v6"/>',
  upload:'<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v4h16v-4"/>', link:'<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  heart:'<path d="M12 20s-7.5-4.6-9-9.3C2 7.4 4.2 4.5 7.3 4.5c2 0 3.6 1.1 4.7 2.8 1.1-1.7 2.7-2.8 4.7-2.8 3.1 0 5.3 2.9 4.3 6.2-1.5 4.7-9 9.3-9 9.3z"/>',
  gift:'<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8.5h14V12M12 8v12.5"/><path d="M12 8C10 4 6.5 4.5 7.5 7.2 8 8 12 8 12 8zm0 0c2-4 5.5-3.5 4.5-.8C16 8 12 8 12 8z"/>',
  cart:'<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2.5 3.5h3l2.4 11.5h11l2-8.5H6.3"/>', x:'<path d="M6 6l12 12M18 6 6 18"/>',
  logout:'<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>', users:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4.3 4-6.5 8-6.5s7.2 2.2 8 6.5"/>',
};
const ic = (n, cls='') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IP[n]||''}</svg>`;

// ---- Hilfen ----
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pd = (s) => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d, 12); };
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate()+n); return ymd(d); };
const todayS = () => ymd(new Date());
const fmt = (s, o) => new Intl.DateTimeFormat('de-DE', o).format(pd(s));
const fmtLong = (s) => fmt(s, {weekday:'long', day:'numeric', month:'long', year:'numeric'});
const fmtMonth = (d) => new Intl.DateTimeFormat('de-DE', {month:'long', year:'numeric'}).format(d);
const rid = (p) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const norm = (e) => e.toLocaleLowerCase('de-DE').replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const lsGet = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const kindLabel = (k) => k === 'team' ? 'Team' : 'Familie';
function readable(hex) { const n = parseInt(hex.slice(1), 16); const r = n>>16, g = (n>>8)&255, b = n&255; return (r*299+g*587+b*114)/1000 > 175 ? '#24384c' : '#fff'; }

// ---- Konten auf diesem Gerät (Schnellwahl wie HopfenMatch) ----
let ACC = lsGet('rs_acc', {cur:null, list:{}});
const saveAcc = () => lsSet('rs_acc', ACC);
const token = () => ACC.cur && ACC.list[ACC.cur]?.token;

// ---- Zustand ----
let ME = null, GROUPS = [], G = null;
let D = blankData();
function blankData() { return {group:null, members:[], invites:[], items:new Map(), seq:0}; }
let SYNC = 'syncing', PENDING = 0;
const PKEYS = new Set();
const UI = {view:'home', tab:'main', month:null, sel:todayS(), anim:null};
{ const n = new Date(); UI.month = new Date(n.getFullYear(), n.getMonth(), 1, 12); }

// ---- API ----
class ApiError extends Error { constructor(m, code, extra={}) { super(m); this.code = code; Object.assign(this, extra); } }
async function api(path, body, opt={}) {
  const h = {'content-type':'application/json'};
  const t = opt.token ?? token(); if (t && !opt.noauth) h.authorization = 'Bearer ' + t;
  let r, j;
  try { r = await fetch(API + path, {method: body ? 'POST' : 'GET', headers:h, body: body ? JSON.stringify(body) : undefined, cache:'no-store'}); }
  catch { throw new ApiError('Keine Verbindung zum Server. Bitte prüfe deine Internetverbindung.', 'offline', {offline:true}); }
  try { j = await r.json(); } catch { j = {}; }
  if (r.status === 401) { if (!opt.noauth && path !== '/login') { onLoggedOut(); } throw new ApiError(j.error || 'Bitte neu anmelden.', 401, j); }
  if (!r.ok || j.error) throw new ApiError(j.error || ('Fehler ' + r.status), j.code ?? r.status, j);
  return j;
}
function onLoggedOut() {
  if (ACC.cur && ACC.list[ACC.cur]) { delete ACC.list[ACC.cur].token; }
  ACC.cur = null; saveAcc(); ME = null; GROUPS = []; G = null; D = blankData();
  render(); toast('Bitte melde dich erneut an.', 'err');
}

// ---- Datenzugriff ----
const rows = (coll) => [...D.items.values()].filter((r) => r.coll === coll && !r.deleted && r.data);
const calItems = () => rows('cal').map((r) => ({...r.data, id:r.id, rev:r.rev}));
const member = (id) => D.members.find((m) => m.id === id);
const mname = (id) => member(id)?.name ?? 'Ehemaliges Mitglied';
const mcolor = (id) => member(id)?.color ?? '#9aa8b5';
const myRole = () => D.group?.role ?? GROUPS.find((g) => g.id === G)?.role ?? 'member';
const isAdmin = () => ['owner','admin'].includes(myRole());
const doneMap = () => { const o = {}; for (const r of rows('done')) o[r.id] = r.data; return o; };
const feeds = () => rows('feed').map((r) => ({...r.data, id:r.id, rev:r.rev}));
const fevs = () => rows('fev').map((r) => ({...r.data, id:r.id, rev:r.rev}));
const endOf = (e) => e.endDate || e.date;
const covers = (e, d) => e.date <= d && endOf(e) >= d;
const overlaps = (e, a, b) => e.date <= b && endOf(e) >= a;
const typeOf = (e) => e.kind === 'event' ? (e.eventType || 'private') : 'task';
const isGeneral = (e) => e.kind === 'event' && GENERAL.has(typeOf(e));
const forMe = (e) => (e.people || []).includes('all') || (e.people || []).includes(ME?.id);
const multi = (e) => !!(e.endDate && e.endDate > e.date);
const sortItems = (a) => [...a].sort((x, y) => Number(multi(y)) - Number(multi(x)) || (x.completed === y.completed ? ((x.time||'99:99').localeCompare(y.time||'99:99') || x.title.localeCompare(y.title,'de')) : x.completed ? 1 : -1));
const feedName = (id) => id === 'manual' ? 'Eigener Eintrag' : (feeds().find((f) => f.id === id)?.name ?? 'Kalender');
const feedColor = (e) => e.kind && e.kind !== 'other' ? WASTE[e.kind].c : (feeds().find((f) => f.id === e.feed)?.color ?? '#5b6b7d');
function peopleColors(e) {
  if (isGeneral(e)) return [];
  const p = e.people || [];
  if (p.includes('all')) return D.members.map((m) => m.color);
  return p.map(mcolor);
}
function peopleLabel(e) {
  if (isGeneral(e)) return typeOf(e) === 'holidays' ? 'Fester Termin' : typeOf(e) === 'birthday' ? 'Für alle' : 'Allgemeiner Termin';
  const p = e.people || [];
  if (p.includes('all')) return 'Alle';
  return p.map(mname).join(', ');
}
function personDots(e) {
  const p = e.people || [];
  if (isGeneral(e)) return '';
  if (p.includes('all')) return `<span class="pchip"><span class="dots">${D.members.slice(0,5).map((m) => `<span class="dot" style="--c:${m.color}"></span>`).join('')}</span>Alle</span>`;
  return p.map((id) => `<span class="pchip"><span class="dot" style="--c:${mcolor(id)}"></span>${esc(mname(id))}</span>`).join('');
}
function avatar(m, size='') {
  if (!m) return `<span class="av ${size}" style="--c:#b9c6d2">?</span>`;
  const ini = esc((m.name || '?').trim().charAt(0).toUpperCase());
  const c = m.color || '#467ba6';
  return `<span class="av ${size}" style="--c:${c};color:${readable(c)}" title="${esc(m.name)}">${m.avatar ? `<img src="${esc(m.avatar)}" alt="" loading="lazy">` : ini}</span>`;
}
function groupBadge(g, size='') {
  if (!g) return '';
  return `<span class="av av--sq ${size}" style="--c:#2f80c4;color:#fff">${g.image ? `<img src="${esc(g.image)}" alt="">` : esc(g.name.charAt(0).toUpperCase())}</span>`;
}

// ---- Synchronisation ----
const cacheKey = () => `rs_cache_${ACC.cur}_${G}`;
function saveCache() { if (!G || !ACC.cur) return; lsSet(cacheKey(), {group:D.group, members:D.members, invites:D.invites, seq:D.seq, items:[...D.items.values()].filter((r) => !r.deleted)}); }
function loadCache() {
  D = blankData();
  const c = lsGet(cacheKey(), null);
  if (c) { D.group = c.group; D.members = c.members || []; D.invites = c.invites || []; D.seq = c.seq || 0; for (const r of c.items || []) D.items.set(r.coll + '|' + r.id, r); }
}
function setSync(s) { SYNC = s; const el = $('#syncbtn'); if (el) { el.className = 'icon-btn sync--' + s; el.title = s === 'online' ? 'Gemeinsamer Kalender aktuell – jetzt neu laden' : s === 'syncing' ? 'Wird synchronisiert …' : 'Server nicht erreichbar – erneut versuchen'; } }
let syncing = false, lastMe = 0;
async function sync(manual=false) {
  if (!G || !ME || syncing || (PENDING > 0 && !manual)) return;
  syncing = true; const g = G;
  if (manual) setSync('syncing');
  try {
    let more = true, changed = false;
    while (more && g === G) {
      const j = await api(`/sync?g=${encodeURIComponent(g)}&since=${D.seq}`);
      if (g !== G) break;
      const sig = JSON.stringify([D.group, D.members, D.invites]);
      D.group = j.group; D.members = j.members; D.invites = j.invites || [];
      if (sig !== JSON.stringify([D.group, D.members, D.invites])) changed = true;
      if (j.full) { for (const [k, r] of D.items) if (!PKEYS.has(k)) D.items.delete(k); changed = true; }
      for (const r of j.items) { const k = r.coll + '|' + r.id; if (PKEYS.has(k)) continue; D.items.set(k, r); changed = true; }
      D.seq = Math.max(D.seq, j.seq || 0); more = !!j.more;
    }
    setSync('online');
    if (changed) { saveCache(); render(); }
    if (Date.now() - lastMe > 60000) refreshMe();
  } catch (e) {
    if (e.gone) { toast('Du bist nicht mehr Mitglied dieser Gruppe.', 'err'); await refreshMe(true); }
    else if (e.code !== 401) { setSync('offline'); if (manual) toast('Der gemeinsame Kalender ist gerade nicht erreichbar.', 'err'); }
  } finally { syncing = false; }
}
async function refreshMe(rerender=false) {
  lastMe = Date.now();
  try {
    const j = await api('/me');
    ME = j.user; GROUPS = j.groups;
    if (ACC.list[ME.id]) { ACC.list[ME.id].name = ME.name; ACC.list[ME.id].avatar = ME.avatar; saveAcc(); }
    if (!GROUPS.some((g) => g.id === G)) { selectGroup(GROUPS[0]?.id ?? null); return; }
    if (rerender) render();
  } catch {}
}
function selectGroup(id) {
  G = id; if (ME) lsSet('rs_grp_' + ME.id, id);
  loadCache(); render();
  if (G) sync(true);
}
// Schreiben mit optimistischer Anzeige, Rücknahme bei Fehler und Konflikterkennung
async function saveRow(coll, id, data, base, del=false) {
  const k = coll + '|' + id, prev = D.items.get(k);
  D.items.set(k, del ? {...(prev || {coll, id}), deleted:true} : {coll, id, data, rev: prev?.rev || 0, deleted:false, by: ME.id, at: new Date().toISOString()});
  PENDING++; PKEYS.add(k); setSync('syncing'); render();
  try {
    const j = await api('/item', {g:G, coll, id, data, base, del});
    if (j.item) D.items.set(k, j.item); else D.items.delete(k);
    setSync('online'); return j.item;
  } catch (e) {
    if (e.code === 'version_conflict' && e.current) D.items.set(k, e.current);
    else if (prev) D.items.set(k, prev); else D.items.delete(k);
    setSync(e.offline ? 'offline' : 'online');
    throw e;
  } finally { PENDING--; PKEYS.delete(k); saveCache(); render(); }
}
function startPolling() {
  setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 6000);
  const now = () => { if (document.visibilityState === 'visible') sync(); };
  addEventListener('focus', now); addEventListener('online', now); document.addEventListener('visibilitychange', now);
}

// ---- Toasts ----
function toast(msg, type='ok', action) {
  const box = $('#toasts'); if (!box) return;
  const el = document.createElement('div');
  el.className = 'toast toast--' + type; el.setAttribute('role', 'status');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { el.remove(); action.run(); };
  box.appendChild(el); while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), action ? 6000 : 3600);
}

// ---- Bilder im Browser verkleinern (quadratisch zuschneiden, JPEG) ----
function resizeImage(file, size=384) {
  return new Promise((res, rej) => {
    if (!file || !file.type.startsWith('image/')) return rej(new Error('Bitte ein Bild wählen.'));
    const fr = new FileReader(); fr.onerror = rej;
    fr.onload = () => { const img = new Image(); img.onerror = () => rej(new Error('Das Bild konnte nicht gelesen werden.'));
      img.onload = () => { const s = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = size;
        const cx = cv.getContext('2d'); cx.drawImage(img, (img.width-s)/2, (img.height-s)/2, s, s, 0, 0, size, size); res(cv.toDataURL('image/jpeg', .85)); };
      img.src = fr.result; };
    fr.readAsDataURL(file);
  });
}
function pickFile(accept, cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.onchange = () => i.files[0] && cb(i.files[0]); i.click(); }

// ---- Produktkatalog (Einkaufsliste) ----
const CATALOG = CATALOG_RAW.map(([key, label, emoji, category, aliases='']) => ({key, label, emoji, category, aliases: aliases.split(' ').filter(Boolean)}));
const CAT_BY = new Map(CATALOG.map((p) => [p.key, p]));
const CAT_TERMS = CATALOG.flatMap((p) => [p.label, ...p.aliases].map(norm).filter(Boolean).map((term) => ({p, term})));
function detectProduct(text) {
  const t = norm(text); if (!t) return null;
  for (const [re, key] of CATALOG_RULES) if (re.test(t)) return CAT_BY.get(key) ?? null;
  return CAT_TERMS.filter(({term}) => t === term || t.startsWith(term + ' ') || t.endsWith(' ' + term) || t.includes(' ' + term + ' ')).sort((a, b) => b.term.length - a.term.length)[0]?.p ?? null;
}
