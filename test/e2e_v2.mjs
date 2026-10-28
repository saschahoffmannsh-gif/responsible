// E2E 1.1 mit zwei Nutzern: A = Chromium (Mikrofon-Attrappe, Web Push soweit möglich), B = WebKit (iPhone-Größe, Screenshots)
import { createRequire } from 'node:module'; import fs from 'node:fs';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= '/workspace/.pw-browsers';
const require = createRequire('/workspace/francais/lektionen/pw/');
const { chromium, webkit } = require('playwright');
const API = process.env.RS_API || 'http://localhost:8000/responsible';
const APP = process.env.RS_APP || 'http://localhost:8811/';
const CRON = process.env.RS_CRON || 'testcron';
const DEBUG = process.env.RS_DEBUG || 'http://localhost:8814/';
const SHOTS = '/workspace/responsible/shots/';
const SFX = process.env.RS_SFX || '';
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; return c; };
const call = async (p, b, tok, h = {}) => { const r = await fetch(API + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}), ...h }, body: b ? JSON.stringify(b) : undefined }); const j = await r.json().catch(() => ({})); j.status = r.status; return j; };
const dbg = async () => { try { return await (await fetch(DEBUG)).json(); } catch { return null; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const berlin = (d) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d).replace(' ', 'T');
const pad = (n) => String(n).padStart(2, '0'); const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const A = await call('/register', { name: 'Mia' + SFX, pass: 'test-pass-1' }), B = await call('/register', { name: 'Arjen' + SFX, pass: 'test-pass-1' });
ok(A.token && B.token, 'Zwei Testkonten registriert');
const g = (await call('/group', { action: 'create', name: 'Familie Sonnenschein', kind: 'family' }, A.token)).group;
const inv = await call('/group', { action: 'invite', g }, A.token); await call('/join', { token: inv.token }, B.token);
await call('/group', { g, action: 'color', color: '#d9778f' }, A.token); await call('/group', { g, action: 'color', color: '#467ba6' }, B.token);
const seed = (u) => `window.RS_API=${JSON.stringify(API)};if(!localStorage.getItem('rs_acc')){localStorage.setItem('rs_acc',JSON.stringify({cur:${JSON.stringify(u.user.id)},list:{${JSON.stringify(u.user.id)}:{id:${JSON.stringify(u.user.id)},name:${JSON.stringify(u.user.name)},token:${JSON.stringify(u.token)}}}}));localStorage.setItem('rs_grp_${u.user.id}',JSON.stringify(${JSON.stringify(g)}));}`;

const fx = await chromium.launch({ channel: 'chromium', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const wk = await webkit.launch();
const ctxA = await fx.newContext({ viewport: { width: 430, height: 900 }, permissions: ['microphone', 'notifications'], timezoneId: 'Europe/Berlin' });
const ctxB = await wk.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'Europe/Berlin', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
await ctxA.addInitScript(seed(A)); await ctxB.addInitScript(seed(B));
const pa = await ctxA.newPage(), pb = await ctxB.newPage();
const errs = []; for (const [n, p] of [['A', pa], ['B', pb]]) { p.on('pageerror', (e) => errs.push(n + ': ' + e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|NetworkError|Push API in incognito/.test(m.text())) errs.push(n + ' console: ' + m.text()); }); }
const tomorrow = new Date(Date.now() + 864e5);
try {
  await pa.goto(APP + '#/home'); await pb.goto(APP + '?nosw#/home');
  await pa.waitForSelector('.hero'); await pb.waitForSelector('.hero');
  ok(true, 'Beide Nutzer angemeldet');

  // --- A legt Termin mit Anhängen an
  await pa.click('[data-act=nav][data-view=kalender]:visible >> nth=0'); await pa.click('[data-act=new-event]');
  await pa.fill('#ed-title', 'Elternabend Klasse 3b'); await pa.fill('#ed-date', ymd(tomorrow)); await pa.fill('#ed-time', '18:00');
  await pa.waitForSelector(`[data-person="${B.user.id}"]`, { timeout: 20000 }); await pa.click(`[data-person="${B.user.id}"]`); await pa.click(`[data-person="${A.user.id}"]`);
  await pa.click('[data-att=text]'); await pa.fill('#att-text', 'Kann jemand Kuchen mitbringen? 🍰 Ich hab die Liste fotografiert.');
  const [fc] = await Promise.all([pa.waitForEvent('filechooser'), pa.click('[data-att=photo]')]); await fc.setFiles('fixtures/photo.jpg');
  await pa.waitForSelector('.att__imgs img');
  await pa.click('[data-att=bell]'); await pa.waitForSelector('.remp'); await pa.click('[data-pr=h1]'); await pa.click('[data-tg=assignees]'); await pa.click('.remp [data-ok]');
  await pa.waitForSelector('.att__part .sysb');
  ok(await pa.locator('.achip--on').count() === 3, 'Editor: Nachricht, Foto und Erinnerung vorgemerkt');
  await pa.locator('#att').scrollIntoViewIfNeeded(); await pa.locator('.modal').screenshot({ path: SHOTS + 'v2_editor_anhaenge.png' });
  await pa.click('#editor [type=submit]');
  await pa.waitForSelector('.toast >> text=/Anhänge dabei/', { timeout: 15000 }).then(() => ok(true, 'Termin + 3 Anhänge gespeichert'), () => ok(false, 'Toast Anhänge'));
  const ev = (await call(`/sync?g=${g}&since=0`, null, A.token)).items.find((i) => i.coll === 'cal');
  const th = ev?.data.thread; ok(/^th-/.test(th || ''), 'Neuer Termin trägt Verlaufs-ID ' + th);
  const msgs0 = (await call(`/sync?g=${g}&since=0`, null, A.token)).items.filter((i) => i.coll === 'msg');
  const rem0 = msgs0.find((m) => m.data.type === 'reminder');
  ok(msgs0.length === 3 && rem0?.data.at === `${ymd(tomorrow)}T16:00:00.000Z` && rem0.data.target === 'assignees', 'Erinnerung „1 Std vorher“ = 17:00 Ortszeit, für Zuständige: ' + JSON.stringify(rem0?.data));

  // --- B sieht ungelesen-Badge
  await pb.waitForSelector('.lrow .tbadge--new', { timeout: 20000 }).then(() => ok(true, 'B: Ungelesen-Badge auf Home'), () => ok(false, 'B: Badge'));
  const badge = await pb.locator('.lrow .tbadge').first().innerText(); ok(/2/.test(badge), 'Badge zählt 2 Nachrichten (+📎 +🔔): ' + JSON.stringify(badge));
  await pb.screenshot({ path: SHOTS + 'v2_badges_home.png' });
  await pb.click('.lrow__main[data-act=thread]'); await pb.waitForSelector('.modal--th .msg');
  await pb.waitForSelector('.modal--th .ph--ok', { timeout: 10000 }).then(() => ok(true, 'B: Bild-Vorschau über signierten Link geladen'), () => ok(false, 'B: Vorschau'));
  ok(await pb.locator('.modal--th .sysb').count() === 1, 'B: Erinnerungs-Systemzeile im Verlauf');
  ok(/Erinnerung für Arjen, mich|Erinnerung für mich, Mia|Erinnerung für/.test(await pb.locator('.modal--th .sysb').innerText()), 'Systemzeile: ' + (await pb.locator('.modal--th .sysb').innerText()).trim());
  await pb.click('.ph'); await pb.waitForSelector('.viewer img');
  await pb.waitForFunction(() => { const i = document.querySelector('.viewer img'); return i && i.naturalWidth > 1000; }, null, { timeout: 10000 }).then(() => ok(true, 'B: Vollbild lädt 1600px-Version'), () => ok(false, 'B: Vollbild'));
  await sleep(500); await pb.screenshot({ path: SHOTS + 'v2_bildbetrachter.png' });
  await pb.click('.viewer [data-v=close]');
  await pb.click('.modal--th [data-close]'); await sleep(300);
  ok(await pb.locator('.lrow .tbadge--new').count() === 0, 'B: Nach dem Lesen kein Ungelesen-Punkt mehr');

  // --- A: Sprachnachricht
  await pa.click('[data-act=nav][data-view=home]:visible >> nth=0'); await pa.click('.lrow__main[data-act=thread]'); await pa.waitForSelector('.modal--th');
  await pa.click('#th-main[data-th=mic]'); await pa.waitForSelector('.rec .rec__dot'); await sleep(3200);
  await pa.screenshot({ path: SHOTS + 'v2_aufnahme.png' });
  await pa.click('[data-th=rec-send]');
  await pa.waitForSelector('.modal--th .msg--voice:not(.msg--pending)', { timeout: 15000 }).then(() => ok(true, 'A: Sprachnachricht gesendet'), () => ok(false, 'A: Sprachnachricht'));
  const vmsg = (await call(`/sync?g=${g}&since=0`, null, A.token)).items.find((i) => i.coll === 'msg' && i.data.type === 'voice');
  ok(vmsg && vmsg.data.voice.dur >= 2.5 && vmsg.data.voice.peaks.length === 40, `Sprachnachricht: ${vmsg?.data.voice.mime}, ${vmsg?.data.voice.dur}s, ${vmsg?.data.voice.peaks.length} Pegel`);

  // --- B spielt ab und antwortet
  await pb.click('.lrow__main[data-act=thread]'); await pb.waitForSelector('.modal--th .vp', { timeout: 20000 });
  await pb.click('.modal--th .vp__btn');
  const played = await pb.waitForFunction(() => document.querySelectorAll('.modal--th .vp__wave i.on').length > 3, null, { timeout: 8000 }).then(() => true, () => false);
  if (!ok(played, 'B (WebKit): Wiedergabe mit Fortschrittsbalken')) {
    await pa.click('.modal--th .vp__btn');
    ok(await pa.waitForFunction(() => document.querySelectorAll('.modal--th .vp__wave i.on').length > 3, null, { timeout: 8000 }).then(() => true, () => false), 'A (Chromium): Wiedergabe mit Fortschrittsbalken');
  }
  await pb.fill('#th-text', 'Mach ich! Ich backe einen Zitronenkuchen 🍋');
  await pb.click('#th-main[data-th=send]'); await pb.waitForSelector('.modal--th .msg--me:not(.msg--pending) >> text=Zitronenkuchen');
  await pa.waitForSelector('.modal--th >> text=Zitronenkuchen', { timeout: 20000 }).then(() => ok(true, 'A sieht Antwort von B live im offenen Verlauf'), () => ok(false, 'A: Antwort'));
  await sleep(700); await pb.screenshot({ path: SHOTS + 'v2_detail_verlauf.png' });

  // --- B: Erinnerung über Picker (eigene Zeit, nur mich), fällig -> Cron -> Banner
  await pb.click('.cmp__bell'); await pb.waitForSelector('.remp');
  await sleep(300); await pb.screenshot({ path: SHOTS + 'v2_erinnerung_waehlen.png' });
  await pb.click('[data-pr=custom]'); const due = new Date(Date.now() + 60e3 - (Date.now() % 60e3) + 60e3);
  await pb.fill('#rp-at', berlin(due)); await pb.click('[data-tg=me]'); await pb.click('.remp [data-ok]');
  await pb.waitForSelector('.modal--th .sysrow >> text=/Erinnerung für mich ·/');
  ok(true, 'B: eigene Erinnerung gesetzt (' + berlin(due) + ' Berlin)');

  // --- A: echter Web Push (Chromium -> Push-Dienst Service)
  await pa.click('.modal--th [data-close]'); await pa.click('[data-act=nav][data-view=einstellungen]:visible >> nth=0');
  await pa.waitForSelector('#push-card'); await sleep(500);
  let pushOn = false;
  if (await pa.locator('[data-act=push-on]').count()) {
    await pa.click('[data-act=push-on]');
    pushOn = await pa.waitForSelector('.pstate--on', { timeout: 20000 }).then(() => true, () => false);
  }
  ok(true, 'A: Mitteilungen ' + (pushOn ? 'aktiviert (Push-Dienst abonniert)' : 'nicht verfügbar in diesem Test-Browser: ' + (await pa.locator('#push-card').innerText()).replace(/\s+/g, ' ').slice(0, 120)));
  await pa.locator('#push-card').screenshot({ path: SHOTS + 'v2_einstellungen_mitteilungen_chromium.png' });
  { // Service-Worker-Push-Handler direkt prüfen (CDP liefert eine Push-Nachricht wie vom Push-Dienst)
    const cdp = await ctxA.newCDPSession(pa); const regs = []; cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => regs.push(...e.registrations));
    await cdp.send('ServiceWorker.enable'); await sleep(800);
    const reg = regs.find((r) => r.scopeURL.startsWith(APP) && !r.isDeleted);
    if (reg) {
      await cdp.send('ServiceWorker.deliverPushMessage', { origin: new URL(APP).origin, registrationId: reg.registrationId, data: JSON.stringify({ title: '🔔 Elternabend Klasse 3b', body: 'morgen 18:00 · Familie Sonnenschein', url: './#/item/x/th-test123', tag: 'm-test' }) });
      const got = await pa.evaluate(async () => { const r = await navigator.serviceWorker.ready; for (let i = 0; i < 20; i++) { const n = await r.getNotifications(); if (n.length) return n.map((x) => x.title + ' | ' + x.body + ' | ' + x.data?.url); await new Promise((q) => setTimeout(q, 300)); } return []; });
      ok(got.length === 1 && got[0].includes('Elternabend'), 'Service Worker zeigt Push als Mitteilung: ' + JSON.stringify(got));
    } else ok(false, 'Keine SW-Registrierung gefunden');
  }
  if (pushOn) {
    const t = await call('/push', { action: 'test' }, A.token);
    ok(t.sent === 1, 'Server → Push-Dienst: Test-Mitteilung angenommen ' + JSON.stringify(t.statuses));
    const got = await pa.evaluate(async () => { const reg = await navigator.serviceWorker.ready; for (let i = 0; i < 40; i++) { const n = await reg.getNotifications(); if (n.length) return n.map((x) => x.title + ' | ' + x.body); await new Promise((r) => setTimeout(r, 500)); } return []; });
    ok(got.length > 0, 'Service Worker hat die Push-Mitteilung angezeigt: ' + JSON.stringify(got));
  }
  // B (WebKit, iPhone): Einstellungen-Hinweis
  await pb.click('.modal--th [data-close]'); await pb.click('[data-act=nav][data-view=einstellungen]:visible >> nth=0'); await pb.waitForSelector('#push-card'); await sleep(400); ok(/Home-Bildschirm/.test(await pb.locator('#push-card').innerText()), 'iPhone (Safari-Tab): Anleitung „Zum Home-Bildschirm“ statt Aktivieren-Knopf');
  await pb.locator('#push-card').scrollIntoViewIfNeeded(); await pb.screenshot({ path: SHOTS + 'v2_einstellungen_mitteilungen.png' });
  await pb.click('[data-act=nav][data-view=home]:visible >> nth=0');

  // Fälligkeit abwarten, Cron auslösen
  const wait = due.getTime() - Date.now() + 1500; console.log(`… warte ${Math.round(wait / 1000)} s auf Fälligkeit`); await sleep(Math.max(0, wait));
  const cr = await (await fetch(API + '/cron', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rs-cron': CRON }, body: '{"job":"reminders"}' })).json();
  ok(cr.reminders?.due >= 1 || cr.due >= 1 || JSON.stringify(cr).includes('"sent"'), 'Cron hat fällige Erinnerung verarbeitet: ' + JSON.stringify(cr).slice(0, 160));
  await pb.waitForSelector('#remban', { timeout: 30000 }).then(() => ok(true, 'B: In-App-Erinnerungsbanner erscheint'), () => ok(false, 'B: Banner'));
  await sleep(500); await pb.screenshot({ path: SHOTS + 'v2_erinnerung_banner.png' });
  ok(await pa.locator('#remban').count() === 0, 'A bekommt Bs „nur mich“-Erinnerung nicht');
  await pb.click('#remban [data-rb=open]'); await pb.waitForSelector('.modal--th .sysb--sent', { timeout: 15000 }).then(() => ok(true, 'B: Erinnerung im Verlauf als „gesendet ✓“'), () => ok(false, 'gesendet-Markierung'));
  await pb.click('.modal--th [data-close]');

  // --- Pool-To-do mit Verlauf, B übernimmt
  await pa.click('[data-act=nav][data-view=todo]:visible >> nth=0'); await pa.click('[data-act=todo-new][data-kind=task]');
  await pa.fill('#td-title', 'Rasen mähen'); await pa.click('[data-att=text]'); await pa.fill('#att-text', 'Der Mäher steht in der Garage, Schlüssel am Brett.');
  await pa.click('form [type=submit]'); await pa.waitForSelector('.tcard .tbadge', { timeout: 10000 });
  await pb.click('[data-act=nav][data-view=todo]:visible >> nth=0'); await pb.waitForSelector('.tcard .tbadge--new', { timeout: 20000 }).then(() => ok(true, 'B: Badge am offenen Auftrag'), () => ok(false, 'B: Pool-Badge'));
  await pb.screenshot({ path: SHOTS + 'v2_badges_todo.png' });
  await pb.click('.tcard__body[data-act=thread]'); await pb.waitForSelector('.modal--th >> text=Garage');
  await pb.fill('#th-text', 'Übernehme ich am Samstag.'); await pb.click('#th-main[data-th=send]'); await pb.waitForSelector('.modal--th .msg--me:not(.msg--pending)');
  await pb.click('.th-hero [data-th=take]'); await pb.waitForSelector('#tk-date'); await pb.click('.modal-bg:last-child [type=submit]');
  await pb.waitForSelector('.th-kind >> text=Auftrag', { timeout: 10000 }).then(() => ok(true, 'B: Übernommen – Detailansicht wechselt zum Kalender-Auftrag'), () => ok(false, 'Übernehmen'));
  ok(await pb.locator('.modal--th .msg').count() === 2, 'Verlauf (2 Nachrichten) bleibt nach Übernehmen erhalten');
  await pb.click('.modal--th [data-close]');

  // --- Löschen räumt auf
  const before = await dbg();
  await pa.click('[data-act=nav][data-view=home]:visible >> nth=0'); await pa.click('.lrow__main[data-act=thread] >> text=Elternabend'); await pa.waitForSelector('.modal--th');
  await pa.click('.th-bar [data-th=edit]'); await pa.click('#editor [data-del]'); await pa.click('.modal-bg:last-child .modal-foot .btn:last-child');
  await sleep(1500);
  const after = await dbg(); const sy = await call(`/sync?g=${g}&since=0`, null, A.token);
  ok(!sy.items.some((i) => i.coll === 'msg' && i.data.thread === th), 'Löschen entfernt alle Nachrichten des Verlaufs');
  if (after) ok(!after.files.some((f) => f.includes(th)), `Löschen entfernt die Medien (${before?.files.filter((f) => f.includes(th)).length} → ${after.files.filter((f) => f.includes(th)).length} Dateien)`);
  else { const sg = await call('/sign', { g, paths: [msgs0.find((m) => m.data.type === 'image').data.images[0].p] }, A.token); const u = Object.values(sg.urls || {})[0]; ok(!u || !(await fetch(u)).ok, 'Bild nach Löschen nicht mehr abrufbar'); }
  ok(await pa.locator('.modal--th').count() === 0, 'A: Detailansicht schließt nach dem Löschen');
} catch (e) { ok(false, 'Abbruch: ' + e.message.split('\n')[0]); await pa.screenshot({ path: '/tmp/e2e_a.png' }).catch(() => {}); await pb.screenshot({ path: '/tmp/e2e_b.png' }).catch(() => {}); }
finally {
  ok(!errs.length, 'Keine JS-Fehler' + (errs.length ? ': ' + errs.slice(0, 5).join(' || ') : ''));
  for (const u of [A, B]) { const r = await call('/account', { action: 'delete', pass: 'test-pass-1' }, u.token); if (!r.ok) console.log('cleanup', u.user?.name, JSON.stringify(r)); }
  await fx.close(); await wk.close();
  console.log(fails ? `${fails} FEHLER` : 'ALLE OK'); process.exit(fails ? 1 : 0);
}
