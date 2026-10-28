// API-Test 1.1: Verläufe, Anhänge, signierte Links, Erinnerungen, Web Push (Test-Empfänger + Entschlüsselung), Aufräumen
import crypto from 'node:crypto'; import fs from 'node:fs';
const API = process.env.RS_API || 'https://wlujgkbtpjxuekwsgnmg.supabase.co/functions/v1/responsible';
const CRON = process.env.RS_CRON || 'testcron';
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
const call = async (p, b, tok) => { const r = await fetch(API + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); return r.json(); };
const sfx = Date.now().toString(36).slice(-5), PW = 'test-pass-1';
const A = await call('/register', { name: 'ta' + sfx, pass: PW }), B = await call('/register', { name: 'tb' + sfx, pass: PW }), C = await call('/register', { name: 'tc' + sfx, pass: PW });
const ta = A.token, tb = B.token, tc = C.token;
try {
  const g = (await call('/group', { action: 'create', name: 'Testfamilie', kind: 'family' }, ta)).group;
  const inv = await call('/group', { action: 'invite', g }, ta); await call('/join', { token: inv.token }, tb);
  const th = 'th-' + crypto.randomBytes(6).toString('hex');
  const ev = await call('/item', { g, coll: 'cal', id: 'event-1', data: { kind: 'event', title: 'Elternabend', date: '2030-05-10', time: '18:00', people: [B.user.id], eventType: 'private', thread: th } }, ta);
  ok(ev.ok && ev.item.data.thread === th, 'Termin mit Verlauf angelegt');
  const upd = await call('/item', { g, coll: 'cal', id: 'event-1', base: ev.item.rev, data: { ...ev.item.data, thread: 'th-andersxyz' } }, ta);
  ok(upd.item.data.thread === th, 'Verlaufs-ID bleibt beim Bearbeiten erhalten');
  const m1 = await call('/item', { g, coll: 'msg', id: 'm-1' + sfx, data: { thread: th, type: 'text', text: 'Bringst du Kuchen mit?' } }, ta);
  ok(m1.ok && m1.item.data.author === A.user.id, 'Textnachricht von A');
  const sB = await call(`/sync?g=${g}&since=0`, null, tb);
  ok(sB.items.some((i) => i.coll === 'msg' && i.data.text === 'Bringst du Kuchen mit?'), 'B sieht die Nachricht per Sync');
  ok((await call('/item', { g, coll: 'msg', id: 'm-c' + sfx, data: { thread: th, type: 'text', text: 'x' } }, tc)).code === 403, 'Nicht-Mitglied darf nicht schreiben');
  ok((await call('/item', { g, coll: 'msg', id: 'm-1' + sfx, data: { thread: th, type: 'text', text: 'geändert' } }, ta)).code === 400, 'Nachrichten nicht editierbar');
  ok((await call('/item', { g, coll: 'msg', id: 'm-x' + sfx, data: { thread: 'th-gibtsnicht', type: 'text', text: 'x' } }, ta)).code === 400, 'Unbekannter Verlauf abgelehnt');
  // Bild
  const jpg = 'data:image/jpeg;base64,' + fs.readFileSync('fixtures/photo.jpg').toString('base64'), thb = 'data:image/jpeg;base64,' + fs.readFileSync('fixtures/thumb.jpg').toString('base64');
  const up = await call('/media', { g, thread: th, kind: 'image', data: jpg, thumb: thb }, tb);
  ok(up.ok && up.p.startsWith(`g/${g}/t/${th}/`), 'Bild hochgeladen (privater Bucket)');
  ok((await call('/media', { g, thread: th, kind: 'image', data: 'data:image/jpeg;base64,' + Buffer.from('nojpeg-data-here').toString('base64') }, tb)).code === 400, 'Kein JPEG abgelehnt');
  ok((await call('/media', { g, thread: th, kind: 'image', data: jpg }, tc)).code === 403, 'Upload für Nicht-Mitglied gesperrt');
  const mi = await call('/item', { g, coll: 'msg', id: 'm-2' + sfx, data: { thread: th, type: 'image', images: [{ p: up.p, t: up.t, w: 1200, h: 800 }] } }, tb);
  ok(mi.ok, 'Bildnachricht von B');
  ok((await call('/item', { g, coll: 'msg', id: 'm-y' + sfx, data: { thread: th, type: 'image', images: [{ p: 'g/anders/t/x/y.jpg' }] } }, tb)).code === 400, 'Fremder Medienpfad abgelehnt');
  const sg = await call('/sign', { g, paths: [up.p, up.t, 'g/gfremd/t/x/y.jpg'] }, ta);
  ok(Object.keys(sg.urls).length === 2, 'Signierte Links nur für eigene Gruppe');
  const img = await fetch(sg.urls[up.p]); ok(img.ok && (await img.arrayBuffer()).byteLength === fs.statSync('fixtures/photo.jpg').size, 'Bild über signierten Link abrufbar');
  ok((await call('/sign', { g, paths: [up.p] }, tc)).code === 403, 'Signieren für Nicht-Mitglied gesperrt');
  // Sprachnachricht
  const vo = await call('/media', { g, thread: th, kind: 'voice', data: 'data:audio/webm;codecs=opus;base64,' + fs.readFileSync('fixtures/voice.webm').toString('base64') }, ta);
  ok(vo.ok && vo.p.endsWith('.webm'), 'Sprachnachricht hochgeladen');
  const vm = await call('/item', { g, coll: 'msg', id: 'm-3' + sfx, data: { thread: th, type: 'voice', voice: { p: vo.p, dur: 3.02, mime: 'audio/webm', peaks: [10, 50, 90] } } }, ta);
  ok(vm.ok && vm.item.data.voice.dur === 3, 'Sprachnachricht gesendet');
  const vs = await call('/sign', { g, paths: [vo.p] }, tb); const au = await fetch(vs.urls[vo.p]);
  ok(au.ok && /audio\/webm/.test(au.headers.get('content-type')), 'Sprachnachricht abrufbar (audio/webm)');
  // Löschen
  ok((await call('/item', { g, coll: 'msg', id: 'm-3' + sfx, del: true }, tb)).code === 403, 'Fremde Nachricht löschen verboten');
  const dl = await call('/item', { g, coll: 'msg', id: 'm-2' + sfx, del: true }, tb); ok(dl.ok, 'Eigene Bildnachricht gelöscht');
  { const s2 = await call('/sign', { g, paths: [up.p] }, ta); const u = s2.urls && s2.urls[up.p]; ok(!u || (await fetch(u + '&nc=' + Date.now())).status >= 400, 'Bilddatei entfernt (neu signiert: ' + (u ? 'Link' : 'kein Link') + ')'); }
  // Push-Abo auf Test-Empfänger
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys(); const authS = crypto.randomBytes(16);
  const sinkId = crypto.randomBytes(12).toString('hex');
  const sub = { endpoint: `${API}/push-sink/${sinkId}`, keys: { p256dh: ecdh.getPublicKey().toString('base64url'), auth: authS.toString('base64url') } };
  ok((await call('/push', { action: 'subscribe', sub: { ...sub, endpoint: 'https://evil.example.com/x' } }, tb)).code === 400, 'Fremder Push-Endpunkt abgelehnt');
  ok((await call('/push', { action: 'subscribe', sub, ua: 'api-test' }, tb)).ok, 'Push-Abo (Test-Empfänger) für B gespeichert');
  ok((await call('/push/key')).key?.length > 80, 'Öffentlicher VAPID-Schlüssel abrufbar');
  // Erinnerung: „1 Std vorher“ wandert mit der Uhrzeit
  const r1 = await call('/item', { g, coll: 'msg', id: 'm-4' + sfx, data: { thread: th, type: 'reminder', preset: 'h1', target: 'assignees' } }, ta);
  ok(r1.ok && r1.item.data.at === '2030-05-10T15:00:00.000Z', 'Erinnerung 1 Std vorher = 17:00 MESZ');
  const cur = (await call(`/sync?g=${g}&since=0`, null, ta)).items.find((i) => i.coll === 'cal' && i.id === 'event-1');
  await call('/item', { g, coll: 'cal', id: 'event-1', base: cur.rev, data: { ...cur.data, time: '19:30' } }, ta);
  const r1b = (await call(`/sync?g=${g}&since=0`, null, ta)).items.find((i) => i.id === 'm-4' + sfx);
  ok(r1b.data.at === '2030-05-10T16:30:00.000Z', 'Erinnerung folgt geänderter Uhrzeit');
  ok((await call('/item', { g, coll: 'msg', id: 'm-5' + sfx, data: { thread: th, type: 'reminder', preset: 'custom', at: '2020-01-01T10:00:00Z', target: 'me' } }, ta)).code === 400, 'Vergangene Erinnerung abgelehnt');
  // fällige Erinnerung (jetzt) an Zuständige (B)
  const r2 = await call('/item', { g, coll: 'msg', id: 'm-6' + sfx, data: { thread: th, type: 'reminder', preset: 'custom', at: new Date(Date.now() - 30e3).toISOString(), target: 'assignees' } }, ta);
  ok(r2.ok, 'Fällige Erinnerung angelegt');
  const cr = await (await fetch(API + '/cron', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rs-cron': CRON }, body: '{"job":"reminders"}' })).json();
  const mine = (cr.reminders || []).find((x) => x.id === 'm-6' + sfx);
  ok(mine && mine.sent === 1 && mine.statuses[0] === 201, 'Cron hat Erinnerung per Web Push versendet: ' + JSON.stringify(mine));
  ok(!(cr.reminders || []).some((x) => x.id === 'm-4' + sfx), 'Zukünftige Erinnerung nicht versendet');
  const cr2 = await (await fetch(API + '/cron', { method: 'POST', headers: { 'content-type': 'application/json', 'x-rs-cron': CRON }, body: '{"job":"reminders"}' })).json();
  ok(!(cr2.reminders || []).some((x) => x.id === 'm-6' + sfx), 'Keine Doppelzustellung');
  const sk = await call('/push', { action: 'sink', id: sinkId }, tb);
  const e = sk.entries?.[0]; ok(e && e.enc === 'aes128gcm' && e.vapid.startsWith('vapid t='), 'Push kam verschlüsselt mit VAPID an');
  if (e) { // RFC 8291 entschlüsseln
    const buf = Buffer.from(e.body, 'base64'); const salt = buf.subarray(0, 16), idlen = buf[20], asPub = buf.subarray(21, 21 + idlen), ct = buf.subarray(21 + idlen);
    const shared = ecdh.computeSecret(asPub);
    const ikm = Buffer.from(crypto.hkdfSync('sha256', shared, authS, Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPub]), 32));
    const cek = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16)), nonce = Buffer.from(crypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
    const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
    let pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]); pt = pt.subarray(0, pt.lastIndexOf(2));
    const pl = JSON.parse(pt.toString()); ok(pl.title === '🔔 Elternabend' && pl.url.includes(th), 'Push entschlüsselt: ' + pl.title + ' · ' + pl.body);
  }
  const sent = (await call(`/sync?g=${g}&since=0`, null, tb)).items.find((i) => i.id === 'm-6' + sfx);
  ok(sent.data.sent && sent.data.pushed === 1, 'Erinnerung als gesendet markiert');
  // Pool-Eintrag: Verlauf überlebt Übernehmen
  const th2 = 'th-' + crypto.randomBytes(6).toString('hex');
  await call('/item', { g, coll: 'todo', id: 'todo-1', data: { kind: 'task', title: 'Rasen mähen', thread: th2 } }, ta);
  await call('/item', { g, coll: 'msg', id: 'm-7' + sfx, data: { thread: th2, type: 'text', text: 'Mäher steht in der Garage' } }, ta);
  const tk = await call('/take', { g, id: 'todo-1', date: '2030-05-12' }, tb);
  ok(tk.calendarItem?.data.thread === th2, 'Übernommener Eintrag behält den Verlauf');
  ok((await call('/item', { g, coll: 'msg', id: 'm-8' + sfx, data: { thread: th2, type: 'text', text: 'Mach ich!' } }, tb)).ok, 'Verlauf nach Übernehmen weiter beschreibbar');
  // Alter Pool-Eintrag ohne Verlaufs-ID
  await call('/item', { g, coll: 'todo', id: 'todo-2', data: { kind: 'event', title: 'Arzttermin' } }, ta);
  await call('/item', { g, coll: 'msg', id: 'm-9' + sfx, data: { thread: 'todo:todo-2', type: 'text', text: 'alt' } }, ta);
  const tk2 = await call('/take', { g, id: 'todo-2', date: '2030-05-13' }, tb);
  const s3 = await call(`/sync?g=${g}&since=0`, null, tb);
  ok(s3.items.find((i) => i.id === 'm-9' + sfx)?.data.thread === tk2.calendarItem.data.thread, 'Alte Nachrichten wandern beim Übernehmen mit');
  // Löschen mit Aufräumen
  const up2 = await call('/media', { g, thread: th, kind: 'image', data: jpg, thumb: thb }, ta);
  await call('/item', { g, coll: 'msg', id: 'm-10' + sfx, data: { thread: th, type: 'image', images: [{ p: up2.p, t: up2.t, w: 1200, h: 800 }] } }, ta);
  const sg2 = await call('/sign', { g, paths: [up2.p, vo.p] }, ta);
  const pd = await call('/item', { g, coll: 'cal', id: 'event-1', del: true, purge: true }, ta);
  ok(pd.purged && pd.purged.messages >= 4 && pd.purged.files >= 3, 'Termin gelöscht: Verlauf + Medien entfernt ' + JSON.stringify(pd.purged));
  ok((await fetch(sg2.urls[up2.p])).status >= 400 && (await fetch(sg2.urls[vo.p])).status >= 400, 'Mediendateien weg');
  const s4 = await call(`/sync?g=${g}&since=0`, null, ta);
  ok(!s4.items.some((i) => i.coll === 'msg' && i.data.thread === th), 'Keine Nachrichten des gelöschten Termins mehr');
  // Schon erledigt übernommen -> Verlauf weg
  const th3 = 'th-' + crypto.randomBytes(6).toString('hex');
  await call('/item', { g, coll: 'todo', id: 'todo-3', data: { kind: 'task', title: 'Müll', thread: th3 } }, ta);
  await call('/item', { g, coll: 'msg', id: 'm-11' + sfx, data: { thread: th3, type: 'text', text: 'x' } }, ta);
  await call('/take', { g, id: 'todo-3', done: true }, tb);
  ok(!(await call(`/sync?g=${g}&since=0`, null, ta)).items.some((i) => i.coll === 'msg' && i.data.thread === th3), '„Schon erledigt“ räumt Verlauf auf');
  ok((await call('/push', { action: 'unsubscribe', endpoint: sub.endpoint }, tb)).ok, 'Push-Abo entfernt');
  const st = await call('/push', { action: 'status' }, tb); ok(st.count === 0, 'Keine Push-Abos mehr');
} finally {
  for (const [t] of [[ta], [tb], [tc]]) { const x = await call('/account', { action: 'delete', pass: PW }, t); ok(x.ok, 'Testkonto gelöscht'); }
}
console.log(fails ? `${fails} FEHLER` : 'ALLE OK'); process.exit(fails ? 1 : 0);
