'use strict';
// Responsible – Aktionen, Dialoge, Start
// ---------- Dialoge ----------
function openModal(html, {full=false, sticky=false} = {}) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${full ? 'modal--full' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', (e) => { if (e.target === bg && !sticky) close(); if (e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  $('#modals').appendChild(bg); bg.close = close;
  setTimeout(() => bg.querySelector('[autofocus]')?.focus(), 60);
  return bg;
}
function confirmDlg(title, text, okLabel='Löschen', danger=true) {
  return new Promise((res) => {
    const m = openModal(`<h2>${esc(title)}</h2><p class="desc">${esc(text)}</p><div class="modal-foot"><button class="btn btn--ghost" data-close>Abbrechen</button><button class="btn ${danger ? 'btn--danger' : ''}" data-ok>${esc(okLabel)}</button></div>`);
    m.querySelector('[data-ok]').onclick = () => { m.close(); res(true); };
    m.querySelector('[data-close]').addEventListener('click', () => res(false));
  });
}
function promptDlg(title, fields, okLabel='Speichern', desc='') {
  return new Promise((res) => {
    const m = openModal(`<form><h2>${esc(title)}</h2>${desc ? `<p class="desc">${esc(desc)}</p>` : ''}${fields.map((f, i) => `<div class="field"><label for="pd-${i}">${esc(f.label)}</label><input class="input" id="pd-${i}" name="${f.name}" type="${f.type || 'text'}" value="${esc(f.value || '')}" placeholder="${esc(f.ph || '')}" ${i === 0 ? 'autofocus' : ''}></div>`).join('')}
      <div class="field-err" data-err></div><div class="modal-foot"><button type="button" class="btn btn--ghost" data-close>Abbrechen</button><button class="btn" type="submit">${esc(okLabel)}</button></div></form>`);
    m.querySelector('[data-close]').addEventListener('click', () => res(null));
    m.querySelector('form').onsubmit = (e) => { e.preventDefault(); res({values: Object.fromEntries(new FormData(e.target)), modal: m}); };
  });
}

// ---------- Editor: Termin / Auftrag ----------
function openEditor({kind, date, item}) {
  const it = item ? calItems().find((x) => x.id === item) : null;
  if (item && !it) return toast('Der Eintrag existiert nicht mehr.', 'err');
  kind = it?.kind || kind;
  const st = {type: it?.eventType || 'private', people: new Set(it?.people?.length ? it.people : kind === 'task' ? [ME.id] : ['all'])};
  const edit = !!it;
  const m = openModal(`<form id="editor" novalidate>
    <div class="modal-head"><button type="button" data-close>${ic('left')} Zurück</button><span>${edit ? 'Bearbeiten' : kind === 'event' ? 'Termin erstellen' : 'Auftrag erstellen'}</span><span style="width:60px"></span></div>
    <h2 id="ed-h"></h2><p class="desc" id="ed-d"></p>
    <div class="card pad" style="box-shadow:none">
      <span class="badge ${kind === 'task' ? 'badge--task' : ''}" style="margin-bottom:12px">${ic(kind === 'task' ? 'task' : 'cal')} ${kind === 'task' ? 'Auftrag' : 'Termin'}</span>
      ${kind === 'event' ? `<fieldset><legend>Art des Termins</legend><div class="tiles" role="radiogroup" aria-label="Art des Termins">${EVENT_TYPES.map((t) => `<button type="button" class="tile" role="radio" aria-checked="${st.type === t.id}" data-type="${t.id}"><span class="dot" style="${t.c === 'rainbow' ? 'background:conic-gradient(#e46d8c,#e0a93b,#36a78a,#3a86c8,#8a6fd1,#e46d8c)' : '--c:' + t.c}"></span><strong>${t.label}</strong><span class="tick">${ic('check')}</span></button>`).join('')}</div></fieldset>` : ''}
      <div class="field"><label for="ed-title">Titel</label><input class="input" id="ed-title" name="title" maxlength="120" required value="${esc(it?.title || '')}" placeholder="${kind === 'event' ? 'z. B. Zahnarzt' : 'z. B. Einkauf erledigen'}"></div>
      <div class="two"><div class="field"><label for="ed-date">Von</label><input class="input" id="ed-date" name="date" type="date" required value="${it?.date || date || todayS()}"></div>
        <div class="field"><label for="ed-end">Bis <span>optional</span></label><input class="input" id="ed-end" name="endDate" type="date" value="${it?.endDate || ''}" min="${it?.date || date || todayS()}"></div></div>
      <div class="field"><label for="ed-time">Uhrzeit <span>optional</span></label><input class="input" id="ed-time" name="time" type="time" value="${it?.time || ''}"></div>
      <div class="field"><label for="ed-note">Notiz <span>optional</span></label><textarea class="input" id="ed-note" name="note" rows="2" maxlength="1000" placeholder="Was sollten die anderen wissen?">${esc(it?.note || '')}</textarea></div>
    </div>
    <div id="ed-people" style="margin-top:14px"></div>
    ${kind === 'task' && edit ? `<label class="check" style="margin-top:14px"><input type="checkbox" name="completed" ${it.completed ? 'checked' : ''}><span>Auftrag ist erledigt</span></label>` : ''}
    <div class="field-err" id="ed-err"></div>
    <div class="modal-foot">${edit ? `<button type="button" class="btn btn--dangerghost" data-del>${ic('trash')} Löschen</button>` : ''}<button class="btn ${kind === 'task' ? 'btn--green' : ''}" type="submit">${edit ? 'Änderungen speichern' : kind === 'event' ? 'Termin speichern' : 'Auftrag speichern'}</button></div></form>`, {full:true, sticky:true});
  const f = m.querySelector('form');
  const paint = () => {
    const general = kind === 'event' && GENERAL.has(st.type);
    m.querySelector('#ed-h').textContent = kind === 'event' ? (st.type === 'holidays' ? 'Fester Termin' : st.type === 'birthday' ? 'Geburtstag' : st.type === 'other' ? 'Allgemeiner Termin' : 'Für wen ist der Termin?') : 'Wer ist zuständig?';
    m.querySelector('#ed-d').textContent = general ? 'Für alle sichtbar und niemandem zugeordnet.' : 'Wähle ein oder mehrere Mitglieder – oder Alle.';
    $$('.tile[data-type]', m).forEach((b) => b.setAttribute('aria-checked', b.dataset.type === st.type));
    m.querySelector('#ed-people').innerHTML = general ? '' : `<div class="lbl" style="margin-bottom:8px">${kind === 'event' ? 'Betroffene Personen' : 'Zuständige Personen'}</div>
      <div class="people" role="group">${[{id:'all', name:'Alle'}, ...D.members].map((p) => `<button type="button" class="tile" aria-pressed="${st.people.has(p.id)}" aria-checked="${st.people.has(p.id)}" data-person="${p.id}">
        ${p.id === 'all' ? `<span class="av av--lg" style="--c:#2f80c4;background:conic-gradient(${D.members.map((x) => x.color).join(',') || '#2f80c4'},${D.members[0]?.color || '#2f80c4'})">${ic('group')}</span>` : avatar(p, 'av--lg')}
        <strong>${esc(p.name)}</strong><span class="tick">${ic('check')}</span></button>`).join('')}</div>`;
  };
  paint();
  m.addEventListener('click', (e) => {
    const t = e.target.closest('[data-type]'); if (t) { st.type = t.dataset.type; paint(); return; }
    const p = e.target.closest('[data-person]');
    if (p) { const id = p.dataset.person;
      if (id === 'all') st.people = new Set(['all']);
      else { st.people.delete('all'); st.people.has(id) ? st.people.delete(id) : st.people.add(id); if (!st.people.size) st.people.add(kind === 'task' ? ME.id : 'all'); }
      paint(); }
  });
  f.date.addEventListener('change', () => { f.endDate.min = f.date.value; if (f.endDate.value && f.endDate.value < f.date.value) f.endDate.value = f.date.value; });
  m.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmDlg('Wirklich löschen?', `„${it.title}“ wird für alle in der Gruppe dauerhaft entfernt.`))) return;
    m.close();
    try { await saveRow('cal', it.id, null, it.rev, true); toast('Eintrag für alle gelöscht.'); }
    catch (e) { toast(e.code === 'version_conflict' ? 'Der Eintrag wurde auf einem anderen Gerät geändert und neu geladen.' : e.message, 'err'); }
  });
  f.onsubmit = async (e) => {
    e.preventDefault();
    const title = f.title.value.trim(); if (!title) { m.querySelector('#ed-err').textContent = 'Bitte einen Titel eingeben.'; f.title.focus(); return; }
    const data = {kind, title, date: f.date.value || todayS()};
    if (f.endDate.value && f.endDate.value > data.date) data.endDate = f.endDate.value;
    if (f.time.value) data.time = f.time.value;
    if (f.note.value.trim()) data.note = f.note.value.trim();
    if (kind === 'event') { data.eventType = st.type; data.people = GENERAL.has(st.type) ? [] : [...st.people]; }
    else { data.people = [...st.people]; data.completed = !!f.completed?.checked; if (data.completed) data.completedBy = it?.completed ? it.completedBy || ME.id : ME.id; }
    if (it?.createdBy) data.createdBy = it.createdBy; else if (!it) data.createdBy = ME.id;
    if (it?.fromTodo) data.fromTodo = true;
    const id = it?.id || rid(kind);
    m.close();
    UI.sel = data.date; const d = pd(data.date); UI.month = new Date(d.getFullYear(), d.getMonth(), 1, 12);
    try { await saveRow('cal', id, data, it ? it.rev : 0); toast(kind === 'event' ? 'Termin für alle gespeichert.' : 'Auftrag für alle gespeichert.'); }
    catch (er) {
      if (er.code === 'version_conflict') return toast('Der Eintrag wurde auf einem anderen Gerät geändert. Die aktuelle Version wurde neu geladen.', 'err');
      toast('Nicht gespeichert: ' + er.message, 'err');
    }
  };
}
async function toggleTask(id) {
  const it = calItems().find((x) => x.id === id); if (!it) return;
  const data = {...it, completed: !it.completed}; delete data.id; delete data.rev;
  if (data.completed) data.completedBy = ME.id; else delete data.completedBy;
  try { await saveRow('cal', id, data, it.rev); if (data.completed) toast('Auftrag erledigt. Stark!', 'ok', {label:'Rückgängig', run: () => toggleTask(id)}); }
  catch (e) { toast(e.code === 'version_conflict' ? 'Der Auftrag wurde auf einem anderen Gerät geändert und neu geladen.' : 'Der Auftrag konnte nicht synchronisiert werden.', 'err'); }
}
async function finishEvent(id) { // Termin erledigt → für alle entfernen (mit Rückgängig)
  const it = calItems().find((x) => x.id === id); if (!it) return;
  const data = {...it}; delete data.id; delete data.rev;
  try {
    await saveRow('cal', id, null, it.rev, true);
    toast('Termin für alle erledigt und entfernt.', 'ok', {label:'Rückgängig', run: async () => { try { await saveRow('cal', id, data, 0); toast('Termin wiederhergestellt.'); } catch { toast('Der Termin konnte nicht wiederhergestellt werden.', 'err'); } }});
  } catch (e) { toast(e.code === 'version_conflict' ? 'Der Termin wurde auf einem anderen Gerät geändert und neu geladen.' : 'Der Termin konnte nicht entfernt werden.', 'err'); }
}
async function toggleDone(id) {
  const cur = doneMap()[id], completed = !cur?.completed, k = 'done|' + id, prev = D.items.get(k);
  const e = fevs().find((x) => x.id === id), waste = e && e.kind !== 'other';
  D.items.set(k, {coll:'done', id, data:{completed, by:ME.id}, rev: prev?.rev || 0}); PENDING++; PKEYS.add(k); render();
  try { const j = await api('/done', {g:G, id, completed}); D.items.set(k, j.item); toast(completed ? (waste ? 'Als rausgestellt bestätigt – für alle.' : 'Als erledigt markiert – für alle.') : 'Bestätigung zurückgenommen.'); }
  catch (er) { prev ? D.items.set(k, prev) : D.items.delete(k); toast(er.message, 'err'); }
  finally { PENDING--; PKEYS.delete(k); saveCache(); render(); }
}

// ---------- Gemeinsamer Kalender: Einträge & Quellen ----------
function openFevEditor(date, id) {
  const it = id ? fevs().find((x) => x.id === id) : null;
  const m = openModal(`<form><div class="badge" style="margin-bottom:10px">${ic('bin')} Gemeinsamer Kalender</div><h2>${it ? 'Eintrag bearbeiten' : 'Müll-Termin eintragen'}</h2><p class="desc">Für alle in der Gruppe sichtbar. Jeder kann bestätigen, wer die Tonne rausgestellt hat.</p>
    <fieldset><legend>Tonne</legend><div class="tiles" role="radiogroup">${Object.entries(WASTE).map(([k, w]) => `<label class="tile" aria-checked="${(it?.kind || 'rest') === k}"><input type="radio" name="kind" value="${k}" ${(it?.kind || 'rest') === k ? 'checked' : ''} hidden data-act="tile-radio"><span class="dot" style="--c:${w.c}"></span>${k === 'other' ? 'Sonstiges' : w.t}<span class="tick">${ic('check')}</span></label>`).join('')}</div></fieldset>
    <div class="field"><label for="fv-title">Titel</label><input class="input" id="fv-title" name="title" maxlength="120" value="${esc(it?.title || 'Restabfall')}" required></div>
    <div class="two"><div class="field"><label for="fv-date">Datum</label><input class="input" id="fv-date" type="date" name="date" value="${it?.date || date}" required></div><div class="field"><label for="fv-time">Uhrzeit <span>optional</span></label><input class="input" id="fv-time" type="time" name="time" value="${it?.time || ''}"></div></div>
    <div class="field"><label for="fv-note">Notiz <span>optional</span></label><input class="input" id="fv-note" name="note" maxlength="500" value="${esc(it?.note || '')}"></div>
    <div class="modal-foot">${it ? `<button type="button" class="btn btn--dangerghost" data-del>${ic('trash')} Löschen</button>` : `<button type="button" class="btn btn--ghost" data-close>Abbrechen</button>`}<button class="btn" type="submit">Speichern</button></div></form>`);
  const f = m.querySelector('form');
  let touched = !!it; f.title.addEventListener('input', () => touched = true);
  f.addEventListener('change', (e) => { if (e.target.name === 'kind' && !touched) f.title.value = e.target.value === 'other' ? '' : WASTE[e.target.value].t; });
  m.querySelector('[data-del]')?.addEventListener('click', async () => { m.close(); try { await saveRow('fev', it.id, null, it.rev, true); toast('Eintrag entfernt.'); } catch (e) { toast(e.message, 'err'); } });
  f.onsubmit = async (e) => { e.preventDefault(); const v = Object.fromEntries(new FormData(f)); if (!v.title.trim()) return f.title.focus();
    m.close(); try { await saveRow('fev', it?.id || rid('fev-m'), {feed:'manual', title:v.title.trim(), date:v.date, kind:v.kind, ...(v.time ? {time:v.time} : {}), ...(v.note.trim() ? {note:v.note.trim()} : {})}, it ? it.rev : 0); toast('Für alle gespeichert.'); } catch (er) { toast(er.message, 'err'); } };
}
function uploadIcs(feedId) {
  pickFile('.ics,text/calendar', async (file) => {
    if (file.size > 3e6) return toast('Die Datei ist zu groß (max. 3 MB).', 'err');
    const text = await file.text();
    let name = file.name.replace(/\.ics$/i, '').slice(0, 60);
    if (!feedId) { const r = await promptDlg('ICS-Datei importieren', [{name:'name', label:'Name der Quelle', value:name, ph:'z. B. Abfuhrkalender 2026'}], 'Importieren', 'Die Termine erscheinen für alle im Tab „Müll & Gemeinsam“.'); if (!r) return; name = r.values.name || name; r.modal.close(); }
    toast('Kalender wird importiert …', 'info');
    try { const j = await api('/feed', feedId ? {g:G, action:'refresh', id:feedId, ics:text} : {g:G, action:'add', name, ics:text}); toast(`${plural(j.count, 'Termin', 'Termine')} importiert.`); await sync(true); }
    catch (e) { toast(e.message, 'err'); }
  });
}
async function subscribeIcs() {
  const r = await promptDlg('ICS-Link abonnieren', [{name:'name', label:'Name der Quelle', ph:'z. B. Müllabfuhr Stadt'}, {name:'url', label:'Kalender-Link (https:// oder webcal://)', type:'url', ph:'https://…/kalender.ics'}], 'Abonnieren', 'Der Kalender wird täglich automatisch aktualisiert.');
  if (!r) return; const {name, url} = r.values;
  if (!/^(https?|webcals?):\/\//i.test(url.trim())) { r.modal.querySelector('[data-err]').textContent = 'Bitte einen gültigen Link eingeben.'; return subscribeIcsRetry(r); }
  r.modal.close(); toast('Kalender wird geladen …', 'info');
  try { const j = await api('/feed', {g:G, action:'add', name, url:url.trim()}); toast(`Abonniert: ${plural(j.count, 'Termin', 'Termine')}.`); await sync(true); } catch (e) { toast(e.message, 'err'); }
}
function subscribeIcsRetry(r) { r.modal.close(); toast('Bitte einen gültigen Link (https:// oder webcal://) eingeben.', 'err'); }

// ---------- To-do & Einkauf ----------
function openTodoNew(kind) {
  const m = openModal(`<form><span class="badge ${kind === 'task' ? 'badge--task' : ''}">${ic(kind === 'task' ? 'task' : 'cal')} ${kind === 'task' ? 'Offener Auftrag' : 'Offener Termin'}</span>
    <h2 style="margin-top:12px">${kind === 'task' ? 'Auftrag in die Liste stellen' : 'Termin in die Liste stellen'}</h2><p class="desc">Noch ohne Person und Datum. Jeder aus der Gruppe kann den Eintrag später übernehmen.</p>
    <div class="field"><label for="td-title">Was steht an?</label><input class="input" id="td-title" name="title" maxlength="120" autofocus required placeholder="${kind === 'task' ? 'z. B. Keller aufräumen' : 'z. B. Termin beim Tierarzt'}"></div>
    <div class="field"><label for="td-note">Notiz <span>optional</span></label><textarea class="input" id="td-note" name="note" rows="3" maxlength="1000" placeholder="Weitere Informationen"></textarea></div>
    <div class="modal-foot"><button type="button" class="btn btn--ghost" data-close>Abbrechen</button><button class="btn ${kind === 'task' ? 'btn--green' : ''}" type="submit" disabled>Offen eintragen</button></div></form>`);
  const f = m.querySelector('form'), b = f.querySelector('[type=submit]');
  f.title.addEventListener('input', () => b.disabled = !f.title.value.trim());
  f.onsubmit = async (e) => { e.preventDefault(); const title = f.title.value.trim(); if (!title) return; m.close();
    try { await saveRow('todo', rid('todo'), {kind, title, ...(f.note.value.trim() ? {note:f.note.value.trim()} : {}), createdBy:ME.id}, 0); toast(kind === 'task' ? 'Offener Auftrag eingetragen.' : 'Offener Termin eingetragen.'); }
    catch (er) { toast(er.message, 'err'); } };
}
function openTake(id) {
  const r = D.items.get('todo|' + id); if (!r || r.deleted) return;
  const e = r.data, me = member(ME.id);
  const m = openModal(`<form><span class="badge ${e.kind === 'task' ? 'badge--task' : ''}">${e.kind === 'task' ? 'Auftrag' : 'Termin'}</span><h2 style="margin-top:12px">${esc(e.title)}</h2>${e.note ? `<p class="desc">${esc(e.note)}</p>` : ''}
    <div class="check" style="cursor:default;margin:10px 0 14px">${avatar(me, '')}<div><small class="muted">Wird übernommen von</small><br><b>${esc(ME.name)}</b></div></div>
    <div class="field" id="tk-datef"><label for="tk-date">An welchem Tag?</label><input class="input" id="tk-date" type="date" name="date" value="${todayS()}" required></div>
    <label class="check"><input type="checkbox" name="done"><span><b>Schon erledigt</b><br><small class="muted">Der Eintrag wird nicht mehr in den Kalender übernommen.</small></span></label>
    <div class="modal-foot"><button type="button" class="btn btn--ghost" data-close>Abbrechen</button><button class="btn" type="submit">In meinen Kalender</button></div></form>`);
  const f = m.querySelector('form'), sb = f.querySelector('[type=submit]');
  f.done.addEventListener('change', () => { $('#tk-datef', m).classList.toggle('hidden', f.done.checked); sb.textContent = f.done.checked ? 'Als erledigt übernehmen' : 'In meinen Kalender'; });
  f.onsubmit = async (ev) => { ev.preventDefault(); if (!f.done.checked && !f.date.value) return; sb.disabled = true; sb.textContent = 'Übernimmt …';
    try { const j = await api('/take', {g:G, id, date:f.date.value, done:f.done.checked}); m.close();
      if (j.removed) D.items.set('todo|' + id, j.removed); if (j.calendarItem) D.items.set('cal|' + j.calendarItem.id, j.calendarItem); saveCache(); render();
      toast(f.done.checked ? 'Als erledigt übernommen.' : `${e.kind === 'task' ? 'Auftrag' : 'Termin'} in deinen Kalender übernommen.`); }
    catch (er) { m.close(); toast(er.message, 'err'); sync(true); } };
}
async function addShop(label) {
  label = label.trim(); if (!label) return;
  if (rows('shop').some((r) => norm(r.data.label) === norm(label))) { toast(`${label} steht bereits auf der Liste.`, 'info'); return; }
  const p = detectProduct(label); const inp = $('#shop-input'); if (inp) inp.value = '';
  try { await saveRow('shop', rid('shop'), {label, productKey: p?.key || 'custom', addedBy: ME.id}, 0); } catch (e) { toast(e.message, 'err'); }
  updateShopSuggest(); $('#shop-input')?.focus();
}

// ---------- Gruppen & Einladungen ----------
const inviteUrl = (t) => `${location.origin}${location.pathname}#/join/${t}`;
async function shareInvite(tokenStr) {
  const url = inviteUrl(tokenStr), g = D.group;
  const text = `Komm in ${g?.kind === 'team' ? 'unser Team' : 'unsere Gruppe'} „${g?.name}“ bei Responsible – dort planen wir Termine, Aufträge und To-dos gemeinsam.`;
  if (navigator.share) { try { await navigator.share({title:'Einladung zu Responsible', text, url}); return; } catch (e) { if (e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(url); toast('Einladungslink kopiert.'); }
  catch { openModal(`<h2>Einladungslink</h2><p class="desc">Kopiere diesen Link und schicke ihn an die Person, die du einladen möchtest.</p><input class="input" readonly value="${esc(url)}" onclick="this.select()"><div class="modal-foot"><button class="btn" data-close>Fertig</button></div>`); }
}
async function createInvite() {
  if (!isAdmin()) return toast('Nur Besitzer und Admins können einladen. Frag sie nach einem Link.', 'err');
  try { const j = await api('/group', {g:G, action:'invite'}); sync(true); await shareInvite(j.token); } catch (e) { toast(e.message, 'err'); }
}
function openGroupSwitch() {
  const m = openModal(`<h2>Gruppe wählen</h2><p class="desc">Du kannst in mehreren Familien und Teams sein.</p>
    ${GROUPS.map((x) => `<button class="gitem" aria-checked="${x.id === G}" data-gid="${x.id}">${groupBadge(x, 'av--sm')}<span class="grow"><b>${esc(x.name)}</b><div class="small muted">${kindLabel(x.kind)} · ${plural(x.count, 'Mitglied', 'Mitglieder')}</div></span>${x.id === G ? ic('check') : ''}</button>`).join('')}
    <div class="modal-foot"><button class="btn btn--ghost" data-join>${ic('link')} Beitreten</button><button class="btn" data-new>${ic('plus')} Neue Gruppe</button></div>`);
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-gid]'); if (b) { m.close(); selectGroup(b.dataset.gid); toast('Gruppe gewechselt.'); } });
  m.querySelector('[data-new]').onclick = () => { m.close(); openGroupForm(); };
  m.querySelector('[data-join]').onclick = () => { m.close(); joinByPaste(); };
}
function openGroupForm(g) {
  const m = openModal(`<form data-form="${g ? 'group-update' : 'group-create'}"><h2>${g ? 'Gruppe bearbeiten' : 'Neue Gruppe erstellen'}</h2><p class="desc">${g ? '' : 'Du bist Besitzer und kannst danach andere per Link einladen.'}</p>${groupFields(g || {name:'', kind:'family'})}
    <div class="modal-foot"><button type="button" class="btn btn--ghost" data-close>Abbrechen</button><button class="btn" type="submit">${g ? 'Speichern' : 'Erstellen'}</button></div></form>`);
  return m;
}
async function joinByPaste() {
  const r = await promptDlg('Per Link beitreten', [{name:'link', label:'Einladungslink', ph:'https://…#/join/…'}], 'Beitreten'); if (!r) return; r.modal.close();
  const t = (r.values.link.match(/join\/([a-f0-9]{16,64})/) || r.values.link.match(/^([a-f0-9]{32})$/) || [])[1];
  if (!t) return toast('Das ist kein gültiger Einladungslink.', 'err');
  doJoin(t);
}
async function doJoin(t) {
  try { const j = await api('/join', {token:t}); GROUPS = j.groups; sessionStorage.removeItem('rs_join'); AUTH.pendingInvite = null;
    selectGroup(j.group); toast(j.already ? 'Du bist schon Mitglied dieser Gruppe.' : `Willkommen in „${GROUPS.find((g) => g.id === j.group)?.name}“!`); go('home'); }
  catch (e) { sessionStorage.removeItem('rs_join'); AUTH.pendingInvite = null; toast(e.message, 'err'); render(); }
}
async function handleJoinToken(t) {
  sessionStorage.setItem('rs_join', t);
  try { AUTH.pendingInvite = await api('/invite/' + t, null, {noauth:true}); } catch (e) { AUTH.pendingInvite = {error: e.message}; sessionStorage.removeItem('rs_join'); }
  if (ME && !AUTH.pendingInvite.error) {
    const p = AUTH.pendingInvite;
    if (GROUPS.some((g) => g.id === p.group.id)) { sessionStorage.removeItem('rs_join'); AUTH.pendingInvite = null; selectGroup(p.group.id); toast('Du bist schon Mitglied dieser Gruppe.'); go('home'); return; }
    const m = openModal(`<div style="text-align:center">${groupBadge(p.group, 'av--xl')}<div class="eyebrow" style="margin-top:14px">Einladung</div><h2>${esc(p.group.name)}</h2><p class="desc">${kindLabel(p.group.kind)}${p.by ? ' · eingeladen von ' + esc(p.by) : ''}</p></div>
      <div class="modal-foot"><button class="btn btn--ghost" data-close>Später</button><button class="btn" data-ok>Beitreten</button></div>`);
    m.querySelector('[data-ok]').onclick = () => { m.close(); doJoin(t); };
    m.querySelector('[data-close]').addEventListener('click', () => { sessionStorage.removeItem('rs_join'); AUTH.pendingInvite = null; });
  } else render();
}
function memberMenu(id) {
  const m0 = member(id); if (!m0) return; const owner = myRole() === 'owner';
  const m = openModal(`<div class="row" style="margin-bottom:14px">${avatar(m0, 'av--lg')}<div><h2 style="margin:0">${esc(m0.name)}</h2><div class="small muted">${{owner:'Besitzer', admin:'Admin', member:'Mitglied'}[m0.role]}</div></div></div>
    <div style="display:flex;flex-direction:column;gap:8px">${owner ? (m0.role === 'admin' ? `<button class="btn btn--ghost" data-r="member">Admin-Rechte entziehen</button>` : `<button class="btn btn--ghost" data-r="admin">Zum Admin machen</button>`) + `<button class="btn btn--ghost" data-r="owner">Besitz übergeben</button>` : ''}
    <button class="btn btn--dangerghost" data-rm>Aus der Gruppe entfernen</button><button class="btn btn--ghost" data-close>Abbrechen</button></div>`);
  m.addEventListener('click', async (e) => {
    const r = e.target.closest('[data-r]');
    if (r) { if (r.dataset.r === 'owner' && !(await confirmDlg('Besitz übergeben?', `${m0.name} wird Besitzer der Gruppe. Du wirst Admin.`, 'Übergeben', false))) return;
      m.close(); try { await api('/group', {g:G, action:'role', usr:id, role:r.dataset.r}); toast('Rolle geändert.'); await refreshMe(); sync(true); } catch (er) { toast(er.message, 'err'); } }
    if (e.target.closest('[data-rm]')) { m.close(); if (!(await confirmDlg('Mitglied entfernen?', `${m0.name} verliert den Zugriff auf alle Termine und Listen dieser Gruppe.`, 'Entfernen'))) return;
      try { await api('/group', {g:G, action:'remove', usr:id}); toast(`${m0.name} wurde entfernt.`); sync(true); } catch (er) { toast(er.message, 'err'); } }
  });
}

// ---------- Konto ----------
function storeLogin(j) {
  ACC.list[j.user.id] = {id:j.user.id, name:j.user.name, avatar:j.user.avatar, token:j.token}; ACC.cur = j.user.id; saveAcc();
}
async function startSession() {
  try { const j = await api('/me'); ME = j.user; GROUPS = j.groups; lastMe = Date.now(); }
  catch (e) { if (e.code === 401) return; ME = ACC.list[ACC.cur] ? {id:ACC.cur, name:ACC.list[ACC.cur].name, avatar:ACC.list[ACC.cur].avatar} : null; GROUPS = lsGet('rs_groups_' + ACC.cur, []); setSync('offline'); }
  if (!ME) return render();
  lsSet('rs_groups_' + ME.id, GROUPS);
  const want = lsGet('rs_grp_' + ME.id, null);
  const pend = sessionStorage.getItem('rs_join');
  selectGroup(GROUPS.some((g) => g.id === want) ? want : GROUPS[0]?.id ?? null);
  if (pend) handleJoinToken(pend);
}
async function logout() {
  try { await api('/logout', {}); } catch {}
  if (ACC.list[ACC.cur]) delete ACC.list[ACC.cur].token;
  ACC.cur = null; saveAcc(); ME = null; GROUPS = []; G = null; D = blankData(); AUTH.err = {}; AUTH.tab = 'login'; AUTH.name = '';
  go('home'); render(); toast('Du bist abgemeldet.');
}
async function switchAccount(id) {
  const a = ACC.list[id]; if (!a) return;
  if (a.token) { ACC.cur = id; saveAcc(); ME = null; D = blankData(); await startSession(); if (ME) { go('home'); toast(`Angemeldet als ${ME.name}.`); } else render(); }
  else { ACC.cur = null; ME = null; GROUPS = []; G = null; AUTH.tab = 'login'; AUTH.name = a.name; AUTH.err = {}; render(); setTimeout(() => $('#f-pass')?.focus(), 50); }
}

// ---------- Navigation ----------
function go(view) { if (location.hash !== '#/' + view) location.hash = '#/' + view; else route(); }
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const jm = h.match(/^join\/([a-f0-9]{16,64})/);
  if (jm) { history.replaceState(null, '', location.pathname + '#/home'); UI.view = 'home'; handleJoinToken(jm[1]); return; }
  UI.view = ['home','kalender','todo','einkauf','gruppe','einstellungen'].includes(h) ? h : 'home';
  render(); scrollTo(0, 0);
}

// ---------- Ereignisse ----------
const ACT = {
  'auth-tab': (el) => { AUTH.tab = el.dataset.tab; AUTH.err = {}; AUTH.name = $('#f-name')?.value || AUTH.name; render(); },
  'reg-photo': () => pickFile('image/*', async (f) => { try { AUTH.avatar = await resizeImage(f, 384); AUTH.name = $('#f-name')?.value || ''; render(); } catch (e) { toast(e.message, 'err'); } }),
  'acc-pick': (el) => switchAccount(el.dataset.id),
  'acc-forget': (el, e) => { e.stopPropagation(); delete ACC.list[el.dataset.id]; saveAcc(); render(); },
  'acc-switch': (el) => switchAccount(el.dataset.id),
  'acc-add': () => { ACC.cur = null; saveAcc(); ME = null; GROUPS = []; G = null; D = blankData(); AUTH.tab = 'login'; AUTH.name = ''; render(); },
  nav: (el) => go(el.dataset.view),
  sync: () => sync(true),
  invite: () => createInvite(),
  'group-switch': () => openGroupSwitch(),
  'group-select': (el) => { selectGroup(el.dataset.id); toast('Gruppe gewechselt.'); },
  'group-new': () => openGroupForm(),
  'group-edit': () => openGroupForm(D.group),
  'join-link': () => joinByPaste(),
  'group-image': () => pickFile('image/*', async (f) => { try { const img = await resizeImage(f, 512); const j = await api('/group', {g:G, action:'image', image:img}); GROUPS = j.groups; D.group = {...D.group, image:j.image}; render(); toast('Gruppenbild aktualisiert.'); } catch (e) { toast(e.message, 'err'); } }),
  'group-leave': async () => { if (!(await confirmDlg('Gruppe verlassen?', 'Du siehst danach keine Termine, Aufträge und Listen dieser Gruppe mehr.', 'Verlassen'))) return;
    try { const j = await api('/group', {g:G, action:'leave'}); GROUPS = j.groups; localStorage.removeItem(cacheKey()); selectGroup(GROUPS[0]?.id ?? null); go('home'); toast('Du hast die Gruppe verlassen.'); } catch (e) { toast(e.message, 'err'); } },
  'group-delete': async () => { if (!(await confirmDlg('Gruppe löschen?', `„${D.group?.name}“ wird mit allen Terminen, Aufträgen und Listen für alle Mitglieder gelöscht.`, 'Endgültig löschen'))) return;
    try { const j = await api('/group', {g:G, action:'delete'}); GROUPS = j.groups; localStorage.removeItem(cacheKey()); selectGroup(GROUPS[0]?.id ?? null); go('home'); toast('Gruppe gelöscht.'); } catch (e) { toast(e.message, 'err'); } },
  'member-menu': (el) => memberMenu(el.dataset.id),
  'invite-copy': (el) => shareInvite(el.dataset.token),
  'invite-revoke': async (el) => { if (!(await confirmDlg('Einladung zurückziehen?', 'Der Link funktioniert danach nicht mehr.', 'Zurückziehen'))) return;
    try { await api('/group', {g:G, action:'revoke', token:el.dataset.token}); D.invites = D.invites.filter((i) => i.token !== el.dataset.token); render(); toast('Einladung zurückgezogen.'); } catch (e) { toast(e.message, 'err'); } },
  'home-check': (el) => { const it = calItems().find((x) => x.id === el.dataset.id); if (!it) return; it.kind === 'task' ? toggleTask(it.id) : finishEvent(it.id); },
  goto: (el) => { UI.sel = el.dataset.date; UI.tab = el.dataset.tab; const d = pd(UI.sel); UI.month = new Date(d.getFullYear(), d.getMonth(), 1, 12); go('kalender'); setTimeout(() => innerWidth < 900 && $('#daypanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 80); },
  'cal-tab': (el) => { UI.tab = el.dataset.tab; render(); },
  month: (el) => { const n = +el.dataset.d; UI.month = new Date(UI.month.getFullYear(), UI.month.getMonth() + n, 1, 12); render(); },
  day: (el) => { UI.sel = el.dataset.date; const d = pd(UI.sel); if (d.getMonth() !== UI.month.getMonth()) UI.month = new Date(d.getFullYear(), d.getMonth(), 1, 12); render(); if (innerWidth < 900) $('#daypanel')?.scrollIntoView({behavior:'smooth', block:'nearest'}); },
  'new-event': (el) => openEditor({kind:'event', date: el.dataset.date || UI.sel}),
  'new-task': (el) => openEditor({kind:'task', date: el.dataset.date || UI.sel}),
  edit: (el) => openEditor({item: el.dataset.id}),
  'task-toggle': (el) => toggleTask(el.dataset.id),
  'fev-done': (el) => toggleDone(el.dataset.id),
  'fev-new': (el) => openFevEditor(el.dataset.date || UI.sel),
  'fev-edit': (el) => openFevEditor(UI.sel, el.dataset.id),
  'feed-upload': () => uploadIcs(),
  'feed-url': () => subscribeIcs(),
  'feed-refresh': async (el) => { const f = feeds().find((x) => x.id === el.dataset.id); if (!f) return;
    if (f.type !== 'url') { toast('Wähle die aktualisierte ICS-Datei aus.', 'info'); return uploadIcs(f.id); }
    toast('Wird aktualisiert …', 'info'); try { const j = await api('/feed', {g:G, action:'refresh', id:f.id}); toast(`Aktualisiert: ${plural(j.count, 'Termin', 'Termine')}.`); sync(true); } catch (e) { toast(e.message, 'err'); sync(true); } },
  'feed-delete': async (el) => { const f = feeds().find((x) => x.id === el.dataset.id); if (!f || !(await confirmDlg('Quelle entfernen?', `„${f.name}“ und alle ihre Termine werden für alle entfernt.`, 'Entfernen'))) return;
    try { await api('/feed', {g:G, action:'delete', id:f.id}); toast('Quelle entfernt.'); sync(true); } catch (e) { toast(e.message, 'err'); } },
  'todo-new': (el) => openTodoNew(el.dataset.kind),
  'todo-take': (el) => openTake(el.dataset.id),
  'todo-del': async (el) => { const r = D.items.get('todo|' + el.dataset.id); if (!r) return; try { await saveRow('todo', r.id, null, r.rev, true); toast('Eintrag entfernt.'); } catch (e) { toast(e.code === 'version_conflict' ? 'Der Eintrag wurde inzwischen geändert.' : e.message, 'err'); } },
  'shop-suggest': () => addShop($('#shop-input')?.value || ''),
  'shop-check': async (el) => { if (el.classList.contains('stile--gone')) return; el.classList.add('stile--gone'); await new Promise((r) => setTimeout(r, 220));
    try { await saveRow('shop', el.dataset.id, null, undefined, true); } catch (e) { toast('Der Artikel konnte nicht abgehakt werden.', 'err'); } },
  color: (el) => setColor(el.dataset.color),
  avatar: () => pickFile('image/*', async (f) => { try { const img = await resizeImage(f, 384); const j = await api('/account', {action:'avatar', avatar:img}); ME = j.user; storeMe(); toast('Profilbild aktualisiert.'); sync(true); } catch (e) { toast(e.message, 'err'); } }),
  'avatar-remove': async () => { try { const j = await api('/account', {action:'avatar', avatar:null}); ME = j.user; storeMe(); toast('Profilbild entfernt.'); sync(true); } catch (e) { toast(e.message, 'err'); } },
  logout: () => logout(),
  'acc-delete': async () => { const r = await promptDlg('Konto löschen?', [{name:'pass', label:'Zur Bestätigung dein Passwort', type:'password'}], 'Konto endgültig löschen', 'Dein Konto und dein Profilbild werden gelöscht. Gruppen, die dir gehören, gehen an ein anderes Mitglied über oder werden gelöscht.'); if (!r) return;
    try { await api('/account', {action:'delete', pass:r.values.pass}); r.modal.close(); delete ACC.list[ACC.cur]; ACC.cur = null; saveAcc(); ME = null; GROUPS = []; G = null; D = blankData(); go('home'); render(); toast('Dein Konto wurde gelöscht.'); }
    catch (e) { r.modal.querySelector('[data-err]').textContent = e.message; } },
  'hard-reload': async () => { try { for (const k of await caches.keys()) await caches.delete(k); const rs = await navigator.serviceWorker?.getRegistrations(); for (const r of rs || []) await r.unregister(); } catch {} location.reload(); },
};
function storeMe() { if (ACC.list[ME.id]) { ACC.list[ME.id].name = ME.name; ACC.list[ME.id].avatar = ME.avatar; saveAcc(); } const m = member(ME.id); if (m) { m.avatar = ME.avatar; m.name = ME.name; } render(); }
let colorT = null;
async function setColor(c) {
  const m = member(ME.id), prev = m?.color; if (m) { m.color = c; render(); }
  try { await api('/group', {g:G, action:'color', color:c}); toast('Deine Farbe ist gespeichert.'); sync(true); } catch (e) { if (m) { m.color = prev; render(); } toast(e.message, 'err'); }
}
const FORMS = {
  async login(f) {
    const name = f.name.value.trim(), pass = f.pass.value; AUTH.name = name; AUTH.err = {};
    if (!name || !pass) { AUTH.err = {form:'Bitte Name und Passwort eingeben.'}; return render(); }
    AUTH.busy = true; render();
    try { const j = await api('/login', {name, pass}, {noauth:true}); storeLogin(j); AUTH.busy = false; AUTH.err = {}; await startSession(); toast(`Willkommen zurück, ${ME.name}!`); }
    catch (e) { AUTH.busy = false; AUTH.err = {form:e.message}; render(); }
  },
  async register(f) {
    const name = f.name.value.trim(), pass = f.pass.value, pass2 = f.pass2.value; AUTH.name = name; AUTH.err = {};
    if (name.length < 2) AUTH.err.name = 'Der Name braucht mindestens 2 Zeichen.';
    if (pass.length < 4) AUTH.err.pass = 'Das Passwort braucht mindestens 4 Zeichen.';
    else if (pass !== pass2) AUTH.err.pass2 = 'Die Passwörter stimmen nicht überein.';
    if (Object.keys(AUTH.err).length) return render();
    AUTH.busy = true; render();
    try { const j = await api('/register', {name, pass, ...(AUTH.avatar ? {avatar:AUTH.avatar} : {})}, {noauth:true}); storeLogin(j); AUTH.busy = false; AUTH.avatar = null; await startSession(); toast(`Willkommen bei Responsible, ${ME.name}!`); }
    catch (e) { AUTH.busy = false; AUTH.err = e.field ? {[e.field]: e.message} : {form:e.message}; render(); }
  },
  async 'group-create'(f, modal) {
    const name = f.name.value.trim(), kind = f.kind.value || 'family'; if (name.length < 2) return toast('Der Name braucht mindestens 2 Zeichen.', 'err');
    try { const j = await api('/group', {action:'create', name, kind}); modal?.close(); GROUPS = j.groups; selectGroup(j.group); go('home'); toast(`„${name}“ ist bereit. Lade jetzt andere ein!`, 'ok', {label:'Einladen', run: createInvite}); }
    catch (e) { toast(e.message, 'err'); }
  },
  async 'group-update'(f, modal) {
    try { const j = await api('/group', {g:G, action:'update', name:f.name.value.trim(), kind:f.kind.value}); modal?.close(); GROUPS = j.groups; D.group = {...D.group, name:f.name.value.trim(), kind:f.kind.value}; render(); toast('Gruppe gespeichert.'); }
    catch (e) { toast(e.message, 'err'); }
  },
  'join-paste'(f) { const t = (f.link.value.match(/join\/([a-f0-9]{16,64})/) || [])[1]; if (!t) return toast('Das ist kein gültiger Einladungslink.', 'err'); doJoin(t); },
  'shop-add'(f) { addShop(f.label.value); },
  async 'acc-name'(f) { try { const j = await api('/account', {action:'name', name:f.name.value}); ME = j.user; storeMe(); toast('Name gespeichert.'); } catch (e) { toast(e.message, 'err'); } },
  async 'acc-pass'(f) {
    if (f.pass.value !== f.pass2.value) return toast('Die neuen Passwörter stimmen nicht überein.', 'err');
    try { await api('/account', {action:'password', old:f.old.value, pass:f.pass.value}); f.reset(); toast('Passwort geändert. Andere Geräte wurden abgemeldet.'); } catch (e) { toast(e.message, 'err'); }
  },
};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = ACT[el.dataset.act]; if (!a) return;
  if (el.dataset.act === 'tile-radio') return;
  e.preventDefault(); a(el, e);
});
document.addEventListener('change', (e) => {
  if (e.target.matches('[data-act=tile-radio]')) { const grp = e.target.closest('[role=radiogroup]'); $$('.tile', grp).forEach((t) => t.setAttribute('aria-checked', t.querySelector('input')?.checked ? 'true' : 'false')); }
  if (e.target.dataset.input === 'color') setColor(e.target.value.toLowerCase());
});
document.addEventListener('input', (e) => { if (e.target.dataset.input === 'shop') updateShopSuggest(); });
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  FORMS[f.dataset.form]?.(f, f.closest('.modal-bg'));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('.acc')) e.target.click(); });
// Monat wischen
let touch0 = null;
document.addEventListener('touchstart', (e) => { if (e.touches.length === 1 && e.target.closest('#calgrid')) touch0 = {x:e.touches[0].clientX, y:e.touches[0].clientY}; else touch0 = null; }, {passive:true});
document.addEventListener('touchend', (e) => {
  if (!touch0) return; const t = e.changedTouches[0], dx = t.clientX - touch0.x, dy = t.clientY - touch0.y; touch0 = null;
  if (Math.abs(dx) < 55 || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
  UI.month = new Date(UI.month.getFullYear(), UI.month.getMonth() + (dx < 0 ? 1 : -1), 1, 12); render();
}, {passive:true});

// ---------- Start ----------
(async function boot() {
  addEventListener('hashchange', route);
  const h = location.hash.replace(/^#\/?/, '');
  UI.view = ['home','kalender','todo','einkauf','gruppe','einstellungen'].includes(h) ? h : 'home';
  const jm = h.match(/^join\/([a-f0-9]{16,64})/);
  if (jm) { sessionStorage.setItem('rs_join', jm[1]); history.replaceState(null, '', location.pathname + '#/home'); }
  if (ACC.cur && token()) await startSession();
  const pend = sessionStorage.getItem('rs_join');
  if (!ME && pend) handleJoinToken(pend);
  render(); startPolling();
  if ('serviceWorker' in navigator && !/[?&]nosw/.test(location.search)) {
    let reloaded = false; const hadController = !!navigator.serviceWorker.controller;
    // Nur bei einem echten Update neu laden (nicht bei der ersten Installation)
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloaded && !document.querySelector('.modal-bg')) { reloaded = true; location.reload(); } });
    navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
  }
})();
