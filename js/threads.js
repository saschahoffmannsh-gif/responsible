'use strict';
// Responsible – Verläufe je Termin/Auftrag: Nachrichten, Fotos, Sprachnachrichten, Erinnerungen, Mitteilungen
Object.assign(IP, {
  chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z"/>',
  clip:'<path d="m20.5 11.5-8.3 8.3a5 5 0 0 1-7-7l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9"/>',
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  bell:'<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/>',
  send:'<path d="M4 12 20 4l-4 16-4.5-6.5z"/><path d="M11.5 13.5 20 4"/>',
  image:'<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  play:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>', pause:'<path d="M8 5v14M16 5v14" stroke-width="3.2"/>',
  stop:'<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/>', clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
});

// ---------- Daten ----------
const newThreadId = () => 'th-' + Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
const msgId = () => 'm-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const msgTs = (id) => parseInt(String(id).slice(2, 10), 36) || 0;
const threadOf = (coll, it) => it.thread || `${coll}:${it.id}`;
function threadMsgs(t) {
  return rows('msg').filter((r) => r.data.thread === t).map((r) => ({...r.data, id: r.id, ts: msgTs(r.id), pending: PKEYS.has('msg|' + r.id)})).sort((a, b) => a.ts - b.ts || a.id.localeCompare(b.id));
}
let TIDX = null, TIDX_KEY = '';
function threadIndex() { // pro Render einmal aufbauen
  const key = D.seq + '|' + D.items.size + '|' + PENDING + '|' + (ME?.id || '') + '|' + READ_V;
  if (TIDX && TIDX_KEY === key) return TIDX;
  const idx = new Map(), read = readMap(), now = Date.now();
  for (const r of rows('msg')) {
    const t = r.data.thread; let x = idx.get(t); if (!x) idx.set(t, x = {n:0, img:0, voice:0, rem:0, unread:0});
    const d = r.data, ts = msgTs(r.id);
    if (d.type === 'reminder') { if (!d.sent && Date.parse(d.at) > now) x.rem++; }
    else { x.n++; if (d.type === 'image') x.img++; if (d.type === 'voice') x.voice++; }
    if (d.author !== ME?.id && ts > (read[t] || 0)) x.unread++;
  }
  TIDX = idx; TIDX_KEY = key; return idx;
}
let READ_V = 0;
const readKey = () => `rs_read_${ME?.id}_${G}`;
const readMap = () => lsGet(readKey(), {});
function markRead(t, ts) { const m = readMap(); if ((m[t] || 0) >= ts) return; m[t] = ts; lsSet(readKey(), m); READ_V++; }
function threadBadges(t, compact=false) {
  const x = threadIndex().get(t); if (!x || !(x.n || x.rem)) return '';
  const parts = [];
  if (x.n) parts.push(`<span>${ic('chat')}${x.n}</span>`);
  if (x.img) parts.push(`<span>${ic('clip')}</span>`);
  if (x.voice) parts.push(`<span>${ic('mic')}</span>`);
  if (x.rem) parts.push(`<span>${ic('bell')}</span>`);
  const lbl = [x.n && plural(x.n, 'Nachricht', 'Nachrichten'), x.img && 'mit Fotos', x.voice && 'mit Sprachnachricht', x.rem && plural(x.rem, 'Erinnerung', 'Erinnerungen'), x.unread && plural(x.unread, 'neue', 'neue')].filter(Boolean).join(', ');
  return `<span class="tbadge ${x.unread ? 'tbadge--new' : ''} ${compact ? 'tbadge--c' : ''}" title="${esc(lbl)}" aria-label="${esc(lbl)}">${parts.join('')}${x.unread ? '<i class="udot"></i>' : ''}</span>`;
}
function findByThread(t) {
  for (const coll of ['cal', 'todo']) for (const r of rows(coll)) if (threadOf(coll, {...r.data, id: r.id}) === t) return {coll, item: {...r.data, id: r.id, rev: r.rev}};
  return null;
}
function itemColor(coll, e) {
  if (coll === 'todo') return e.kind === 'task' ? '#2a9d78' : '#2f80c4';
  if (e.kind === 'task') { const c = peopleColors(e); return c.length === 1 ? c[0] : '#2a9d78'; }
  const ty = typeOf(e); if (ty === 'holidays') return '#e0a93b'; if (ty === 'birthday') return '#e46d8c'; if (ty === 'other') return '#7d8fa0';
  const c = peopleColors(e); return c.length === 1 ? c[0] : '#2f80c4';
}

// ---------- Zeiten ----------
const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
function relDay(d) {
  const t = todayS(), s = ymd(d), diff = Math.round((pd(s) - pd(t)) / 864e5);
  return diff === 0 ? 'heute' : diff === 1 ? 'morgen' : diff === -1 ? 'gestern' : new Intl.DateTimeFormat('de-DE', {weekday:'short', day:'2-digit', month:'2-digit'}).format(d);
}
const whenText = (iso) => { const d = new Date(iso); return `${relDay(d)} ${hm(d)}`; };
const PRESETS = [['start', 'Zur Startzeit', 0], ['m10', '10 Min vorher', 10], ['h1', '1 Std vorher', 60], ['d1', '1 Tag vorher', 1440]];
const startOf = (e) => e?.date ? new Date(`${e.date}T${e.time || '08:00'}:00`) : null;
const presetAt = (e, p) => { const s = startOf(e); const x = PRESETS.find((q) => q[0] === p); return s && x ? new Date(s.getTime() - x[2] * 60e3) : null; };
function remWho(m, found) {
  if (m.target === 'me') return m.author === ME.id ? 'mich' : mname(m.author);
  if (m.target === 'assignees' && found?.coll === 'cal' && !isGeneral(found.item)) { const p = found.item.people || []; if (p.length && !p.includes('all')) return p.map((id) => id === ME.id ? 'mich' : mname(id)).join(', '); }
  return 'alle';
}
function remForMe(m, found) {
  if (m.target === 'me') return m.author === ME.id;
  if (m.target === 'assignees' && found?.coll === 'cal' && !isGeneral(found.item)) return forMe(found.item);
  return true;
}

// ---------- Medien (privat, signierte Links) ----------
const MEDIA = new Map(); let signQ = new Set(), signT = null;
function mediaUrl(p) { const x = MEDIA.get(p); if (x && x.exp > Date.now()) return x.url; signQ.add(p); clearTimeout(signT); signT = setTimeout(flushSign, 30); return ''; }
async function flushSign() {
  const paths = [...signQ].filter((p) => !(MEDIA.get(p)?.exp > Date.now())); signQ = new Set(); if (!paths.length || !G) return;
  for (let i = 0; i < paths.length; i += 100) {
    try { const j = await api('/sign', {g: G, paths: paths.slice(i, i + 100)}); const exp = Date.now() + Math.max(60, (j.ttl || 3600) - 300) * 1000;
      for (const [p, url] of Object.entries(j.urls || {})) { MEDIA.set(p, {url, exp}); $$(`[data-mp="${CSS.escape(p)}"]`).forEach((el) => { el.src = url; el.closest('.ph')?.classList.add('ph--ok'); }); } }
    catch {}
  }
}
async function signedUrl(p) { if (MEDIA.get(p)?.exp > Date.now()) return MEDIA.get(p).url; signQ.add(p); await flushSign(); return MEDIA.get(p)?.url; }
const dataUrlOf = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
function loadImg(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), img = new Image();
    img.onload = () => res({img, u}); img.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Das Bild konnte nicht gelesen werden.')); }; img.src = u; });
}
function scaleTo(img, max, q) {
  const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
  return {data: cv.toDataURL('image/jpeg', q), w, h};
}
async function prepImage(file) { // ca. 1600 px fürs Vollbild, 480 px Vorschau
  if (!file.type.startsWith('image/')) throw new Error('Bitte ein Bild wählen.');
  const {img, u} = await loadImg(file);
  try { let full = scaleTo(img, 1600, .82); if (full.data.length > 3.3e6) full = scaleTo(img, 1280, .72); const th = scaleTo(img, 480, .74); return {data: full.data, thumb: th.data, w: full.w, h: full.h, preview: th.data}; }
  finally { URL.revokeObjectURL(u); }
}
async function uploadImages(t, imgs) { const out = []; for (const x of imgs) { const j = await api('/media', {g: G, thread: t, kind: 'image', data: x.data, thumb: x.thumb}); out.push({p: j.p, t: j.t, w: x.w, h: x.h}); MEDIA.set(j.t, {url: x.preview, exp: Date.now() + 864e5}); } return out; }
async function sendImages(t, imgs, text='') { const images = await uploadImages(t, imgs); await saveRow('msg', msgId(), {thread: t, type: 'image', images, ...(text ? {text} : {}), author: ME.id}, 0); }
async function sendVoice(t, v) {
  if (v.blob.size > 3.6e6) throw new Error('Die Sprachnachricht ist zu groß.');
  const j = await api('/media', {g: G, thread: t, kind: 'voice', data: await dataUrlOf(v.blob)});
  MEDIA.set(j.p, {url: URL.createObjectURL(v.blob), exp: Date.now() + 864e5});
  await saveRow('msg', msgId(), {thread: t, type: 'voice', voice: {p: j.p, dur: v.dur, mime: j.mime, peaks: v.peaks}, author: ME.id}, 0);
}
async function sendText(t, text) { await saveRow('msg', msgId(), {thread: t, type: 'text', text, author: ME.id}, 0); }
async function sendReminder(t, r) { await saveRow('msg', msgId(), {thread: t, type: 'reminder', preset: r.preset, target: r.target, at: r.at, author: ME.id}, 0); }

// ---------- Aufnahme ----------
class Recorder {
  static supported() { return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }
  static mime() { for (const m of ['audio/mp4;codecs=mp4a.40.2', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus']) if (MediaRecorder.isTypeSupported?.(m)) return m; return ''; }
  constructor({onTick, onLevel, max = 120} = {}) { Object.assign(this, {onTick, onLevel, max, levels: [], chunks: []}); }
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}});
    const mime = Recorder.mime();
    this.rec = new MediaRecorder(this.stream, mime ? {mimeType: mime, audioBitsPerSecond: 48000} : undefined);
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(250); this.t0 = performance.now();
    try { const AC = window.AudioContext || window.webkitAudioContext; this.ac = new AC(); const src = this.ac.createMediaStreamSource(this.stream); this.an = this.ac.createAnalyser(); this.an.fftSize = 512; src.connect(this.an); this.buf = new Uint8Array(this.an.fftSize); } catch {}
    const loop = () => { if (!this.rec || this.rec.state !== 'recording') return;
      const s = (performance.now() - this.t0) / 1000; let lv = 0;
      if (this.an) { this.an.getByteTimeDomainData(this.buf); let sum = 0; for (const v of this.buf) sum += ((v - 128) / 128) ** 2; lv = Math.min(1, Math.sqrt(sum / this.buf.length) * 3.2); }
      this.levels.push(lv); this.onLevel?.(lv, this.levels); this.onTick?.(s);
      if (s >= this.max) { this.onMax?.(); return; }
      this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  get secs() { return this.t0 ? (performance.now() - this.t0) / 1000 : 0; }
  stop() {
    return new Promise((res) => { const dur = Math.min(this.max, this.secs); cancelAnimationFrame(this.raf);
      if (!this.rec || this.rec.state === 'inactive') return res(null);
      this.rec.onstop = () => { this.cleanup(); const type = (this.rec.mimeType || this.chunks[0]?.type || 'audio/webm');
        const lv = this.levels, n = 40, peaks = Array.from({length: n}, (_, i) => { const a = lv.slice(Math.floor(i * lv.length / n), Math.floor((i + 1) * lv.length / n) || 1); return Math.round(Math.min(1, Math.max(...a, 0.04)) * 99); });
        res({blob: new Blob(this.chunks, {type}), dur: Math.round(dur * 10) / 10, peaks, mime: type}); };
      this.rec.stop(); });
  }
  cancel() { cancelAnimationFrame(this.raf); try { this.rec?.state !== 'inactive' && this.rec?.stop(); } catch {} this.cleanup(); }
  cleanup() { this.stream?.getTracks().forEach((t) => t.stop()); try { this.ac?.close(); } catch {} }
}
const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
function drawWave(cv, levels, color) {
  if (!cv) return; const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const cx = cv.getContext('2d'); cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h); cx.fillStyle = color;
  const bw = 3, gap = 2, n = Math.floor(w / (bw + gap)), sl = levels.slice(-n);
  sl.forEach((v, i) => { const bh = Math.max(3, v * h); const x = w - (sl.length - i) * (bw + gap); cx.beginPath(); cx.roundRect ? cx.roundRect(x, (h - bh) / 2, bw, bh, 1.5) : cx.rect(x, (h - bh) / 2, bw, bh); cx.fill(); });
}
function micError(e) {
  if (e?.name === 'NotAllowedError') return 'Bitte erlaube den Zugriff aufs Mikrofon, um Sprachnachrichten aufzunehmen.';
  if (e?.name === 'NotFoundError') return 'Kein Mikrofon gefunden.';
  return 'Die Aufnahme konnte nicht gestartet werden.';
}

// ---------- Wiedergabe ----------
const PLAYER = {audio: null, p: null, dur: 0};
function voiceHtml(v, color, own) {
  const peaks = v.peaks?.length ? v.peaks : Array.from({length: 40}, (_, i) => 25 + ((i * 37) % 60));
  return `<div class="vp ${own ? 'vp--own' : ''}" data-vp="${esc(v.p)}" data-dur="${v.dur || 0}" style="--c:${color}">
    <button class="vp__btn" data-th="play" data-p="${esc(v.p)}" aria-label="Sprachnachricht abspielen">${ic('play')}</button>
    <span class="vp__wave" data-th="seek" data-p="${esc(v.p)}">${peaks.map((x) => `<i style="height:${Math.max(12, x)}%"></i>`).join('')}</span>
    <span class="vp__t">${mmss(v.dur || 0)}</span></div>`;
}
async function playVoice(p, dur) {
  if (PLAYER.p === p && PLAYER.audio) { PLAYER.audio.paused ? PLAYER.audio.play() : PLAYER.audio.pause(); return; }
  stopVoice();
  const url = await signedUrl(p); if (!url) return toast('Die Sprachnachricht ist nicht verfügbar.', 'err');
  const a = new Audio(); a.preload = 'auto'; a.src = url; PLAYER.audio = a; PLAYER.p = p; PLAYER.dur = dur;
  const upd = () => { const d = isFinite(a.duration) && a.duration > 0 ? a.duration : PLAYER.dur || 1; const pr = Math.min(1, a.currentTime / d);
    $$(`[data-vp="${CSS.escape(p)}"]`).forEach((el) => { el.classList.toggle('vp--on', !a.paused); el.querySelector('.vp__btn').innerHTML = ic(a.paused ? 'play' : 'pause');
      const bars = el.querySelectorAll('.vp__wave i'); bars.forEach((b, i) => b.classList.toggle('on', i / bars.length < pr)); el.querySelector('.vp__t').textContent = mmss(a.paused && !a.currentTime ? PLAYER.dur : a.currentTime); }); };
  a.ontimeupdate = upd; a.onplay = upd; a.onpause = upd; a.onended = () => { a.currentTime = 0; upd(); PLAYER.p = null; PLAYER.audio = null; $$(`[data-vp="${CSS.escape(p)}"] .vp__t`).forEach((x) => x.textContent = mmss(PLAYER.dur || dur)); };
  a.onerror = () => { toast('Diese Sprachnachricht kann auf diesem Gerät nicht abgespielt werden.', 'err'); stopVoice(); };
  try { await a.play(); } catch (e) { if (e.name !== 'AbortError') toast('Wiedergabe nicht möglich.', 'err'); }
}
function stopVoice() { if (PLAYER.audio) { PLAYER.audio.pause(); PLAYER.audio.onended?.(); } PLAYER.audio = null; PLAYER.p = null; }

// ---------- Bildbetrachter ----------
function openViewer(images, i0=0) {
  let i = i0;
  const bg = document.createElement('div'); bg.className = 'viewer'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-label', 'Bild');
  const paint = () => { const x = images[i];
    bg.innerHTML = `<div class="viewer__bar"><span>${images.length > 1 ? `${i + 1} / ${images.length}` : ''}</span><button data-v="close" aria-label="Schließen">${ic('x')}</button></div>
      <div class="viewer__stage"><img alt="" src="${esc(MEDIA.get(x.p)?.url || MEDIA.get(x.t)?.url || '')}" data-mp="${esc(x.p)}"></div>
      ${images.length > 1 ? `<button class="viewer__nav viewer__nav--l" data-v="prev" aria-label="Vorheriges Bild">${ic('left')}</button><button class="viewer__nav viewer__nav--r" data-v="next" aria-label="Nächstes Bild">${ic('right')}</button>` : ''}`;
    if (!(MEDIA.get(x.p)?.exp > Date.now())) mediaUrl(x.p); };
  const close = () => { bg.remove(); document.removeEventListener('keydown', key); };
  const go = (d) => { i = (i + d + images.length) % images.length; paint(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
  bg.addEventListener('click', (e) => { const v = e.target.closest('[data-v]')?.dataset.v; if (v === 'close' || e.target.classList.contains('viewer__stage')) close(); if (v === 'prev') go(-1); if (v === 'next') go(1); });
  let x0 = null; bg.addEventListener('touchstart', (e) => x0 = e.touches[0].clientX, {passive: true});
  bg.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50 && images.length > 1) go(dx < 0 ? 1 : -1); }, {passive: true});
  document.addEventListener('keydown', key);
  paint(); document.body.appendChild(bg);
}

// ---------- Erinnerung wählen ----------
function pickReminder({item, coll, draft} = {}) { // -> Promise<{preset, at, target} | null>
  return new Promise((res) => {
    const hasDate = !!item?.date, canAssignees = coll !== 'todo' && item && !isGeneral(item) && (item.people || []).length && !(item.people || []).includes('all');
    const st = {preset: draft?.preset || (hasDate ? (item.time ? 'h1' : 'start') : 'custom'), target: draft?.target || (canAssignees ? 'assignees' : 'me'), custom: draft?.at ? new Date(draft.at) : null};
    if (!st.custom) { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); st.custom = d; }
    const local = (d) => `${ymd(d)}T${hm(d)}`;
    const m = openModal(`<div class="remp"><div class="remp__ic">${ic('bell')}</div><h2>Erinnerung</h2><p class="desc">${esc(item?.title || '')}</p>
      <div class="lbl">Wann?</div><div class="remp__grid" role="radiogroup"></div>
      <div class="field remp__custom"><label for="rp-at">Datum und Uhrzeit</label><input class="input" id="rp-at" type="datetime-local" value="${local(st.custom)}"></div>
      <div class="lbl" style="margin-top:4px">Für wen?</div>
      <div class="seg" role="radiogroup" style="margin-top:8px">${[['me', 'Nur mich'], ...(canAssignees ? [['assignees', 'Zuständige']] : []), ['all', 'Alle']].map(([k, l]) => `<button type="button" role="radio" data-tg="${k}">${l}</button>`).join('')}</div>
      <div class="remp__prev"></div><div class="field-err" id="rp-err"></div>
      ${pushHint()}
      <div class="modal-foot"><button class="btn btn--ghost" data-close>Abbrechen</button><button class="btn" data-ok>${ic('bell')} Erinnerung setzen</button></div></div>`);
    const c0 = m.close; m.close = () => { c0(); res(null); };
    const at = () => st.preset === 'custom' ? new Date(m.querySelector('#rp-at').value) : presetAt(item, st.preset);
    const paint = () => {
      m.querySelector('.remp__grid').innerHTML = [...(hasDate ? PRESETS : []), ['custom', 'Eigene Zeit']].map(([k, l]) => { const d = k === 'custom' ? null : presetAt(item, k), past = d && d.getTime() < Date.now() - 60e3;
        return `<button type="button" class="rtile" role="radio" aria-checked="${st.preset === k}" data-pr="${k}" ${past ? 'disabled' : ''}><b>${l}</b><small>${k === 'custom' ? 'Datum &amp; Uhrzeit' : past ? 'schon vorbei' : esc(whenText(d.toISOString()))}</small></button>`; }).join('');
      m.querySelector('.remp__custom').classList.toggle('hidden', st.preset !== 'custom');
      $$('[data-tg]', m).forEach((b) => b.setAttribute('aria-selected', b.dataset.tg === st.target));
      const d = at(), who = st.target === 'me' ? 'mich' : st.target === 'all' ? 'alle' : (item.people || []).map((id) => id === ME.id ? 'mich' : mname(id)).join(', ');
      m.querySelector('.remp__prev').innerHTML = d && !isNaN(d) ? `<span class="sysb">${ic('bell')} Erinnerung für ${esc(who)} · ${esc(whenText(d.toISOString()))}</span>` : '';
    };
    if (hasDate && presetAt(item, st.preset)?.getTime() < Date.now()) st.preset = 'custom';
    paint();
    m.addEventListener('click', (e) => { const p = e.target.closest('[data-pr]'); if (p && !p.disabled) { st.preset = p.dataset.pr; paint(); } const tg = e.target.closest('[data-tg]'); if (tg) { st.target = tg.dataset.tg; paint(); }
      if (e.target.closest('[data-push-on]')) enablePush(); });
    m.querySelector('#rp-at').addEventListener('input', paint);
    m.querySelector('[data-ok]').onclick = () => { const d = at(); const er = m.querySelector('#rp-err');
      if (!d || isNaN(d)) { er.textContent = 'Bitte eine Zeit wählen.'; return; }
      if (d.getTime() < Date.now() - 60e3) { er.textContent = 'Dieser Zeitpunkt liegt in der Vergangenheit.'; return; }
      res({preset: st.preset, target: st.target, at: d.toISOString()}); m.close(); };
  });
}

// ---------- Detailansicht mit Verlauf ----------
let TH = null; // offene Detailansicht
function openThread(coll, id) {
  const r = D.items.get(coll + '|' + id); if (!r || r.deleted || !r.data) return toast('Der Eintrag existiert nicht mehr.', 'err');
  closeThread();
  const t = threadOf(coll, {...r.data, id});
  const m = openModal(`<div class="th"><header class="th-hero" id="th-hero"></header><div class="th-tl" id="th-tl" aria-live="polite"></div><div class="th-tray hidden" id="th-tray"></div><div class="th-comp" id="th-comp"></div></div>`, {full: true, sticky: true});
  m.classList.add('modal-bg--th'); m.querySelector('.modal').classList.add('modal--th');
  TH = {t, coll, id, m, sig: '', draftImgs: [], rec: null, sending: 0};
  const origClose = m.close; m.close = () => { TH?.rec?.cancel(); stopVoice(); TH = null; origClose(); render(); };
  m.addEventListener('click', onThreadClick);
  paintComposer(); refreshThread(true);
  setTimeout(() => { const tl = $('#th-tl', m); if (tl) tl.scrollTop = tl.scrollHeight; }, 30);
}
function closeThread() { TH?.m?.close(); }
function refreshThread(force=false) {
  if (!TH || !TH.m.isConnected) { TH = null; return; }
  const f = findByThread(TH.t);
  if (!f) { const m = TH.m; m.close(); toast('Der Eintrag wurde entfernt.', 'info'); return; }
  TH.coll = f.coll; TH.id = f.item.id; TH.item = f.item;
  const msgs = threadMsgs(TH.t);
  const sig = JSON.stringify([f, msgs.map((x) => [x.id, x.pending, x.sent]), D.members.map((x) => [x.id, x.color, x.name, x.avatar]), TH.sending, todayS()]);
  if (!force && sig === TH.sig) return; TH.sig = sig;
  $('#th-hero', TH.m).innerHTML = heroHtml(f.coll, f.item);
  const tl = $('#th-tl', TH.m), nearBottom = tl.scrollHeight - tl.scrollTop - tl.clientHeight < 120;
  tl.innerHTML = timelineHtml(msgs, f);
  if (nearBottom || force) tl.scrollTop = tl.scrollHeight;
  const last = msgs.filter((x) => x.author !== ME.id).at(-1); if (last) { markRead(TH.t, last.ts); }
}
function heroHtml(coll, e) {
  const c = itemColor(coll, e), pool = coll === 'todo', ty = EVENT_TYPES.find((x) => x.id === typeOf(e));
  const kind = pool ? (e.kind === 'task' ? 'Offener Auftrag' : 'Offener Termin') : e.kind === 'task' ? 'Auftrag' : 'Termin · ' + ty.label;
  const when = pool ? 'Noch ohne Datum – kann jemand übernehmen?' : `${fmtLong(e.date).replace(/ \d{4}$/, '')}${multi(e) ? ' – ' + fmt(e.endDate, {weekday:'short', day:'numeric', month:'short'}) : ''}${e.time ? ' · ' + e.time + ' Uhr' : ''}`;
  const ppl = pool ? `<span class="hchip">${avatar(member(e.createdBy) || {name: '?'}, 'av--xs')}Eingetragen von ${esc(mname(e.createdBy))}</span>`
    : isGeneral(e) ? `<span class="hchip">${ic('group')} ${esc(peopleLabel(e))}</span>`
    : (e.people || []).includes('all') ? `<span class="hchip"><span class="dots">${D.members.slice(0, 6).map((x) => `<span class="dot" style="--c:${x.color}"></span>`).join('')}</span>Alle</span>`
    : (e.people || []).map((id) => `<span class="hchip"><span class="dot" style="--c:${mcolor(id)}"></span>${esc(id === ME.id ? mname(id) + ' (du)' : mname(id))}</span>`).join('');
  const act = pool ? `<button class="hbtn hbtn--solid" data-th="take">${ic('check')} Übernehmen</button>`
    : e.kind === 'task' ? `<button class="hbtn ${e.completed ? 'hbtn--solid' : ''}" data-th="toggle">${ic('check')} ${e.completed ? 'Erledigt' + (e.completedBy ? ' · ' + esc(mname(e.completedBy)) : '') : 'Als erledigt markieren'}</button>` : '';
  return `<div class="th-hero__bg" style="--c:${c}"></div>
    <div class="th-bar"><button data-close aria-label="Zurück">${ic('left')}</button><span class="th-kind">${esc(kind)}</span>${pool ? '<span style="width:38px"></span>' : `<button data-th="edit" aria-label="Bearbeiten">${ic('edit')}</button>`}</div>
    <h2 class="th-title ${e.completed ? 'th-title--done' : ''}">${typeOf(e) === 'birthday' ? '🎂 ' : ''}${esc(e.title)}</h2>
    <div class="th-when">${ic(pool ? 'clock' : 'cal')}<span>${esc(when)}</span></div>
    <div class="th-ppl">${ppl}</div>
    ${e.note ? `<p class="th-note">${esc(e.note)}</p>` : ''}
    ${act || !pool ? `<div class="th-acts">${act}${!pool ? `<button class="hbtn" data-th="cal">${ic('cal')} Im Kalender</button>` : ''}</div>` : ''}`;
}
function dayLabel(ts) { const d = new Date(ts), r = relDay(d); return r === 'heute' ? 'Heute' : r === 'gestern' ? 'Gestern' : r === 'morgen' ? 'Morgen' : new Intl.DateTimeFormat('de-DE', {weekday:'long', day:'numeric', month:'long'}).format(d); }
function timelineHtml(msgs, f) {
  if (!msgs.length && !TH.sending) return `<div class="th-empty"><div class="th-empty__ic">${ic('chat')}</div><b>Noch keine Nachrichten</b><span>Schreib etwas dazu, schick ein Foto oder eine Sprachnachricht – oder stell eine Erinnerung.</span>
    <div class="th-empty__q"><button data-th="quick" data-q="Wer kann das übernehmen?">Wer kann das übernehmen?</button><button data-th="quick" data-q="Ich kümmere mich drum 👍">Ich kümmere mich drum 👍</button><button data-th="bell">${ic('bell')} Erinnerung</button></div></div>`;
  let out = '', lastDay = '', prev = null;
  msgs.forEach((x, i) => {
    const day = ymd(new Date(x.ts || Date.now()));
    if (day !== lastDay) { out += `<div class="th-day"><span>${esc(dayLabel(x.ts || Date.now()))}</span></div>`; lastDay = day; prev = null; }
    if (x.type === 'reminder') {
      const own = x.author === ME.id || isAdmin();
      out += `<div class="sysrow"><span class="sysb ${x.sent ? 'sysb--sent' : ''}">${ic('bell')} Erinnerung für ${esc(remWho(x, f))} · ${esc(whenText(x.at))}${x.sent ? ' · gesendet ✓' : ''}${own ? `<button data-th="del" data-id="${x.id}" aria-label="Erinnerung entfernen">${ic('x')}</button>` : ''}</span><small>${esc(x.author === ME.id ? 'von dir' : 'von ' + mname(x.author))}</small></div>`;
      prev = null; return;
    }
    const me = x.author === ME.id, next = msgs[i + 1], c = mcolor(x.author);
    const first = !prev || prev.author !== x.author || prev.type === 'reminder' || x.ts - prev.ts > 10 * 60e3;
    const last = !next || next.author !== x.author || next.type === 'reminder' || next.ts - x.ts > 10 * 60e3 || ymd(new Date(next.ts)) !== day;
    let body = '';
    if (x.type === 'image') {
      const n = x.images.length;
      body = `<div class="mimgs mimgs--${Math.min(n, 4)}">${x.images.slice(0, 4).map((im, k) => `<button class="ph" data-th="img" data-id="${x.id}" data-k="${k}" style="--ar:${im.w}/${im.h}" aria-label="Bild ${k + 1} öffnen"><img alt="" data-mp="${esc(im.t)}" src="${esc(mediaUrl(im.t))}" onload="this.parentNode.classList.add('ph--ok')">${k === 3 && n > 4 ? `<span class="ph__more">+${n - 4}</span>` : ''}</button>`).join('')}</div>${x.text ? `<div class="mtext">${esc(x.text)}</div>` : ''}`;
    } else if (x.type === 'voice') body = voiceHtml(x.voice, me ? readable(c) === '#fff' ? '#fff' : '#24384c' : c, me);
    else body = `<div class="mtext">${linkify(x.text)}</div>`;
    out += `<div class="msg ${me ? 'msg--me' : ''} ${first ? 'msg--first' : ''} ${last ? 'msg--last' : ''} msg--${x.type} ${x.pending ? 'msg--pending' : ''}" style="--c:${c};--fg:${readable(c)}" data-mid="${x.id}">
      ${!me ? `<span class="msg__av">${last ? avatar(member(x.author) || {name: '?'}, 'av--xs') : ''}</span>` : ''}
      <div class="msg__col">${first && !me ? `<span class="msg__name">${esc(mname(x.author))}</span>` : ''}
        <div class="bub" data-th="sel" data-id="${x.id}">${body}</div>
        ${last ? `<span class="msg__time">${x.pending ? 'wird gesendet …' : hm(new Date(x.ts))}</span>` : ''}</div>
      ${me || isAdmin() ? `<button class="msg__del" data-th="del" data-id="${x.id}" aria-label="Nachricht löschen">${ic('trash')}</button>` : ''}</div>`;
    prev = x;
  });
  if (TH.sending) out += `<div class="msg msg--me msg--first msg--last msg--pending"><div class="msg__col"><div class="bub"><div class="mtext"><span class="spin"></span> ${TH.sending === 1 ? 'Wird hochgeladen …' : 'Wird hochgeladen …'}</div></div></div></div>`;
  return out;
}
const linkify = (s) => esc(s).replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
function paintComposer() {
  const box = $('#th-comp', TH.m); if (!box) return;
  if (TH.rec) {
    box.innerHTML = `<div class="rec"><button class="cbtn cbtn--ghost" data-th="rec-cancel" aria-label="Aufnahme verwerfen">${ic('trash')}</button>
      <span class="rec__dot"></span><span class="rec__t" id="rec-t">0:00</span><canvas class="rec__wave" id="rec-wave"></canvas><span class="rec__max">max. 2:00</span>
      <button class="cbtn cbtn--send" data-th="rec-send" aria-label="Sprachnachricht senden">${ic('send')}</button></div>`;
    return;
  }
  box.innerHTML = `<div class="cmp">
    <button class="cbtn cbtn--ghost" data-th="photo" aria-label="Foto senden">${ic('camera')}</button>
    <div class="cmp__field"><textarea id="th-text" rows="1" maxlength="2000" placeholder="Nachricht schreiben …" aria-label="Nachricht"></textarea>
      <button class="cmp__bell" data-th="bell" aria-label="Erinnerung hinzufügen">${ic('bell')}</button></div>
    <button class="cbtn cbtn--send" data-th="mic" id="th-main" aria-label="Sprachnachricht aufnehmen">${ic('mic')}</button></div>`;
  const ta = $('#th-text', box), main = $('#th-main', box);
  const upd = () => { ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; const has = !!ta.value.trim() || TH.draftImgs.length;
    main.dataset.th = has ? 'send' : 'mic'; main.innerHTML = ic(has ? 'send' : 'mic'); main.setAttribute('aria-label', has ? 'Senden' : 'Sprachnachricht aufnehmen'); main.classList.toggle('cbtn--mic', !has); };
  ta.addEventListener('input', upd);
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !matchMedia('(pointer:coarse)').matches) { e.preventDefault(); threadSend(); } });
  upd();
}
function paintTray() {
  const tr = $('#th-tray', TH.m); tr.classList.toggle('hidden', !TH.draftImgs.length);
  tr.innerHTML = TH.draftImgs.map((x, i) => `<span class="tthumb"><img src="${x.preview}" alt=""><button data-th="tray-x" data-k="${i}" aria-label="Bild entfernen">${ic('x')}</button></span>`).join('') + (TH.draftImgs.length < 6 ? `<button class="tthumb tthumb--add" data-th="photo" aria-label="Weiteres Bild">${ic('plus')}</button>` : '');
  $('#th-text', TH.m)?.dispatchEvent(new Event('input'));
}
async function threadSend() {
  const ta = $('#th-text', TH.m); const text = ta?.value.trim() || ''; const t = TH.t;
  if (!text && !TH.draftImgs.length) return;
  const imgs = TH.draftImgs; TH.draftImgs = []; paintTray(); ta.value = ''; ta.dispatchEvent(new Event('input')); ta.focus();
  try {
    if (imgs.length) { TH.sending++; refreshThread(true); try { await sendImages(t, imgs, text); } finally { if (TH) { TH.sending--; refreshThread(true); } } }
    else await sendText(t, text);
  } catch (e) { toast('Nicht gesendet: ' + e.message, 'err'); if (TH && ta && !ta.value) { ta.value = text; ta.dispatchEvent(new Event('input')); } }
}
async function onThreadClick(e) {
  const el = e.target.closest('[data-th]'); if (!el || !TH) return;
  const a = el.dataset.th, t = TH.t;
  if (a === 'edit') { const id = TH.id; openEditor({item: id}); return; }
  if (a === 'cal') { const it = TH.item; TH.m.close(); UI.sel = it.date; UI.tab = 'main'; const d = pd(it.date); UI.month = new Date(d.getFullYear(), d.getMonth(), 1, 12); go('kalender'); return; }
  if (a === 'toggle') return toggleTask(TH.id);
  if (a === 'take') return openTake(TH.id);
  if (a === 'quick') { const ta = $('#th-text', TH.m); ta.value = el.dataset.q; ta.dispatchEvent(new Event('input')); ta.focus(); return; }
  if (a === 'send') return threadSend();
  if (a === 'photo') return pickImages((files) => addDraftImages(files));
  if (a === 'tray-x') { TH.draftImgs.splice(+el.dataset.k, 1); paintTray(); return; }
  if (a === 'img') { const x = threadMsgs(t).find((m) => m.id === el.dataset.id); if (x) openViewer(x.images, +el.dataset.k); return; }
  if (a === 'play' || a === 'seek') { const v = el.closest('.vp'); playVoice(el.dataset.p, +v.dataset.dur);
    if (a === 'seek' && PLAYER.audio && PLAYER.p === el.dataset.p) { const r = el.getBoundingClientRect(); const d = isFinite(PLAYER.audio.duration) ? PLAYER.audio.duration : PLAYER.dur; PLAYER.audio.currentTime = Math.max(0, Math.min(d, (e.clientX - r.left) / r.width * d)); }
    return; }
  if (a === 'sel') { const row = el.closest('.msg'); if (e.target.closest('a,button.ph,.vp')) return; const on = !row.classList.contains('msg--sel'); $$('.msg--sel', TH.m).forEach((x) => x.classList.remove('msg--sel')); row.classList.toggle('msg--sel', on); return; }
  if (a === 'del') { const id = el.dataset.id, x = threadMsgs(t).find((m) => m.id === id); if (!x) return;
    if (!(await confirmDlg(x.type === 'reminder' ? 'Erinnerung entfernen?' : 'Nachricht löschen?', x.type === 'reminder' ? 'Die Erinnerung wird für alle entfernt.' : 'Die Nachricht und ihre Anhänge werden für alle gelöscht.', x.type === 'reminder' ? 'Entfernen' : 'Löschen'))) return;
    try { await saveRow('msg', id, null, undefined, true); } catch (er) { toast(er.message, 'err'); } return; }
  if (a === 'bell') { const r = await pickReminder({item: TH.item, coll: TH.coll}); if (!r || !TH) return; try { await sendReminder(t, r); toast('Erinnerung gesetzt.'); } catch (er) { toast(er.message, 'err'); } return; }
  if (a === 'mic') return startThreadRec();
  if (a === 'rec-cancel') { TH.rec?.cancel(); TH.rec = null; paintComposer(); return; }
  if (a === 'rec-send') return finishThreadRec();
}
function pickImages(cb) { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.onchange = () => i.files.length && cb([...i.files]); i.click(); }
async function addDraftImages(files) {
  for (const f of files.slice(0, 6 - TH.draftImgs.length)) { try { TH.draftImgs.push(await prepImage(f)); } catch (e) { toast(e.message, 'err'); } }
  paintTray(); $('#th-text', TH.m)?.focus();
}
async function startThreadRec() {
  if (!Recorder.supported()) return toast('Sprachaufnahmen werden von diesem Browser nicht unterstützt.', 'err');
  const rec = new Recorder({}); TH.rec = rec; paintComposer();
  const c = mcolor(ME.id);
  rec.onTick = (s) => { const el = $('#rec-t'); if (el) el.textContent = mmss(s); };
  rec.onLevel = (_, lv) => drawWave($('#rec-wave'), lv, c);
  rec.onMax = () => { toast('Maximal 2 Minuten – die Aufnahme wird gesendet.', 'info'); finishThreadRec(); };
  try { await rec.start(); } catch (e) { TH.rec = null; paintComposer(); toast(micError(e), 'err'); }
}
async function finishThreadRec() {
  const rec = TH?.rec; if (!rec) return; TH.rec = null; paintComposer();
  const v = await rec.stop(); if (!v || v.dur < 0.6) return toast('Zu kurz – halte die Aufnahme etwas länger.', 'info');
  const t = TH.t; TH.sending++; refreshThread(true);
  try { await sendVoice(t, v); } catch (e) { toast('Sprachnachricht nicht gesendet: ' + e.message, 'err'); } finally { if (TH) { TH.sending--; refreshThread(true); } }
}

// ---------- Anhänge beim Anlegen ----------
function attachStrip() {
  return `<section class="att" id="att"><div class="att__h">${ic('clip')}<b>Gleich mitschicken</b><span>optional</span></div>
    <div class="att__chips"><button type="button" class="achip" data-att="text">${ic('chat')}<span>Nachricht</span></button><button type="button" class="achip" data-att="photo">${ic('camera')}<span>Foto</span></button><button type="button" class="achip" data-att="voice">${ic('mic')}<span>Sprachnachricht</span></button><button type="button" class="achip" data-att="bell">${ic('bell')}<span>Erinnerung</span></button></div>
    <div class="att__body" id="att-body"></div></section>`;
}
function wireAttach(m, getDraftItem) {
  const A = {text: null, imgs: [], voice: null, rem: null, rec: null};
  const box = m.querySelector('#att'); if (!box) return A;
  const paint = () => {
    const b = m.querySelector('#att-body'), ta = m.querySelector('#att-text');
    if (A.text != null && ta) A.text = ta.value;
    $$('.achip', box).forEach((x) => x.classList.toggle('achip--on', !!({text: A.text != null, photo: A.imgs.length, voice: A.voice || A.rec, bell: A.rem})[x.dataset.att]));
    b.innerHTML = [
      A.text != null ? `<div class="att__part"><textarea class="input" id="att-text" rows="2" maxlength="2000" placeholder="Erste Nachricht an alle, die den Eintrag sehen …">${esc(A.text)}</textarea><button type="button" class="att__x" data-attx="text" aria-label="Nachricht entfernen">${ic('x')}</button></div>` : '',
      A.imgs.length ? `<div class="att__part att__imgs">${A.imgs.map((x, i) => `<span class="tthumb"><img src="${x.preview}" alt=""><button type="button" data-attx="img" data-k="${i}" aria-label="Bild entfernen">${ic('x')}</button></span>`).join('')}${A.imgs.length < 6 ? `<button type="button" class="tthumb tthumb--add" data-att="photo" aria-label="Weiteres Bild">${ic('plus')}</button>` : ''}</div>` : '',
      A.rec ? `<div class="att__part rec rec--inline"><button type="button" class="cbtn cbtn--ghost" data-attx="rec" aria-label="Aufnahme verwerfen">${ic('trash')}</button><span class="rec__dot"></span><span class="rec__t" id="att-rt">0:00</span><canvas class="rec__wave" id="att-wave"></canvas><button type="button" class="cbtn cbtn--send" data-att="rec-stop" aria-label="Aufnahme beenden">${ic('stop')}</button></div>`
        : A.voice ? `<div class="att__part">${voiceHtml({p: 'draft', dur: A.voice.dur, peaks: A.voice.peaks}, mcolor(ME.id), false)}<button type="button" class="att__x" data-attx="voice" aria-label="Sprachnachricht entfernen">${ic('x')}</button></div>` : '',
      A.rem ? `<div class="att__part"><span class="sysb">${ic('bell')} ${esc(PRESETS.find((p) => p[0] === A.rem.preset)?.[1] || 'Eigene Zeit')} · ${esc(A.rem.target === 'me' ? 'nur ich' : A.rem.target === 'all' ? 'alle' : 'Zuständige')}</span><button type="button" class="att__x" data-attx="bell" aria-label="Erinnerung entfernen">${ic('x')}</button></div>` : '',
    ].join('');
  };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-att],[data-attx]'); if (!b) return; e.preventDefault();
    const a = b.dataset.att, x = b.dataset.attx;
    if (a === 'text') { if (A.text == null) A.text = ''; paint(); m.querySelector('#att-text')?.focus(); }
    if (a === 'photo') pickImages(async (files) => { for (const f of files.slice(0, 6 - A.imgs.length)) { try { A.imgs.push(await prepImage(f)); } catch (er) { toast(er.message, 'err'); } } paint(); });
    if (a === 'voice') {
      if (A.rec || A.voice) return;
      if (!Recorder.supported()) return toast('Sprachaufnahmen werden von diesem Browser nicht unterstützt.', 'err');
      A.rec = new Recorder({}); paint();
      A.rec.onTick = (s) => { const el = m.querySelector('#att-rt'); if (el) el.textContent = mmss(s); };
      A.rec.onLevel = (_, lv) => drawWave(m.querySelector('#att-wave'), lv, mcolor(ME.id));
      A.rec.onMax = () => box.querySelector('[data-att="rec-stop"]')?.click();
      try { await A.rec.start(); } catch (er) { A.rec = null; paint(); toast(micError(er), 'err'); }
    }
    if (a === 'rec-stop') { const r = A.rec; A.rec = null; const v = await r.stop(); if (v && v.dur >= 0.6) { A.voice = v; MEDIA.set('draft', {url: URL.createObjectURL(v.blob), exp: Date.now() + 864e5}); } else toast('Zu kurz – bitte nochmal aufnehmen.', 'info'); paint(); }
    if (a === 'bell') { const d = getDraftItem(); const r = await pickReminder({...d, draft: A.rem}); if (r) { A.rem = r; paint(); } }
    if (x === 'text') { A.text = null; paint(); }
    if (x === 'img') { A.imgs.splice(+b.dataset.k, 1); paint(); }
    if (x === 'rec') { A.rec?.cancel(); A.rec = null; paint(); }
    if (x === 'voice') { A.voice = null; stopVoice(); paint(); }
    if (x === 'bell') { A.rem = null; paint(); }
  });
  box.addEventListener('click', (e) => { const p = e.target.closest('[data-th="play"],[data-th="seek"]'); if (p) { e.stopPropagation(); playVoice('draft', A.voice?.dur || 0); } }, true);
  A.read = () => { const ta = m.querySelector('#att-text'); if (ta) A.text = ta.value; A.rec?.cancel(); A.rec = null; return A; };
  A.empty = () => !(A.text?.trim() || A.imgs.length || A.voice || A.rem);
  paint();
  return A;
}
async function sendAttachments(t, A, item) {
  if (!A || A.empty()) return 0;
  let n = 0; const errs = [];
  const step = async (f) => { try { await f(); n++; } catch (e) { errs.push(e.message); } };
  if (A.text?.trim()) await step(() => sendText(t, A.text.trim()));
  if (A.imgs.length) await step(() => sendImages(t, A.imgs));
  if (A.voice) await step(() => sendVoice(t, A.voice));
  if (A.rem) { let r = A.rem; if (r.preset !== 'custom') { const d = presetAt(item, r.preset); if (d) r = {...r, at: d.toISOString()}; } await step(() => sendReminder(t, r)); }
  if (errs.length) toast('Nicht alles gesendet: ' + errs[0], 'err');
  return n;
}

// ---------- Erinnerungen in der App (Fallback ohne Push) ----------
let REM_SHOWN = null;
function checkDueReminders() {
  if (!ME || !G || !D.items.size) return;
  const seen = lsGet('rs_remseen_' + ME.id, {}), now = Date.now();
  const due = rows('msg').filter((r) => r.data.type === 'reminder' && !seen[r.id] && Date.parse(r.data.at) <= now && Date.parse(r.data.at) > now - 36 * 3600e3)
    .map((r) => ({...r.data, id: r.id, f: findByThread(r.data.thread)})).filter((x) => x.f && remForMe(x, x.f)).sort((a, b) => a.at.localeCompare(b.at));
  const x = due[0]; const host = $('#remban');
  if (!x) { host?.remove(); REM_SHOWN = null; return; }
  if (REM_SHOWN === x.id && host) return; REM_SHOWN = x.id;
  const el = host || Object.assign(document.createElement('div'), {id: 'remban', className: 'remban'}); el.setAttribute('role', 'alert');
  const e = x.f.item, c = itemColor(x.f.coll, e);
  el.innerHTML = `<span class="remban__ic" style="--c:${c}">${ic('bell')}</span><div class="grow"><small>Erinnerung · ${esc(whenText(x.at))}</small><b>${esc(e.title)}</b></div><button class="btn btn--sm" data-rb="open">Öffnen</button><button class="remban__x" data-rb="ok" aria-label="Erinnerung schließen">${ic('x')}</button>`;
  el.onclick = (ev) => { const a = ev.target.closest('[data-rb]')?.dataset.rb; if (!a) return; const s = lsGet('rs_remseen_' + ME.id, {}); s[x.id] = 1;
    for (const k of Object.keys(s)) if (!D.items.has('msg|' + k)) delete s[k]; s[x.id] = 1; lsSet('rs_remseen_' + ME.id, s); el.remove(); REM_SHOWN = null;
    if (a === 'open') openThread(x.f.coll, e.id); setTimeout(checkDueReminders, 300); };
  if (!host) document.body.appendChild(el);
}
setInterval(checkDueReminders, 20000);

// ---------- Web Push ----------
const PUSH = {state: 'unknown', busy: false};
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const b64uToBytes = (s) => { const b = atob((s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function refreshPush(rerender=true) {
  let st;
  if (isIOS() && !isStandalone()) st = 'ios-install';
  else if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) st = 'unsupported';
  else if (Notification.permission === 'denied') st = 'denied';
  else { try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); st = sub && Notification.permission === 'granted' && lsGet('rs_push_' + ME?.id, null) === sub.endpoint ? 'on' : 'off'; } catch { st = 'off'; } }
  if (st !== PUSH.state) { PUSH.state = st; if (rerender && UI.view === 'einstellungen') render(); }
  return st;
}
async function enablePush() {
  if (PUSH.busy) return; PUSH.busy = true;
  try {
    if (!('Notification' in window) || !('PushManager' in window)) { toast(isIOS() ? 'Auf dem iPhone zuerst „Zum Home-Bildschirm“ hinzufügen und Responsible von dort öffnen.' : 'Dieser Browser unterstützt keine Mitteilungen.', 'err'); return; }
    const perm = await Notification.requestPermission(); // direkt aus der Nutzeraktion
    if (perm !== 'granted') { toast('Mitteilungen wurden nicht erlaubt.', 'err'); return; }
    const reg = await navigator.serviceWorker.ready;
    const {key} = await api('/push/key', null, {noauth: true}); if (!key) throw new Error('Mitteilungen sind auf dem Server noch nicht eingerichtet.');
    let sub = await reg.pushManager.getSubscription();
    if (sub && sub.options?.applicationServerKey) { const k = new Uint8Array(sub.options.applicationServerKey); const want = b64uToBytes(key); if (k.length !== want.length || k.some((v, i) => v !== want[i])) { await sub.unsubscribe(); sub = null; } }
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64uToBytes(key)});
    await api('/push', {action: 'subscribe', sub: sub.toJSON(), ua: deviceName()});
    lsSet('rs_push_' + ME.id, sub.endpoint); toast('Mitteilungen sind auf diesem Gerät aktiv.');
  } catch (e) { toast('Mitteilungen konnten nicht aktiviert werden: ' + e.message, 'err'); }
  finally { PUSH.busy = false; await refreshPush(); render(); }
}
async function disablePush() {
  try { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (sub) { await api('/push', {action: 'unsubscribe', endpoint: sub.endpoint}).catch(() => {}); await sub.unsubscribe(); } } catch {}
  localStorage.removeItem('rs_push_' + ME.id); await refreshPush(); render(); toast('Mitteilungen auf diesem Gerät ausgeschaltet.');
}
async function testPush() { try { const j = await api('/push', {action: 'test'}); toast(j.sent ? 'Test-Mitteilung gesendet.' : 'Kein aktives Gerät gefunden – bitte Mitteilungen neu aktivieren.', j.sent ? 'ok' : 'err'); } catch (e) { toast(e.message, 'err'); } }
async function unbindPushOnLogout() { try { const reg = await navigator.serviceWorker?.getRegistration(); const sub = await reg?.pushManager?.getSubscription(); if (sub) { await api('/push', {action: 'unsubscribe', endpoint: sub.endpoint}); await sub.unsubscribe(); } } catch {} }
const deviceName = () => { const u = navigator.userAgent; return (/iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Gerät') + ' · ' + (/Edg\//.test(u) ? 'Edge' : /Firefox/.test(u) ? 'Firefox' : /Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : 'Browser'); };
function pushHint() {
  if (PUSH.state === 'on') return '';
  if (PUSH.state === 'ios-install') return `<p class="hint">${ic('bell')}<span>Damit Erinnerungen auch bei geschlossener App ankommen: In Safari <b>Teilen → „Zum Home-Bildschirm“</b>, Responsible von dort öffnen und in den Einstellungen Mitteilungen aktivieren.</span></p>`;
  if (PUSH.state === 'off') return `<p class="hint">${ic('bell')}<span>Mitteilungen sind auf diesem Gerät aus – die Erinnerung erscheint dann nur in der App. <button class="link" type="button" data-push-on>Jetzt aktivieren</button></span></p>`;
  return '';
}
function pushSection() {
  const s = PUSH.state;
  const body = s === 'on' ? `<div class="pstate pstate--on">${ic('check')}<span><b>Aktiv auf diesem Gerät</b><small>Erinnerungen kommen als Mitteilung – auch wenn Responsible geschlossen ist.</small></span></div>
      <div class="row wrap" style="margin-top:12px"><button class="btn btn--soft btn--sm" data-act="push-test">${ic('bell')} Test senden</button><button class="btn btn--ghost btn--sm" data-act="push-off">Ausschalten</button></div>`
    : s === 'ios-install' ? `<div class="pstate">${ic('bell')}<span><b>Auf dem iPhone/iPad: erst installieren</b><small>Apple erlaubt Mitteilungen nur für Web-Apps auf dem Home-Bildschirm (ab iOS 16.4).</small></span></div>
      <ol class="steps"><li>In Safari unten auf <b>Teilen</b> tippen</li><li><b>„Zum Home-Bildschirm“</b> wählen</li><li>Responsible über das neue Symbol öffnen</li><li>Hier auf <b>„Mitteilungen aktivieren“</b> tippen und erlauben</li></ol>`
    : s === 'denied' ? `<div class="pstate pstate--warn">${ic('bell')}<span><b>Mitteilungen sind blockiert</b><small>Erlaube sie in den Einstellungen deines Browsers bzw. unter iOS: Einstellungen → Mitteilungen → Responsible.</small></span></div>`
    : s === 'unsupported' ? `<div class="pstate">${ic('bell')}<span><b>Nicht verfügbar in diesem Browser</b><small>Erinnerungen erscheinen dann als Hinweis, sobald du Responsible öffnest.</small></span></div>`
    : `<div class="pstate">${ic('bell')}<span><b>Erinnerungen als Mitteilung</b><small>Bekomme Erinnerungen zu Terminen und Aufträgen aufs Gerät – auch wenn die App geschlossen ist.</small></span></div>
      <button class="btn btn--sm" style="margin-top:12px" data-act="push-on" ${PUSH.busy ? 'disabled' : ''}>${ic('bell')} Mitteilungen aktivieren</button>${isIOS() ? `<p class="small muted" style="margin:8px 0 0">iPhone/iPad: funktioniert ab iOS 16.4, wenn Responsible zum Home-Bildschirm hinzugefügt wurde.</p>` : ''}`;
  return `<section class="card pad" style="margin-top:14px" id="push-card"><h2 style="font-size:17px;margin-bottom:10px">Mitteilungen</h2>${body}</section>`;
}
// Klick auf Mitteilung bei offener App
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'open' && e.data.url) { const h = new URL(e.data.url).hash; if (h) { location.hash = h; } } });
function openThreadRoute(g, t) {
  const tryOpen = () => { const f = findByThread(t); if (f) { openThread(f.coll, f.item.id); return true; } return false; };
  history.replaceState(null, '', location.pathname + '#/home'); UI.view = 'home'; render();
  if (!ME) return;
  if (g && g !== G && GROUPS.some((x) => x.id === g)) selectGroup(g);
  if (!tryOpen()) sync(true).then(() => { if (!tryOpen()) toast('Der Eintrag existiert nicht mehr.', 'info'); });
}
