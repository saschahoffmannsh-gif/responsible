'use strict';
// Responsible – Ansichten
const NAV = [['home','Home','home'],['kalender','Kalender','cal'],['todo','To-do','todo'],['gruppe','Gruppe','group'],['einstellungen','Einstellungen','gear']];

function render() {
  const app = $('#app'); if (!app) return;
  const a = document.activeElement, keep = a && a.id && app.contains(a) ? {id:a.id, v:a.value, s:a.selectionStart, e:a.selectionEnd} : null;
  const sy = scrollY;
  if (!ME) app.innerHTML = viewAuth();
  else if (!GROUPS.length || !G) app.innerHTML = viewOnboard();
  else app.innerHTML = viewShell();
  if (keep) { const el = document.getElementById(keep.id); if (el) { if ('value' in el && keep.v != null && el.type !== 'file') el.value = keep.v; el.focus({preventScroll:true}); try { el.setSelectionRange(keep.s, keep.e); } catch {} } }
  scrollTo(0, sy);
  afterRender();
}
function afterRender() {
  const sb = $('#shop-input'); if (sb) updateShopSuggest();
  const pending = AUTH.pendingInvite; const el = $('#invite-slot'); if (el && pending) el.innerHTML = inviteBanner(pending);
  if (ME && G) { refreshThread(); checkDueReminders(); if (UI.view === 'einstellungen') refreshPush(); }
}

// ---------- Anmeldung ----------
const AUTH = {tab:'login', name:'', err:{}, busy:false, avatar:null, pendingInvite:null};
function inviteBanner(p) {
  if (!p) return '';
  if (p.error) return `<div class="card invite-banner"><div>${ic('link')}</div><div class="grow"><b>Einladung ungültig</b><div class="small muted">${esc(p.error)}</div></div></div>`;
  return `<div class="card invite-banner">${groupBadge(p.group, 'av--lg')}<div class="grow"><div class="eyebrow">Einladung</div><b>${esc(p.group.name)}</b><div class="small muted">${kindLabel(p.group.kind)}${p.by ? ' · eingeladen von ' + esc(p.by) : ''}. Melde dich an oder registriere dich, um beizutreten.</div></div></div>`;
}
function viewAuth() {
  const accs = Object.values(ACC.list);
  const e = AUTH.err, reg = AUTH.tab === 'register';
  return `<div class="auth">
    <div class="brand brand--big" style="align-items:center"><img src="icons/icon-192.png" alt=""><span>Responsible</span></div>
    <p class="tag">Termine, Aufträge und To-dos gemeinsam im Griff – für Familien und Teams.</p>
    <div id="invite-slot">${inviteBanner(AUTH.pendingInvite)}</div>
    ${accs.length && !reg ? `<div class="lbl" style="margin-bottom:8px">Zuletzt auf diesem Gerät</div><div class="acc-list">${accs.map((a) => `
      <div class="acc" role="button" tabindex="0" data-act="acc-pick" data-id="${a.id}">${avatar({...a, color:'#467ba6'}, 'av--lg')}<span>${esc(a.name)}</span>
      <button class="x" data-act="acc-forget" data-id="${a.id}" aria-label="${esc(a.name)} vergessen">×</button></div>`).join('')}</div>` : ''}
    <div class="seg" role="tablist"><button role="tab" aria-selected="${!reg}" data-act="auth-tab" data-tab="login">Anmelden</button><button role="tab" aria-selected="${reg}" data-act="auth-tab" data-tab="register">Neu registrieren</button></div>
    <form class="card pad" id="auth-form" data-form="${reg ? 'register' : 'login'}" novalidate>
      ${reg ? `<div class="photo-pick"><button type="button" class="gimg" data-act="reg-photo" aria-label="Profilbild wählen">${AUTH.avatar ? `<span class="av av--xl" style="--c:#467ba6"><img src="${AUTH.avatar}" alt=""></span>` : `<span class="av av--xl" style="--c:#cfdbe6;color:#5a7189">${ic('users')}</span>`}<span class="cam">${ic('camera')}</span></button>
        <div class="small muted">Profilbild <span class="opt">(optional)</span><br>Wird auf deinem Gerät verkleinert und sicher gespeichert.</div></div>` : ''}
      <div class="field"><label for="f-name">Name</label><input class="input" id="f-name" name="name" autocomplete="username" maxlength="24" value="${esc(AUTH.name)}" required><div class="field-err">${esc(e.name || '')}</div></div>
      <div class="field"><label for="f-pass">Passwort</label><input class="input" id="f-pass" name="pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" maxlength="72" required><div class="field-err">${esc(e.pass || '')}</div></div>
      ${reg ? `<div class="field"><label for="f-pass2">Passwort wiederholen</label><input class="input" id="f-pass2" name="pass2" type="password" autocomplete="new-password" maxlength="72" required><div class="field-err">${esc(e.pass2 || '')}</div></div>` : ''}
      <div class="field-err" style="margin-bottom:8px">${esc(e.form || '')}</div>
      <button class="btn btn--block" type="submit" ${AUTH.busy ? 'disabled' : ''}>${AUTH.busy ? 'Einen Moment …' : reg ? 'Konto erstellen' : 'Anmelden'}</button>
      <p class="small muted" style="text-align:center;margin:12px 0 0">${reg ? 'Name 2–24 Zeichen, Passwort mindestens 4 Zeichen. Keine E-Mail nötig.' : 'Noch kein Konto? Oben auf „Neu registrieren“ tippen.'}</p>
    </form></div>`;
}

// ---------- Ohne Gruppe ----------
function viewOnboard() {
  return `<div class="auth">
    <div class="brand brand--big" style="align-items:center"><img src="icons/icon-192.png" alt=""><span>Willkommen, ${esc(ME.name)}!</span></div>
    <p class="tag">Lege eine Gruppe für deine Familie oder dein Team an – oder tritt mit einem Einladungslink bei.</p>
    <div id="invite-slot"></div>
    <form class="card pad" data-form="group-create">
      <h2 style="font-size:18px;margin-bottom:12px">Neue Gruppe erstellen</h2>
      ${groupFields({name:'', kind:'family'})}
      <button class="btn btn--block" type="submit">Gruppe erstellen</button>
    </form>
    <form class="card pad" data-form="join-paste" style="margin-top:14px">
      <h2 style="font-size:18px;margin-bottom:12px">Einladung erhalten?</h2>
      <div class="field"><label for="f-joinlink">Einladungslink einfügen</label><input class="input" id="f-joinlink" name="link" placeholder="https://…#/join/…"></div>
      <button class="btn btn--ghost btn--block" type="submit">Beitreten</button>
    </form>
    <div style="text-align:center;margin-top:18px"><button class="link" data-act="logout">Abmelden</button></div></div>`;
}
function groupFields(g) {
  return `<div class="field"><label for="f-gname">Name der Gruppe</label><input class="input" id="f-gname" name="name" maxlength="40" value="${esc(g.name)}" placeholder="z. B. Familie Hammel oder Team Vertrieb" required></div>
    <fieldset><legend>Art der Gruppe</legend><div class="tiles" style="grid-template-columns:1fr 1fr" role="radiogroup">
      ${[['family','Familie','🏡'],['team','Team','🤝']].map(([k, l, em]) => `<label class="tile" aria-checked="${g.kind === k}"><input type="radio" name="kind" value="${k}" ${g.kind === k ? 'checked' : ''} hidden data-act="tile-radio"><span style="font-size:24px">${em}</span>${l}<span class="tick">${ic('check')}</span></label>`).join('')}
    </div></fieldset>`;
}

// ---------- App-Rahmen ----------
function viewShell() {
  const g = D.group || GROUPS.find((x) => x.id === G);
  const open = rows('todo').length + (rows('shop').length ? 1 : 0);
  const nav = (cls) => NAV.map(([v, l, i]) => `<button class="nav-item ${navActive(v) ? 'nav-item--active' : ''}" data-act="nav" data-view="${v}" aria-label="${l}${v === 'todo' && open ? ', ' + open + ' offen' : ''}">${ic(i)}<span>${l}</span>${v === 'todo' && open ? `<span class="nav-badge">${open}</span>` : ''}</button>`).join('');
  let body = '';
  switch (UI.view) {
    case 'kalender': body = viewCalendar(); break;
    case 'todo': body = viewTodo(); break;
    case 'einkauf': body = viewShop(); break;
    case 'gruppe': body = viewGroup(); break;
    case 'einstellungen': body = viewSettings(); break;
    default: body = viewHome();
  }
  return `<div class="shell">
    <nav class="side" aria-label="Hauptnavigation"><div class="brand"><img src="icons/icon-192.png" alt=""><span>Responsible</span></div>${nav()}</nav>
    <header class="topbar">
      <div class="brand"><img src="icons/icon-192.png" alt=""></div>
      <button class="grp-switch" data-act="group-switch" aria-label="Gruppe wechseln">${groupBadge(g, 'av--sm')}<b>${esc(g?.name || '')}</b>${ic('down')}</button>
      <span class="topbar__sp"></span>
      <button class="icon-btn" data-act="invite" aria-label="Mitglieder einladen" title="Einladen">${ic('share')}</button>
      <button id="syncbtn" class="icon-btn sync--${SYNC}" data-act="sync" aria-label="Synchronisieren">${ic('cloud')}</button>
      <button class="icon-btn" style="border:0;background:none;width:auto" data-act="nav" data-view="einstellungen" aria-label="Konto und Einstellungen">${avatar(member(ME.id) || {...ME, color:'#467ba6'}, 'av--sm')}</button>
    </header>
    <main class="main" id="main">${body}</main>
    <nav class="bnav" aria-label="Hauptnavigation">${nav()}</nav></div>`;
}
const navActive = (v) => UI.view === v || (v === 'todo' && UI.view === 'einkauf') || (v === 'home' && !NAV.some(([x]) => x === UI.view) && UI.view !== 'einkauf');

// ---------- Home: Meine Termine & Aufträge ----------
function homeData() {
  const t = todayS(), end = addDays(t, 6);
  const mine = calItems().filter((e) => {
    if (!overlaps(e, t, end)) return false;
    if (e.kind === 'task') return forMe(e) && !e.completed;
    const ty = typeOf(e); if (ty === 'holidays') return false;
    return GENERAL.has(ty) || forMe(e);
  });
  const done = doneMap();
  const shared = fevs().filter((e) => e.date >= t && e.date <= end).map((e) => ({...e, done: !!done[e.id]?.completed, doneBy: done[e.id]?.by}));
  const list = [...mine.map((item) => ({type:'cal', item, d: item.date < t ? t : item.date})), ...shared.map((item) => ({type:'fev', item, d:item.date}))]
    .sort((a, b) => a.d.localeCompare(b.d) || (a.type === 'fev' && a.item.kind !== 'other' ? '05:00' : a.item.time || '99:99').localeCompare(b.type === 'fev' && b.item.kind !== 'other' ? '05:00' : b.item.time || '99:99') || a.item.title.localeCompare(b.item.title, 'de'));
  return {t, mine, list, tasks: mine.filter((e) => e.kind === 'task'), events: mine.filter((e) => e.kind === 'event'),
    bdays: mine.filter((e) => e.kind === 'event' && (typeOf(e) === 'birthday' || /geburtstag/i.test(e.title))), count: list.filter((x) => x.type === 'cal' || !x.item.done).length};
}
function datePill(d, t, e) {
  if (e && e.endDate && e.endDate > e.date) {
    const w = (s) => fmt(s, {weekday:'short'}).replace('.', ''), dm = (s) => fmt(s, {day:'2-digit', month:'2-digit'});
    if (e.date <= t && e.endDate >= t) return `<span class="pill"><b>Bis ${w(e.endDate)}</b>${dm(e.endDate)}</span>`;
    return `<span class="pill"><b>${w(e.date)}–${w(e.endDate)}</b>${dm(e.date)}</span>`;
  }
  const diff = Math.round((pd(d) - pd(t)) / 864e5);
  return `<span class="pill ${diff === 0 ? 'pill--today' : ''}"><b>${diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : fmt(d, {weekday:'short'})}</b>${fmt(d, {day:'2-digit', month:'short'})}</span>`;
}
function viewHome() {
  const h = homeData(), hr = new Date().getHours();
  const greet = hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Guten Tag' : 'Guten Abend', emo = hr < 11 ? '🌤️' : hr < 18 ? '☀️' : '🌙';
  const team = D.group?.kind === 'team';
  const rowsHtml = h.list.map(({type, item: e, d}) => {
    if (type === 'fev') {
      const c = feedColor(e), waste = e.kind !== 'other';
      return `<div class="lrow ${e.done ? 'lrow--done' : ''}">
        <button class="ckb ${e.done ? 'ckb--on' : ''}" style="--c:${c}" data-act="fev-done" data-id="${e.id}" aria-label="${esc(e.title)}: ${e.done ? 'Bestätigung zurücknehmen' : waste ? 'als rausgestellt bestätigen' : 'als erledigt markieren'}">${ic('check')}</button>
        <div class="lrow__main" data-act="goto" data-date="${e.date}" data-tab="shared"><b>${esc(e.title)}</b><small>${waste ? 'Müllabholung' : 'Gemeinsamer Termin'} · ${esc(feedName(e.feed))}${e.time ? ' · ' + e.time + ' Uhr' : ''}${e.done && e.doneBy ? ' · ✓ ' + esc(mname(e.doneBy)) : ''}</small></div>
        ${datePill(d, h.t)}<span class="bin" style="--c:${c}">${ic('bin')}</span>${ic('right', 'chev')}</div>`;
    }
    const cols = peopleColors(e), c = e.kind === 'task' ? mcolor(ME.id) : (EVENT_TYPES.find((x) => x.id === typeOf(e))?.c.replace('rainbow', '#e0a93b'));
    return `<div class="lrow">
      <button class="ckb" style="--c:${c}" data-act="home-check" data-id="${e.id}" aria-label="${esc(e.title)} erledigen">${ic('check')}</button>
      <div class="lrow__main" data-act="thread" data-coll="cal" data-id="${e.id}"><b>${esc(e.title)}</b><small>${e.kind === 'task' ? 'Auftrag' : esc(EVENT_TYPES.find((x) => x.id === typeOf(e)).label)} · ${esc(peopleLabel(e))}${e.time ? ' · ' + e.time + ' Uhr' : ''}</small>${threadBadges(threadOf('cal', e))}</div>
      ${datePill(d, h.t, e)}<span class="dots">${cols.slice(0, 4).map((x) => `<span class="dot" style="--c:${x}"></span>`).join('')}</span>${ic('right', 'chev')}</div>`;
  }).join('');
  return `<div class="home-top">
    <section class="card hero"><div class="eyebrow">${esc(fmt(h.t, {weekday:'short', day:'2-digit', month:'2-digit'}))}</div>
      <h1>${greet},<br>${esc(ME.name)} ${emo}</h1>
      <p>Schön, dass du da bist! In den nächsten sieben Tagen ${h.count === 1 ? 'steht 1 Sache' : 'stehen ' + h.count + ' Dinge'} an. Du schaffst das!</p>
      <div class="av-stack">${D.members.slice(0, 4).map((m) => avatar(m, 'av--sm')).join('')}</div></section>
    <div class="stats">
      <div class="card stat"><div class="ic" style="background:var(--green2);color:var(--green)">${ic('task')}</div><b>${h.tasks.length}</b><strong>Aufträge</strong><small>Nächste 7 Tage</small></div>
      <div class="card stat"><div class="ic" style="background:var(--blue2);color:var(--blue)">${ic('cal')}</div><b>${h.events.length}</b><strong>Termine</strong><small>Nächste 7 Tage</small></div>
      <div class="card stat"><div class="ic" style="background:var(--red2);color:var(--pink)">${ic('gift')}</div><b>${h.bdays.length}</b><strong>Geburtstage</strong><small>Diese Woche</small></div>
      <div class="card stat stat--quote"><div class="ic" style="background:var(--red2);color:var(--pink)">${ic('heart')}</div>${team ? 'Klare Aufgaben.<br>Starkes Team.' : 'Kleine Momente.<br>Gemeinsam geschafft.'}</div>
    </div></div>
    <div class="section-h"><h2>Meine Termine &amp; Aufträge – die nächsten 7 Tage</h2><button class="link" data-act="nav" data-view="kalender">Kalender ›</button></div>
    <div class="card list">${rowsHtml || `<div class="empty"><b>In den nächsten 7 Tagen steht nichts an</b>Genieß die freie Zeit – oder plane etwas im Kalender.</div>`}</div>`;
}

// ---------- Kalender ----------
function monthCells(m) {
  const y = m.getFullYear(), mo = m.getMonth(), dim = new Date(y, mo+1, 0).getDate(), off = (new Date(y, mo, 1).getDay() + 6) % 7, n = Math.ceil((off + dim) / 7) * 7;
  return Array.from({length:n}, (_, i) => { const d = new Date(y, mo, i - off + 1, 12); return {key: ymd(d), n: d.getDate(), cur: d.getMonth() === mo, mon: d.getDay() === 1}; });
}
function chipFor(e, day, isMon) {
  const ty = typeOf(e), cont = e.date < day && !isMon;
  let c, cls = 'chip', pre = '';
  if (ty === 'holidays') { cls += ' chip--rainbow'; c = '#e0a93b'; }
  else if (ty === 'birthday') { c = '#e46d8c'; pre = '🎂'; }
  else if (ty === 'other') c = '#8a99a8';
  else { const cols = peopleColors(e); c = cols.length === 1 ? cols[0] : cols.length ? '#5f7d99' : '#8a99a8'; }
  if (e.kind === 'task') pre = e.completed ? '✓' : '☐';
  if (e.completed) cls += ' chip--done';
  if (e.date < day) cls += ' chip--cont';
  const multiC = (e.people || []).length > 1 || (e.people || []).includes('all');
  const style = multiC && !GENERAL.has(ty) ? `--c:${c};border-left:0;box-shadow:inset 3px 0 0 0 ${c}` : `--c:${c}`;
  const stripes = multiC && !GENERAL.has(ty) ? peopleColors(e).slice(0, 4).map((x) => `<span class="dot" style="--c:${x};width:5px;height:5px"></span>`).join('') : '';
  return `<span class="${cls}" style="${style}">${stripes ? `<span class="dots" style="gap:1px">${stripes}</span>` : ''}${pre ? `<i>${pre}</i>` : ''}<span>${cont ? '' : esc(e.title)}${cont ? '&nbsp;' : ''}</span></span>`;
}
function viewCalendar() {
  const t = todayS(), items = calItems(), shared = UI.tab === 'shared', done = doneMap();
  const todayIt = items.filter((e) => covers(e, t));
  const cells = monthCells(UI.month), cnt = innerWidth >= 700 ? 4 : 3;
  const fv = shared ? fevs() : [];
  const grid = cells.map((c) => {
    let chips = '', list = [], dotsHtml = '';
    if (!shared) {
      list = sortItems(items.filter((e) => covers(e, c.key)));
      chips = list.slice(0, cnt).map((e) => chipFor(e, c.key, c.mon)).join('');
      const ppl = [...new Set(list.flatMap((e) => isGeneral(e) ? [] : (e.people || []).includes('all') ? [] : e.people))].slice(0, 4);
      dotsHtml = ppl.map((p) => `<span class="dot" style="--c:${mcolor(p)}"></span>`).join('');
    } else {
      list = fv.filter((e) => covers(e, c.key)).sort((a, b) => a.title.localeCompare(b.title));
      chips = list.slice(0, cnt).map((e) => `<span class="chip ${done[e.id]?.completed ? 'chip--done' : ''}" style="--c:${feedColor(e)}"><i>${e.kind !== 'other' ? '🗑' : '•'}</i><span>${esc(e.kind !== 'other' ? WASTE[e.kind].s : e.title)}</span></span>`).join('');
    }
    const more = list.length > cnt ? `<span class="more">+${list.length - cnt} mehr</span>` : '';
    return `<button class="cday ${c.cur ? '' : 'cday--other'} ${c.key === t ? 'cday--today' : ''} ${c.key === UI.sel ? 'cday--sel' : ''}" data-act="day" data-date="${c.key}" aria-label="${esc(fmtLong(c.key))}, ${plural(list.length, shared ? 'Abholung/Termin' : 'Eintrag', shared ? 'Abholungen/Termine' : 'Einträge')}">
      <span class="cday__n">${c.n}</span>${chips}${more}<span class="cday__dots">${dotsHtml}</span></button>`;
  }).join('');
  return `<section class="card today"><div><h2>Heute</h2><div class="small muted">${esc(fmtLong(t))}</div></div>
      <div class="cnt"><span style="background:var(--green2);color:var(--green)">${plural(todayIt.filter((e) => e.kind === 'task').length, 'Auftrag', 'Aufträge')}</span><span style="background:var(--blue2);color:var(--blue)">${plural(todayIt.filter((e) => e.kind === 'event').length, 'Termin', 'Termine')}</span></div></section>
    <div class="seg" role="tablist"><button role="tab" aria-selected="${!shared}" data-act="cal-tab" data-tab="main">${ic('cal')} Termine &amp; Aufträge</button><button role="tab" aria-selected="${shared}" data-act="cal-tab" data-tab="shared">${ic('bin')} Müll &amp; Gemeinsam</button></div>
    <div class="cal-wrap"><div>
      <div class="mtool"><h2>${esc(fmtMonth(UI.month))}</h2>
        <button class="icon-btn" data-act="month" data-d="-1" aria-label="Vorheriger Monat">${ic('left')}</button>
        <button class="icon-btn" data-act="month" data-d="1" aria-label="Nächster Monat">${ic('right')}</button>
        <button class="icon-btn" style="background:var(--blue);color:#fff;border:0" data-act="${shared ? 'fev-new' : 'new-event'}" data-date="${UI.sel}" aria-label="Eintrag hinzufügen">${ic('plus')}</button></div>
      <div class="card cal" id="calgrid"><div class="cal-wd">${WD.map((w) => `<span>${w}</span>`).join('')}</div><div class="cal-days">${grid}</div></div>
      ${!shared ? `<div class="legend card" style="margin-top:10px;border-radius:14px">${D.members.map((m) => `<span class="pchip"><span class="dot" style="--c:${m.color}"></span>${esc(m.name)}</span>`).join('')}<span class="pchip"><span class="chip chip--rainbow" style="--c:#e0a93b;padding:0 6px">Ferien</span></span></div>` : ''}
    </div>
    <aside class="card daypanel" id="daypanel">${shared ? sharedDayPanel() : dayPanel()}</aside></div>
    ${shared ? feedsPanel() : ''}`;
}
function dayPanel() {
  const d = UI.sel, list = sortItems(calItems().filter((e) => covers(e, d)));
  return `<div class="dp-head"><div class="eyebrow">Ausgewählter Tag</div><h3>${esc(fmtLong(d))}</h3><div class="small muted">${plural(list.length, 'Eintrag', 'Einträge')}</div>
      <div class="row" style="margin-top:12px"><button class="btn btn--soft btn--sm" data-act="new-event" data-date="${d}">${ic('cal')} Termin</button><button class="btn btn--softgreen btn--sm" data-act="new-task" data-date="${d}">${ic('task')} Auftrag</button></div></div>
    ${list.length ? list.map((e) => {
      const cols = peopleColors(e), c = cols.length === 1 ? cols[0] : typeOf(e) === 'holidays' ? '#e0a93b' : typeOf(e) === 'birthday' ? '#e46d8c' : cols.length ? '#5f7d99' : '#8a99a8';
      const ty = EVENT_TYPES.find((x) => x.id === typeOf(e));
      return `<div class="irow ${e.completed ? 'irow--done' : ''}" style="--c:${c}">
        ${e.kind === 'task' ? `<button class="ckb ${e.completed ? 'ckb--on' : ''}" style="--c:var(--green)" data-act="task-toggle" data-id="${e.id}" aria-label="${e.completed ? 'Als offen markieren' : 'Als erledigt markieren'}">${ic('check')}</button>` : `<span class="ic-ev">${typeOf(e) === 'birthday' ? '🎂' : ic('cal')}</span>`}
        <div class="irow__main" data-act="thread" data-coll="cal" data-id="${e.id}" role="button" tabindex="0" aria-label="${esc(e.title)} öffnen"><b>${esc(e.title)}</b><div class="meta">${threadBadges(threadOf('cal', e), true)}${e.time ? `<span>${e.time} Uhr</span>` : ''}${multi(e) ? `<span>${fmt(e.date, {day:'2-digit', month:'2-digit'})}–${fmt(e.endDate, {day:'2-digit', month:'2-digit'})}</span>` : ''}<span>${e.kind === 'task' ? 'Auftrag' : esc(ty.label)}</span>${personDots(e) || `<span>${esc(peopleLabel(e))}</span>`}${e.completed && e.completedBy ? `<span>✓ ${esc(mname(e.completedBy))}</span>` : ''}</div>${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</div>
        <button class="edit" data-act="edit" data-id="${e.id}" aria-label="${esc(e.title)} bearbeiten">${ic('edit')}</button></div>`;
    }).join('') : `<div class="empty"><b>Noch nichts geplant</b>Lege direkt einen Termin oder Auftrag für diesen Tag an.</div>`}`;
}
function sharedDayPanel() {
  const d = UI.sel, done = doneMap(), list = fevs().filter((e) => covers(e, d)).sort((a, b) => a.title.localeCompare(b.title));
  return `<div class="dp-head"><div class="eyebrow">Ausgewählter Tag</div><h3>${esc(fmtLong(d))}</h3><div class="small muted">${plural(list.length, 'Abholung/Termin', 'Abholungen/Termine')}</div>
      <div class="row" style="margin-top:12px"><button class="btn btn--soft btn--sm" data-act="fev-new" data-date="${d}">${ic('plus')} Müll-Termin eintragen</button></div></div>
    ${list.length ? list.map((e) => {
      const st = done[e.id], waste = e.kind !== 'other', c = feedColor(e);
      return `<div class="irow ${st?.completed ? 'irow--done' : ''}" style="--c:${c}"><span class="bin" style="--c:${c}">${ic('bin')}</span>
        <div class="irow__main"><b>${esc(waste && e.feed !== 'manual' ? WASTE[e.kind].t + (norm(e.title) !== norm(WASTE[e.kind].t) ? ' · ' + e.title : '') : e.title)}</b>
          <div class="meta"><span>${esc(feedName(e.feed))}</span>${e.time ? `<span>${e.time} Uhr</span>` : ''}</div>
          <div class="meta">${st?.completed ? `<span style="color:var(--green);font-weight:650">${waste ? 'Rausgestellt' : 'Erledigt'} von ${esc(mname(st.by))}</span>` : `<span>${waste ? 'Noch nicht als rausgestellt bestätigt' : 'Noch nicht erledigt'}</span>`}</div>
          ${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}${e.location ? `<div class="note">📍 ${esc(e.location)}</div>` : ''}</div>
        ${e.feed === 'manual' ? `<button class="edit" data-act="fev-edit" data-id="${e.id}" aria-label="${esc(e.title)} bearbeiten">${ic('edit')}</button>` : ''}
        <button class="ckb ${st?.completed ? 'ckb--on' : ''}" style="--c:${c}" data-act="fev-done" data-id="${e.id}" aria-label="${esc(e.title)}: ${st?.completed ? 'Bestätigung zurücknehmen' : waste ? 'als rausgestellt bestätigen' : 'als erledigt markieren'}">${ic('check')}</button></div>`;
    }).join('') : `<div class="empty"><b>Keine Abholung</b>An diesem Tag steht im gemeinsamen Kalender nichts an.</div>`}`;
}
function feedsPanel() {
  const f = feeds();
  return `<div class="section-h"><h2>Kalenderquellen</h2></div>
    <div class="card list">${f.map((x) => `<div class="feed"><span class="bin" style="--c:${x.color}">${ic(x.type === 'url' ? 'link' : 'upload')}</span>
      <div class="grow"><b>${esc(x.name)}</b><div class="small muted">${x.type === 'url' ? 'Abo (tägliche Aktualisierung)' : 'Hochgeladene ICS-Datei'} · ${plural(x.count || 0, 'Termin', 'Termine')}${x.lastSync ? ' · Stand ' + new Date(x.lastSync).toLocaleString('de-DE', {day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'}) : ''}</div>${x.error ? `<div class="small" style="color:var(--red)">${esc(x.error)}</div>` : ''}</div>
      <button class="edit" data-act="feed-refresh" data-id="${x.id}" aria-label="${esc(x.name)} aktualisieren">${ic('sync')}</button>
      <button class="edit" data-act="feed-delete" data-id="${x.id}" aria-label="${esc(x.name)} entfernen">${ic('trash')}</button></div>`).join('') || `<div class="empty"><b>Noch keine Quelle</b>Lade einen Abfuhrkalender oder andere Termine als ICS-Datei hoch – oder abonniere einen Kalender-Link. Die Termine sehen alle in der Gruppe.</div>`}</div>
    <div class="row wrap" style="margin-top:10px"><button class="btn btn--sm" data-act="feed-upload">${ic('upload')} ICS-Datei hochladen</button><button class="btn btn--ghost btn--sm" data-act="feed-url">${ic('link')} ICS-Link abonnieren</button></div>
    <p class="small muted">Tipp: Viele Städte bieten den Abfuhrkalender als „iCal/ICS“ zum Download an. Tonnen (Rest, Bio, Gelb, Papier) werden automatisch erkannt.</p>`;
}

// ---------- To-do ----------
function viewTodo() {
  const pool = rows('todo').map((r) => ({...r.data, id:r.id, rev:r.rev, at:r.at})).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const shopN = rows('shop').length;
  return `<div class="todo-head"><div><div class="eyebrow">Gemeinsam anpacken</div><h1>Offene To-dos</h1><div class="small muted">Hier landet alles, das noch keine Person und keinen festen Tag hat.</div></div><span class="count">${pool.length}</span></div>
    <button class="card shopcard" data-act="nav" data-view="einkauf" aria-label="Einkaufsliste öffnen, ${plural(shopN, 'Artikel', 'Artikel')}"><span class="ic">🛒</span><span class="grow"><b style="display:block;font-size:16px">Einkaufsliste</b><span class="small muted">Gemeinsam sammeln, gemeinsam abhaken</span></span><span class="count" style="background:var(--green2);color:var(--green)">${shopN}</span>${ic('right', 'chev')}</button>
    <div class="newtiles">
      <button class="card newtile" data-act="todo-new" data-kind="task"><span class="badge badge--task">${ic('task')} Auftrag</span><b>Offen eintragen +</b><span class="small muted">Noch ohne Person und Datum</span></button>
      <button class="card newtile" data-act="todo-new" data-kind="event"><span class="badge">${ic('cal')} Termin</span><b>Offen eintragen +</b><span class="small muted">Jemand kann ihn übernehmen</span></button></div>
    <div class="section-h"><h2>Kann jemand übernehmen?</h2><span class="small muted">${pool.length ? plural(pool.length, 'offener Eintrag', 'offene Einträge') : 'Gerade ist alles verteilt'}</span></div>
    ${pool.map((e) => `<div class="card tcard tcard--${e.kind}"><span class="ic-ev" style="${e.kind === 'task' ? 'background:var(--green2);color:var(--green)' : ''}">${ic(e.kind === 'task' ? 'task' : 'cal')}</span>
      <div class="tcard__body" data-act="thread" data-coll="todo" data-id="${e.id}" role="button" tabindex="0"><span class="tcard__type">${e.kind === 'task' ? 'AUFTRAG' : 'TERMIN'}</span><b>${esc(e.title)}</b>${e.note ? `<div class="small muted">${esc(e.note)}</div>` : ''}<div class="small muted row" style="gap:6px;margin-top:4px">Eingetragen von <span class="pchip"><span class="dot" style="--c:${mcolor(e.createdBy)}"></span>${esc(mname(e.createdBy))}</span></div>${threadBadges(threadOf('todo', e))}</div>
      <button class="btn btn--sm ${e.kind === 'task' ? 'btn--green' : ''}" data-act="todo-take" data-id="${e.id}">Übernehmen</button>
      <button class="edit" data-act="todo-del" data-id="${e.id}" aria-label="${esc(e.title)} entfernen">${ic('trash')}</button></div>`).join('') || `<div class="card empty"><b>Alles verteilt</b>Neue offene Aufträge und Termine erscheinen hier für die ganze Gruppe.</div>`}`;
}
function viewShop() {
  const items = rows('shop').map((r) => ({...r.data, id:r.id, at:r.at})).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  return `<div class="todo-head"><div><button class="link" data-act="nav" data-view="todo" aria-label="Zurück zu To-do">‹ Zurück zu To-do</button><div class="eyebrow" style="margin-top:8px">Gemeinsam einkaufen</div><h1>Einkaufsliste</h1></div><span class="count" style="background:var(--green2);color:var(--green)">${items.length}</span></div>
    <form class="shopbar" data-form="shop-add" autocomplete="off"><input id="shop-input" name="label" maxlength="120" placeholder="Was brauchen wir?" aria-label="Artikel suchen oder eingeben" data-input="shop"><button type="submit" id="shop-addbtn" aria-label="Eingabe zur Einkaufsliste hinzufügen" disabled>${ic('plus')}</button></form>
    <div id="shop-suggest"></div>
    <div class="section-h"><h2>Auf der Liste</h2><span class="small muted">${items.length ? 'Beim Einkauf antippen und abhaken' : 'Noch nichts eingetragen'}</span></div>
    <div class="card">${items.length ? `<div class="shopgrid">${items.map((e) => { const p = CAT_BY.get(e.productKey) || detectProduct(e.label); const m = member(e.addedBy);
      return `<button class="stile" data-act="shop-check" data-id="${e.id}" aria-label="${esc(e.label)} abhaken"><span class="em">${p?.emoji ?? '🛒'}</span><b>${esc(e.label)}</b>${m ? `<span class="av av--xs" style="--c:${m.color};color:${readable(m.color)}">${m.avatar ? `<img src="${esc(m.avatar)}" alt="">` : esc(m.name[0])}</span>` : ''}</button>`; }).join('')}</div>`
      : `<div class="empty"><b>Die Liste ist leer</b>Gib oben ein, was ihr beim nächsten Einkauf braucht.</div>`}</div>`;
}
function updateShopSuggest() {
  const inp = $('#shop-input'), box = $('#shop-suggest'), btn = $('#shop-addbtn'); if (!inp || !box) return;
  const v = inp.value.trim(); btn.disabled = !v;
  if (!v) { box.innerHTML = ''; return; }
  const p = detectProduct(v);
  box.innerHTML = `<button class="card suggest" data-act="shop-suggest"><span class="em">${p?.emoji ?? '🛒'}</span><span class="grow"><b>„${esc(v)}“ hinzufügen</b><div class="small muted">${p ? 'Wird als ' + esc(p.label) + ' erkannt' : 'Freier Artikel'}</div></span>${ic('plus')}</button>`;
}

// ---------- Gruppe ----------
function viewGroup() {
  const g = D.group || GROUPS.find((x) => x.id === G); if (!g) return '';
  const admin = isAdmin(), owner = myRole() === 'owner';
  const roleL = {owner:'Besitzer', admin:'Admin', member:'Mitglied'};
  return `<div class="todo-head"><div><div class="eyebrow">${kindLabel(g.kind)}</div><h1>${esc(g.name)}</h1><div class="small muted">${plural(D.members.length, 'Mitglied', 'Mitglieder')} · Alles wird automatisch für alle gespeichert.</div></div></div>
    <section class="card gcard"><button class="gimg" ${admin ? 'data-act="group-image"' : 'disabled'} aria-label="Gruppenbild ändern">${groupBadge(g, 'av--xl')}${admin ? `<span class="cam">${ic('camera')}</span>` : ''}</button>
      <div class="grow"><b style="font-size:18px">${esc(g.name)}</b><div class="small muted">${kindLabel(g.kind)} · deine Rolle: ${roleL[myRole()]}</div>
      <div class="row wrap" style="margin-top:10px">${admin ? `<button class="btn btn--sm" data-act="invite">${ic('share')} Einladen</button><button class="btn btn--ghost btn--sm" data-act="group-edit">${ic('edit')} Bearbeiten</button>` : ''}</div></div></section>
    <div class="section-h"><h2>Mitglieder</h2><button class="link" data-act="nav" data-view="einstellungen">Meine Farbe ›</button></div>
    <div class="card list">${D.members.map((m) => `<div class="mrow">${avatar(m)}<div class="grow"><b>${esc(m.name)}${m.id === ME.id ? ' <span class="small muted">(du)</span>' : ''}</b><div class="small muted row" style="gap:6px"><span class="dot" style="--c:${m.color}"></span>Farbe im Kalender</div></div>
      <span class="role role--${m.role}">${roleL[m.role]}</span>${(owner || (myRole() === 'admin' && m.role === 'member')) && m.id !== ME.id ? `<button class="edit" data-act="member-menu" data-id="${m.id}" aria-label="${esc(m.name)} verwalten">${ic('gear')}</button>` : ''}</div>`).join('')}</div>
    ${admin ? `<div class="section-h"><h2>Offene Einladungen</h2></div><div class="card list">${(D.invites || []).map((i) => `<div class="mrow"><span class="ic-ev">${ic('link')}</span><div class="grow"><b>Link vom ${new Date(i.created_at).toLocaleDateString('de-DE')}</b><div class="small muted">gültig bis ${new Date(i.expires_at).toLocaleDateString('de-DE')} · ${i.uses}/${i.max_uses} genutzt</div></div>
      <button class="edit" data-act="invite-copy" data-token="${i.token}" aria-label="Link kopieren">${ic('share')}</button><button class="edit" data-act="invite-revoke" data-token="${i.token}" aria-label="Einladung zurückziehen">${ic('trash')}</button></div>`).join('') || `<div class="empty">Keine offenen Einladungen. Tippe auf „Einladen“, um einen Link zu teilen.</div>`}</div>` : ''}
    <div class="section-h"><h2>Meine Gruppen</h2></div>
    <div class="card pad">${GROUPS.map((x) => `<button class="gitem" aria-checked="${x.id === G}" data-act="group-select" data-id="${x.id}">${groupBadge(x, 'av--sm')}<span class="grow"><b>${esc(x.name)}</b><div class="small muted">${kindLabel(x.kind)} · ${plural(x.count, 'Mitglied', 'Mitglieder')}</div></span>${x.id === G ? ic('check') : ''}</button>`).join('')}
      <div class="row wrap"><button class="btn btn--soft btn--sm" data-act="group-new">${ic('plus')} Neue Gruppe</button><button class="btn btn--ghost btn--sm" data-act="join-link">${ic('link')} Per Link beitreten</button></div></div>
    <div class="danger-zone">${owner ? `<button class="btn btn--dangerghost" data-act="group-delete">Gruppe löschen</button>` : ''}<button class="btn btn--dangerghost" data-act="group-leave">Gruppe verlassen</button></div>`;
}

// ---------- Einstellungen ----------
function viewSettings() {
  const m = member(ME.id) || {...ME, color:'#467ba6'}, g = D.group;
  const custom = !PALETTE.includes(m.color);
  const others = Object.values(ACC.list).filter((a) => a.id !== ME.id);
  return `<div class="todo-head"><div><div class="eyebrow">Einstellungen</div><h1>Konto &amp; Farbe</h1></div></div>
    <section class="card pad"><h2 style="font-size:17px">Meine Farbe in „${esc(g?.name || '')}“</h2><p class="small muted" style="margin:4px 0 10px">So erkennen alle deine Termine und Aufträge im Kalender. Jede Gruppe kann eine eigene Farbe haben.</p>
      <div class="palette" role="radiogroup" aria-label="Farbe wählen">${PALETTE.map((c) => `<button class="swatch" style="--c:${c}" role="radio" aria-checked="${m.color === c}" data-act="color" data-color="${c}" aria-label="Farbe ${c}">${ic('check')}</button>`).join('')}</div>
      <div class="colorpick"><input type="color" id="f-color" value="${esc(m.color)}" data-input="color" aria-label="Eigene Farbe wählen"><span class="small ${custom ? '' : 'muted'}">${custom ? 'Eigene Farbe aktiv' : 'Eigene Farbe wählen'}</span>
        <span class="chip" style="--c:${m.color};margin-left:auto;font-size:12px;padding:3px 8px">Vorschau: ${esc(ME.name)}</span></div></section>
    <section class="card pad" style="margin-top:14px"><h2 style="font-size:17px;margin-bottom:12px">Mein Konto</h2>
      <div class="photo-pick"><button class="gimg" data-act="avatar" aria-label="Profilbild ändern">${avatar(m, 'av--xl')}<span class="cam">${ic('camera')}</span></button>
        <div class="grow"><b style="font-size:17px">${esc(ME.name)}</b><div class="small muted">Profilbild: Tippe auf das Bild, um ein eigenes Foto hochzuladen.</div>${ME.avatar ? `<button class="link" data-act="avatar-remove" style="margin-top:6px">Bild entfernen</button>` : ''}</div></div>
      <form data-form="acc-name"><div class="field"><label for="f-newname">Name</label><div class="row"><input class="input" id="f-newname" name="name" maxlength="24" value="${esc(ME.name)}"><button class="btn btn--ghost btn--sm" type="submit">Speichern</button></div></div></form>
      <form data-form="acc-pass"><div class="lbl" style="margin-bottom:6px">Passwort ändern</div>
        <div class="field"><input class="input" name="old" type="password" autocomplete="current-password" placeholder="Bisheriges Passwort"></div>
        <div class="two"><input class="input" name="pass" type="password" autocomplete="new-password" placeholder="Neues Passwort"><input class="input" name="pass2" type="password" autocomplete="new-password" placeholder="Wiederholen"></div>
        <button class="btn btn--ghost btn--sm" style="margin-top:10px" type="submit">Passwort ändern</button><div class="small muted" style="margin-top:6px">Andere Geräte werden danach abgemeldet.</div></form></section>
    ${pushSection()}
    <section class="card pad" style="margin-top:14px"><h2 style="font-size:17px;margin-bottom:10px">Konten auf diesem Gerät</h2>
      ${others.map((a) => `<button class="gitem" data-act="acc-switch" data-id="${a.id}">${avatar({...a, color:'#467ba6'}, 'av--sm')}<span class="grow"><b>${esc(a.name)}</b><div class="small muted">${a.token ? 'Angemeldet – direkt wechseln' : 'Passwort nötig'}</div></span>${ic('right', 'chev')}</button>`).join('')}
      <button class="btn btn--ghost btn--sm" data-act="acc-add">${ic('plus')} Weiteres Konto anmelden</button></section>
    <div class="danger-zone"><button class="btn btn--ghost" data-act="logout">${ic('logout')} Abmelden</button><button class="btn btn--dangerghost" data-act="acc-delete">Konto löschen</button>
      <p class="small muted" style="text-align:center">Responsible ${VERSION} · <button class="link" data-act="hard-reload">App neu laden</button></p></div>`;
}
