// Responsible – Backend (Supabase Edge Function "responsible")
// Konten (Name + Passwort, PBKDF2, Bearer-Sitzungen, Sperre) wie HopfenMatch; Gruppen (Familie/Team) mit Rollen,
// Farben und Einladungslinks; synchronisierte Datensätze (rs_item) mit Revisionsprüfung; ICS-Import/-Abo.
// Nutzt ausschließlich rs_*-Tabellen und den Storage-Bucket "responsible".
import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const db = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BUCKET = "responsible";
const ITER = 100000, MAX_BODY = 4 * 1024 * 1024, SESSION_DAYS = 90;
const NAME_RE = /^[\p{L}\p{N}](?:[\p{L}\p{N} ._'-]{0,22}[\p{L}\p{N}])?$/u;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/, TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EVENT_TYPES = ["private", "work", "vacation", "holidays", "birthday", "other"];
const GENERAL_TYPES = ["holidays", "birthday", "other"];
const WASTE_KINDS = ["rest", "bio", "yellow", "paper", "other"];
const PALETTE = ["#467ba6", "#d9778f", "#36a78a", "#e0a93b", "#8a6fd1", "#e2725b", "#3aa6c9", "#7a9a3a", "#c45ab3", "#5b6b7d", "#d4a017", "#2f9e6e"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
// Erwartbare Fehler mit HTTP 200 + code (keine Browser-Konsolenfehler)
const err = (error: string, code: number, extra: Record<string, unknown> = {}) => json({ error, code, ...extra });
const must = <T>(r: { data: T; error: unknown }) => { if (r.error) throw r.error; return r.data; };
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));
const rnd = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

// ---- Passwörter ----
async function pbkdf2(pass: string, salt: string, iter: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(salt), iterations: iter }, key, 256));
}
function same(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function hashNew(pass: string) { const salt = rnd(16); return { salt, iter: ITER, pass_hash: await pbkdf2(pass, salt, ITER) }; }
async function verify(u: any, pass: string) { return same(await pbkdf2(String(pass), u.salt, u.iter), u.pass_hash); }
const normName = (s: unknown) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
function nameProblem(n: string) {
  if (n.length < 2) return "Der Name braucht mindestens 2 Zeichen.";
  if (n.length > 24) return "Der Name darf höchstens 24 Zeichen haben.";
  if (!NAME_RE.test(n)) return "Erlaubt sind Buchstaben, Ziffern, Leerzeichen sowie . _ - '";
  return null;
}
function passProblem(p: unknown) {
  if (typeof p !== "string" || p.length < 4) return "Das Passwort braucht mindestens 4 Zeichen.";
  if (p.length > 72) return "Das Passwort ist zu lang (max. 72 Zeichen).";
  return null;
}

// ---- Rate-Limit (persistent in rs_fail) ----
const WIN = 10 * 60e3;
async function limited(keys: string[], max: number) {
  const rows = must(await db.from("rs_fail").select("k,n,t").in("k", keys)) as any[];
  return rows.some((r) => r.n >= max && Date.now() - Date.parse(r.t) < WIN);
}
async function bump(keys: string[]) {
  const rows = must(await db.from("rs_fail").select("k,n,t").in("k", keys)) as any[];
  const now = new Date().toISOString();
  must(await db.from("rs_fail").upsert(keys.map((k) => { const r = rows.find((x) => x.k === k); return { k, n: r && Date.now() - Date.parse(r.t) < WIN ? r.n + 1 : 1, t: now }; })));
}
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for")?.split(",")[0] || "?").trim();

// ---- Sitzungen ----
async function newSession(id: string) { const token = rnd(32); must(await db.from("rs_session").insert({ token, usr: id })); return token; }
async function auth(req: Request): Promise<{ id: string; token: string } | null> {
  const h = req.headers.get("authorization") || "";
  const t = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!t || t.length < 40) return null;
  const r = must(await db.from("rs_session").select("usr,seen_at").eq("token", t).maybeSingle()) as any;
  if (!r) return null;
  const age = Date.now() - Date.parse(r.seen_at);
  if (age > SESSION_DAYS * 864e5) { await db.from("rs_session").delete().eq("token", t); return null; }
  if (age > 6 * 3600e3) await db.from("rs_session").update({ seen_at: new Date().toISOString() }).eq("token", t);
  return { id: r.usr, token: t };
}

// ---- Bilder (Storage) ----
async function storeImage(prefix: string, dataUrl: unknown, old?: string | null): Promise<string | null | undefined> {
  if (dataUrl === null) { await removeImage(old); return null; }
  if (typeof dataUrl !== "string") return undefined;
  const m = dataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m || m[2].length > 900 * 1024) return undefined;
  const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
  const path = `${prefix}/${rnd(10)}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  const up = await db.storage.from(BUCKET).upload(path, bytes, { contentType: "image/" + m[1], upsert: false, cacheControl: "31536000" });
  if (up.error) throw up.error;
  await removeImage(old);
  return `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
}
async function removeImage(url?: string | null) {
  if (!url) return;
  const i = url.indexOf(`/public/${BUCKET}/`);
  if (i >= 0) await db.storage.from(BUCKET).remove([url.slice(i + BUCKET.length + 9)]).catch(() => {});
}

// ---- Gruppen ----
async function membership(g: string, me: string) {
  if (!g || typeof g !== "string") return null;
  return must(await db.from("rs_member").select("role,color").eq("grp", g).eq("usr", me).maybeSingle()) as { role: string; color: string } | null;
}
async function freeColor(g: string) {
  const used = (must(await db.from("rs_member").select("color").eq("grp", g)) as any[]).map((r) => r.color.toLowerCase());
  return PALETTE.find((c) => !used.includes(c)) ?? PALETTE[used.length % PALETTE.length];
}
async function myGroups(me: string) {
  const rows = must(await db.from("rs_member").select("role,color,rs_group(id,name,kind,image,owner)").eq("usr", me)) as any[];
  const ids = rows.map((r) => r.rs_group.id);
  const counts: Record<string, number> = {};
  if (ids.length) for (const m of must(await db.from("rs_member").select("grp").in("grp", ids)) as any[]) counts[m.grp] = (counts[m.grp] || 0) + 1;
  return rows.map((r) => ({ ...r.rs_group, role: r.role, color: r.color, count: counts[r.rs_group.id] || 1 })).sort((a, b) => a.name.localeCompare(b.name, "de"));
}
async function members(g: string) {
  const rows = must(await db.from("rs_member").select("usr,role,color,joined_at,rs_user(name,avatar)").eq("grp", g).order("joined_at")) as any[];
  return rows.map((r) => ({ id: r.usr, name: r.rs_user?.name ?? "?", avatar: r.rs_user?.avatar ?? null, color: r.color, role: r.role }));
}
async function deleteGroup(g: string) {
  const gr = must(await db.from("rs_group").select("image").eq("id", g).maybeSingle()) as any;
  await removeImage(gr?.image);
  must(await db.from("rs_group").delete().eq("id", g));
}

// ---- Datensätze ----
async function getItem(g: string, coll: string, id: string) {
  return must(await db.from("rs_item").select("coll,id,data,rev,deleted,updated_by,updated_at,seq").eq("grp", g).eq("coll", coll).eq("id", id).maybeSingle()) as any;
}
const pub = (r: any) => r && ({ coll: r.coll, id: r.id, data: r.data, rev: r.rev, deleted: r.deleted, by: r.updated_by, at: r.updated_at, seq: r.seq });
// Schreiben mit optimistischer Sperre: base = erwartete Revision (0/undefined = neu bzw. ohne Prüfung)
async function writeItem(g: string, coll: string, id: string, data: unknown, me: string, base?: number, del = false) {
  const cur = await getItem(g, coll, id);
  if (!cur) {
    if (del) return { ok: true, item: null };
    const ins = await db.from("rs_item").insert({ grp: g, coll, id, data, rev: 1, updated_by: me }).select().single();
    if (ins.error) { const c = await getItem(g, coll, id); return { ok: false, current: pub(c) }; }
    return { ok: true, item: pub(ins.data) };
  }
  if (typeof base === "number" && base > 0 && cur.rev !== base) return { ok: false, current: pub(cur) };
  if (typeof base === "number" && base === 0 && !cur.deleted) return { ok: false, current: pub(cur) };
  const up = must(await db.from("rs_item").update({ data: del ? null : data, deleted: del, rev: cur.rev + 1, updated_by: me }).eq("grp", g).eq("coll", coll).eq("id", id).eq("rev", cur.rev).select()) as any[];
  if (!up.length) return { ok: false, current: pub(await getItem(g, coll, id)) };
  return { ok: true, item: pub(up[0]) };
}
const ID_RE = /^[a-zA-Z0-9_.:-]{3,120}$/;

function validCal(d: any, memberIds: string[]) {
  if (!d || typeof d !== "object") return "Ungültiger Eintrag.";
  const kind = d.kind;
  if (kind !== "event" && kind !== "task") return "Unbekannte Art.";
  const title = str(d.title, 120); if (!title) return "Bitte einen Titel eingeben.";
  if (!DATE_RE.test(d.date)) return "Ungültiges Datum.";
  const o: any = { kind, title, date: d.date };
  if (d.endDate) { if (!DATE_RE.test(d.endDate) || d.endDate < d.date) return "Das Enddatum liegt vor dem Startdatum."; if (d.endDate !== d.date) o.endDate = d.endDate; }
  if (d.time) { if (!TIME_RE.test(d.time)) return "Ungültige Uhrzeit."; o.time = d.time; }
  const note = str(d.note, 1000); if (note) o.note = note;
  let people: string[] = Array.isArray(d.people) ? [...new Set(d.people.map(String))] as string[] : [];
  if (kind === "event") {
    o.eventType = EVENT_TYPES.includes(d.eventType) ? d.eventType : "private";
    if (GENERAL_TYPES.includes(o.eventType)) people = [];
    else if (!people.length) people = ["all"];
  } else {
    if (!people.length) return "Bitte mindestens eine zuständige Person wählen.";
    o.completed = !!d.completed;
    if (o.completed && d.completedBy && memberIds.includes(String(d.completedBy))) o.completedBy = String(d.completedBy);
  }
  if (people.includes("all")) people = ["all"];
  if (people.some((p) => p !== "all" && !memberIds.includes(p))) return "Unbekanntes Mitglied.";
  o.people = people;
  if (d.createdBy && memberIds.includes(String(d.createdBy))) o.createdBy = String(d.createdBy);
  if (d.fromTodo) o.fromTodo = true;
  return o;
}

// ---- ICS ----
function unfold(text: string) { return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n"); }
function icsUnescape(s: string) { return s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim(); }
type IcsVal = { v: string; p: Record<string, string> };
function parseLine(l: string): [string, IcsVal] | null {
  const i = l.indexOf(":"); if (i < 0) return null;
  const head = l.slice(0, i), v = l.slice(i + 1);
  const parts = head.split(";"); const name = parts[0].toUpperCase(); const p: Record<string, string> = {};
  for (const x of parts.slice(1)) { const j = x.indexOf("="); if (j > 0) p[x.slice(0, j).toUpperCase()] = x.slice(j + 1).replace(/^"|"$/g, ""); }
  return [name, { v, p }];
}
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const dOf = (s: string) => new Date(s + "T00:00:00Z");
const addDays = (s: string, n: number) => { const d = dOf(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
function berlin(utc: Date) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
  const o: any = {}; for (const x of f.formatToParts(utc)) o[x.type] = x.value;
  return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour === "24" ? "00" : o.hour}:${o.minute}` };
}
function icsDate(x?: IcsVal): { date: string; time?: string } | null {
  if (!x) return null;
  const m = x.v.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!m[4] || x.p.VALUE === "DATE") return { date };
  if (m[7]) return berlin(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])));
  return { date, time: `${m[4]}:${m[5]}` };
}
const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
function expand(start: string, rrule: string, from: string, to: string, exdates: Set<string>): string[] {
  const r: Record<string, string> = {};
  for (const kv of rrule.split(";")) { const [k, v] = kv.split("="); if (k && v) r[k.toUpperCase()] = v.toUpperCase(); }
  const freq = r.FREQ, interval = Math.max(1, parseInt(r.INTERVAL || "1") || 1);
  const count = r.COUNT ? parseInt(r.COUNT) : Infinity;
  let until = to;
  if (r.UNTIL) { const u = icsDate({ v: r.UNTIL, p: {} }); if (u && u.date < until) until = u.date; }
  const byday = r.BYDAY ? r.BYDAY.split(",") : [];
  const bymd = r.BYMONTHDAY ? r.BYMONTHDAY.split(",").map(Number) : [];
  const out: string[] = []; let n = 0;
  const push = (d: string) => { if (d < start || d > until || n >= count) return false; n++; if (d >= from && !exdates.has(d)) out.push(d); return true; };
  const s = dOf(start); let guard = 0;
  if (freq === "DAILY") { for (let d = start; d <= until && n < count && guard++ < 20000; d = addDays(d, interval)) push(d); }
  else if (freq === "WEEKLY") {
    const days = byday.length ? byday.map((b) => WD.indexOf(b.slice(-2))).filter((x) => x >= 0).sort() : [s.getUTCDay()];
    const wk0 = addDays(start, -((s.getUTCDay() + 6) % 7)); // Montag der Startwoche
    for (let w = wk0; w <= until && n < count && guard++ < 5000; w = addDays(w, 7 * interval))
      for (const wd of [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))) push(addDays(w, (wd + 6) % 7));
  } else if (freq === "MONTHLY" || freq === "YEARLY") {
    const step = freq === "MONTHLY" ? interval : 12 * interval;
    const bymonth = r.BYMONTH ? r.BYMONTH.split(",").map(Number) : [];
    for (let k = 0; guard++ < 3000 && n < count; k += freq === "YEARLY" && bymonth.length ? 1 : step) {
      const y = s.getUTCFullYear() + Math.floor((s.getUTCMonth() + k) / 12), mo = (s.getUTCMonth() + k) % 12;
      const first = `${y}-${pad(mo + 1)}-01`; if (first > until) break;
      if (freq === "YEARLY" && bymonth.length && !bymonth.includes(mo + 1)) continue;
      if (freq === "YEARLY" && bymonth.length && (y - s.getUTCFullYear()) % interval) continue;
      const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(); const cands: number[] = [];
      if (byday.length) {
        for (const b of byday) {
          const mm = b.match(/^([+-]?\d+)?([A-Z]{2})$/); if (!mm) continue; const wd = WD.indexOf(mm[2]);
          const all = []; for (let d = 1; d <= dim; d++) if (new Date(Date.UTC(y, mo, d)).getUTCDay() === wd) all.push(d);
          if (mm[1]) { const ix = parseInt(mm[1]); const v = ix > 0 ? all[ix - 1] : all[all.length + ix]; if (v) cands.push(v); } else cands.push(...all);
        }
      } else if (bymd.length) { for (const d of bymd) { const v = d > 0 ? d : dim + d + 1; if (v >= 1 && v <= dim) cands.push(v); } }
      else { if (s.getUTCDate() <= dim) cands.push(s.getUTCDate()); }
      for (const d of [...new Set(cands)].sort((a, b) => a - b)) push(`${y}-${pad(mo + 1)}-${pad(d)}`);
    }
  } else push(start);
  return out;
}
function wasteKind(title: string) {
  const t = title.toLowerCase();
  if (/rest|haus(müll|muell)|grau/.test(t)) return "rest";
  if (/bio|grün(gut|schnitt)|gruen|kompost|laub/.test(t)) return "bio";
  if (/gelb|wertstoff|verpackung|lvp|plastik/.test(t)) return "yellow";
  if (/papier|pappe|blau|kartonage|ppk/.test(t)) return "paper";
  return "other";
}
async function sha(s: string) { return hex(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s))).slice(0, 14); }
async function parseIcs(text: string, feedId: string) {
  const lines = unfold(text);
  if (!lines.some((l) => l.toUpperCase().startsWith("BEGIN:VCALENDAR"))) throw new Error("Das ist keine gültige ICS-Kalenderdatei.");
  const evs: any[] = []; let cur: any = null; let depth = 0;
  for (const l of lines) {
    const u = l.toUpperCase();
    if (u === "BEGIN:VEVENT") { cur = { ex: [] }; depth = 0; continue; }
    if (!cur) continue;
    if (u.startsWith("BEGIN:")) { depth++; continue; }
    if (u.startsWith("END:") && depth > 0) { depth--; continue; }
    if (u === "END:VEVENT") { evs.push(cur); cur = null; continue; }
    if (depth) continue;
    const pl = parseLine(l); if (!pl) continue; const [k, v] = pl;
    if (k === "EXDATE") { for (const x of v.v.split(",")) { const d = icsDate({ v: x, p: v.p }); if (d) cur.ex.push(d.date); } }
    else cur[k] = v;
  }
  const today = ymd(new Date()); const from = addDays(today, -120), to = addDays(today, 550);
  const overrides = new Set<string>(); for (const e of evs) if (e["RECURRENCE-ID"]) { const d = icsDate(e["RECURRENCE-ID"]); if (d) overrides.add((e.UID?.v || "") + "|" + d.date); }
  const out: any[] = [];
  for (const e of evs) {
    if (e.STATUS?.v?.toUpperCase() === "CANCELLED") continue;
    const st = icsDate(e.DTSTART); if (!st) continue;
    const title = icsUnescape(e.SUMMARY?.v || "Termin").slice(0, 120) || "Termin";
    const en = icsDate(e.DTEND);
    let span = 0;
    if (en) { span = Math.round((dOf(en.date).getTime() - dOf(st.date).getTime()) / 864e5); if (!st.time && span > 0) span -= 1; if (span < 0) span = 0; }
    const uid = e.UID?.v || title + st.date;
    const dates = e.RRULE && !e["RECURRENCE-ID"] ? expand(st.date, e.RRULE.v, from, to, new Set(e.ex)).filter((d) => !overrides.has(uid + "|" + d)) : (st.date >= from && st.date <= to ? [st.date] : []);
    const note = icsUnescape(e.DESCRIPTION?.v || "").slice(0, 500), loc = icsUnescape(e.LOCATION?.v || "").slice(0, 200);
    for (const d of dates) {
      const o: any = { feed: feedId, title, date: d, kind: wasteKind(title) };
      if (span > 0) o.endDate = addDays(d, Math.min(span, 60));
      if (st.time) o.time = st.time;
      if (note) o.note = note; if (loc) o.location = loc;
      out.push({ id: `fev-${feedId.slice(5, 15)}-${await sha(uid + "|" + d)}`, data: o });
      if (out.length >= 3000) break;
    }
    if (out.length >= 3000) break;
  }
  if (!out.length) throw new Error("In der Datei wurden keine Termine im Zeitraum gefunden.");
  return out;
}
async function fetchIcs(url: string) {
  let u: URL; try { u = new URL(url.replace(/^webcals?:\/\//i, "https://")); } catch { throw new Error("Ungültiger Link."); }
  if (!/^https?:$/.test(u.protocol)) throw new Error("Nur http(s)- oder webcal-Links sind möglich.");
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname) || u.hostname.endsWith(".internal")) throw new Error("Dieser Link ist nicht erlaubt.");
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(u.toString(), { signal: ctl.signal, headers: { "user-agent": "Responsible-Kalender/1.0", accept: "text/calendar, */*" } });
    if (!r.ok) throw new Error(`Der Kalender-Link antwortet mit Fehler ${r.status}.`);
    const t = await r.text(); if (t.length > 4e6) throw new Error("Der Kalender ist zu groß.");
    return t;
  } catch (e) { if ((e as Error).name === "AbortError") throw new Error("Der Kalender-Link antwortet nicht."); throw e; } finally { clearTimeout(tm); }
}
// Ersetzt alle Termine einer Quelle; nur geänderte Zeilen werden geschrieben
const canon = (o: any) => JSON.stringify(o, Object.keys(o || {}).sort());
async function replaceFeedEvents(g: string, feedId: string, events: { id: string; data: any }[], me: string | null) {
  const existing = must(await db.from("rs_item").select("id,data,deleted,rev").eq("grp", g).eq("coll", "fev").eq("data->>feed", feedId)) as any[];
  const byId = new Map(existing.map((r) => [r.id, r]));
  const newIds = new Set(events.map((e) => e.id));
  const ups: any[] = [];
  for (const e of events) { const c = byId.get(e.id); if (!c || c.deleted || canon(c.data) !== canon(e.data)) ups.push({ grp: g, coll: "fev", id: e.id, data: e.data, deleted: false, rev: (c?.rev || 0) + 1, updated_by: me }); }
  for (let i = 0; i < ups.length; i += 500) must(await db.from("rs_item").upsert(ups.slice(i, i + 500)));
  const gone = existing.filter((r) => !r.deleted && !newIds.has(r.id)).map((r) => r.id);
  for (let i = 0; i < gone.length; i += 200) must(await db.from("rs_item").update({ deleted: true, data: { feed: feedId } }).eq("grp", g).eq("coll", "fev").in("id", gone.slice(i, i + 200)));
  return { count: events.length, changed: ups.length, removed: gone.length };
}
async function refreshFeed(g: string, feed: any, me: string | null) {
  const d = feed.data;
  try {
    const evs = await parseIcs(await fetchIcs(d.url), feed.id);
    const r = await replaceFeedEvents(g, feed.id, evs, me);
    await db.from("rs_item").update({ data: { ...d, lastSync: new Date().toISOString(), count: r.count, error: null } }).eq("grp", g).eq("coll", "feed").eq("id", feed.id);
    return { ok: true, ...r };
  } catch (e) {
    await db.from("rs_item").update({ data: { ...d, lastSync: new Date().toISOString(), error: (e as Error).message } }).eq("grp", g).eq("coll", "feed").eq("id", feed.id);
    return { ok: false, error: (e as Error).message };
  }
}

// ---- Server ----
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  try {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^.*\/responsible/, "") || "/";
    if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return err("Die Anfrage ist zu groß.", 413);
    const body = async () => (req.method === "POST" ? await req.json().catch(() => ({})) : {});

    if (path === "/health") return json({ ok: true, app: "responsible" });

    if (path === "/cron" && req.method === "POST") {
      const sec = must(await db.from("rs_meta").select("v").eq("k", "cron").maybeSingle()) as any;
      if (!sec || req.headers.get("x-rs-cron") !== sec.v) return json({ error: "nein" }, 403);
      const feeds = must(await db.from("rs_item").select("grp,id,data").eq("coll", "feed").eq("deleted", false).eq("data->>type", "url")) as any[];
      const res = []; for (const f of feeds) res.push(await refreshFeed(f.grp, f, null));
      return json({ ok: true, feeds: feeds.length, res });
    }

    const im = path.match(/^\/invite\/([a-f0-9]{16,64})$/);
    if (im && req.method === "GET") {
      const inv = must(await db.from("rs_invite").select("grp,expires_at,max_uses,uses,revoked,created_by,rs_group(name,kind,image)").eq("token", im[1]).maybeSingle()) as any;
      if (!inv || inv.revoked || Date.parse(inv.expires_at) < Date.now() || inv.uses >= inv.max_uses) return err("Diese Einladung ist abgelaufen oder wurde zurückgezogen.", 404);
      const by = inv.created_by ? (must(await db.from("rs_user").select("name").eq("id", inv.created_by).maybeSingle()) as any)?.name : null;
      return json({ group: { id: inv.grp, name: inv.rs_group.name, kind: inv.rs_group.kind, image: inv.rs_group.image }, by });
    }

    if (path === "/register" && req.method === "POST") {
      const ip = ipOf(req);
      if (await limited(["reg:" + ip], 20)) return err("Zu viele Registrierungen von diesem Netz – bitte später nochmal.", 429);
      const b = await body();
      const name = normName(b.name), np = nameProblem(name), pp = passProblem(b.pass);
      if (np) return err(np, 400, { field: "name" });
      if (pp) return err(pp, 400, { field: "pass" });
      const taken = must(await db.from("rs_user").select("id").eq("name_lc", name.toLowerCase()).maybeSingle());
      if (taken) return err("Der Name ist schon vergeben.", 409, { field: "name" });
      const id = "u" + rnd(6);
      let avatar: string | null | undefined = null;
      if (b.avatar) { avatar = await storeImage("u/" + id, b.avatar); if (avatar === undefined) return err("Das Bild konnte nicht verarbeitet werden.", 400, { field: "avatar" }); }
      const ins = await db.from("rs_user").insert({ id, name, name_lc: name.toLowerCase(), ...(await hashNew(b.pass)), avatar });
      if (ins.error) { await removeImage(avatar); if (String((ins.error as any).code) === "23505") return err("Der Name ist schon vergeben.", 409, { field: "name" }); throw ins.error; }
      await bump(["reg:" + ip]);
      return json({ token: await newSession(id), user: { id, name, avatar } });
    }

    if (path === "/login" && req.method === "POST") {
      const ip = ipOf(req); const b = await body();
      const raw = normName(b.name);
      const keys = ["ip:" + ip, "name:" + raw.toLowerCase()];
      if (await limited(keys, 8)) return err("Zu viele Fehlversuche – bitte in ein paar Minuten nochmal.", 429);
      const u = raw ? (must(await db.from("rs_user").select("*").eq("name_lc", raw.toLowerCase()).maybeSingle()) as any) : null;
      const ok = u && typeof b.pass === "string" && (await verify(u, b.pass));
      if (!ok) { await bump(keys); await sleep(300); return err(u ? "Falsches Passwort." : "Unbekannter Name oder falsches Passwort.", 401, { bad: true }); }
      await db.from("rs_fail").delete().in("k", keys);
      return json({ token: await newSession(u.id), user: { id: u.id, name: u.name, avatar: u.avatar } });
    }

    const a = await auth(req);
    if (!a) return json({ error: "Nicht angemeldet", code: 401 }, 401);
    const me = a.id;

    if (path === "/logout") { await db.from("rs_session").delete().eq("token", a.token); return json({ ok: true }); }

    if (path === "/me") {
      const u = must(await db.from("rs_user").select("id,name,avatar").eq("id", me).maybeSingle()) as any;
      if (!u) return json({ error: "Nicht angemeldet", code: 401 }, 401);
      return json({ user: u, groups: await myGroups(me) });
    }

    if (path === "/account" && req.method === "POST") {
      const b = await body();
      const u = must(await db.from("rs_user").select("*").eq("id", me).single()) as any;
      if (b.action === "name") {
        const name = normName(b.name), np = nameProblem(name); if (np) return err(np, 400, { field: "name" });
        const t = must(await db.from("rs_user").select("id").eq("name_lc", name.toLowerCase()).neq("id", me).maybeSingle());
        if (t) return err("Der Name ist schon vergeben.", 409, { field: "name" });
        const r = await db.from("rs_user").update({ name, name_lc: name.toLowerCase(), updated_at: new Date().toISOString() }).eq("id", me);
        if (r.error) return err("Der Name ist schon vergeben.", 409, { field: "name" });
        return json({ ok: true, user: { id: me, name, avatar: u.avatar } });
      }
      if (b.action === "password") {
        if (await limited(["pw:" + me], 8)) return err("Zu viele Fehlversuche – bitte später nochmal.", 429);
        if (!(await verify(u, String(b.old ?? "")))) { await bump(["pw:" + me]); return err("Das bisherige Passwort stimmt nicht.", 401, { field: "old" }); }
        const pp = passProblem(b.pass); if (pp) return err(pp, 400, { field: "pass" });
        must(await db.from("rs_user").update({ ...(await hashNew(b.pass)), updated_at: new Date().toISOString() }).eq("id", me));
        await db.from("rs_session").delete().eq("usr", me).neq("token", a.token); // andere Geräte abmelden
        return json({ ok: true });
      }
      if (b.action === "avatar") {
        const av = await storeImage("u/" + me, b.avatar ?? null, u.avatar);
        if (av === undefined) return err("Das Bild konnte nicht verarbeitet werden.", 400);
        must(await db.from("rs_user").update({ avatar: av, updated_at: new Date().toISOString() }).eq("id", me));
        return json({ ok: true, user: { id: me, name: u.name, avatar: av } });
      }
      if (b.action === "delete") {
        if (await limited(["pw:" + me], 8)) return err("Zu viele Fehlversuche – bitte später nochmal.", 429);
        if (!(await verify(u, String(b.pass ?? "")))) { await bump(["pw:" + me]); return err("Das Passwort stimmt nicht.", 401, { field: "pass" }); }
        // Eigene Gruppen: an das nächste Mitglied übergeben oder löschen
        for (const g of must(await db.from("rs_group").select("id").eq("owner", me)) as any[]) {
          const next = must(await db.from("rs_member").select("usr,role").eq("grp", g.id).neq("usr", me).order("joined_at").limit(5)) as any[];
          const heir = next.find((x) => x.role === "admin") || next[0];
          if (heir) { must(await db.from("rs_group").update({ owner: heir.usr }).eq("id", g.id)); must(await db.from("rs_member").update({ role: "owner" }).eq("grp", g.id).eq("usr", heir.usr)); }
          else await deleteGroup(g.id);
        }
        await removeImage(u.avatar);
        must(await db.from("rs_user").delete().eq("id", me));
        return json({ ok: true });
      }
      return err("Unbekannte Aktion.", 400);
    }

    if (path === "/join" && req.method === "POST") {
      const b = await body(); const token = String(b.token || "");
      if (await limited(["join:" + me], 20)) return err("Zu viele Versuche – bitte später nochmal.", 429);
      const inv = must(await db.from("rs_invite").select("*").eq("token", token).maybeSingle()) as any;
      if (!inv || inv.revoked || Date.parse(inv.expires_at) < Date.now() || inv.uses >= inv.max_uses) { await bump(["join:" + me]); return err("Diese Einladung ist abgelaufen oder wurde zurückgezogen.", 404); }
      const already = await membership(inv.grp, me);
      if (!already) {
        must(await db.from("rs_member").insert({ grp: inv.grp, usr: me, role: "member", color: await freeColor(inv.grp) }));
        await db.from("rs_invite").update({ uses: inv.uses + 1 }).eq("token", token);
      }
      return json({ ok: true, group: inv.grp, already: !!already, groups: await myGroups(me) });
    }

    if (path === "/group" && req.method === "POST") {
      const b = await body(); const g = String(b.g || "");
      if (b.action === "create") {
        const name = str(b.name, 40); if (name.length < 2) return err("Der Name braucht mindestens 2 Zeichen.", 400, { field: "name" });
        const cnt = (must(await db.from("rs_member").select("grp").eq("usr", me)) as any[]).length;
        if (cnt >= 20) return err("Du bist schon in 20 Gruppen.", 400);
        const id = "g" + rnd(6);
        must(await db.from("rs_group").insert({ id, name, kind: b.kind === "team" ? "team" : "family", owner: me }));
        must(await db.from("rs_member").insert({ grp: id, usr: me, role: "owner", color: COLOR_RE.test(b.color) ? b.color : PALETTE[0] }));
        return json({ ok: true, group: id, groups: await myGroups(me) });
      }
      const m = await membership(g, me); if (!m) return err("Du bist kein Mitglied dieser Gruppe.", 403);
      const admin = m.role === "owner" || m.role === "admin", owner = m.role === "owner";
      if (b.action === "color") {
        if (!COLOR_RE.test(b.color)) return err("Ungültige Farbe.", 400);
        must(await db.from("rs_member").update({ color: b.color.toLowerCase() }).eq("grp", g).eq("usr", me));
        return json({ ok: true });
      }
      if (b.action === "update") {
        if (!admin) return err("Nur Besitzer und Admins können die Gruppe ändern.", 403);
        const name = str(b.name, 40); if (name.length < 2) return err("Der Name braucht mindestens 2 Zeichen.", 400, { field: "name" });
        must(await db.from("rs_group").update({ name, kind: b.kind === "team" ? "team" : "family" }).eq("id", g));
        return json({ ok: true, groups: await myGroups(me) });
      }
      if (b.action === "image") {
        if (!admin) return err("Nur Besitzer und Admins können das Gruppenbild ändern.", 403);
        const gr = must(await db.from("rs_group").select("image").eq("id", g).single()) as any;
        const im2 = await storeImage("g/" + g, b.image ?? null, gr.image); if (im2 === undefined) return err("Das Bild konnte nicht verarbeitet werden.", 400);
        must(await db.from("rs_group").update({ image: im2 }).eq("id", g));
        return json({ ok: true, image: im2, groups: await myGroups(me) });
      }
      if (b.action === "role") {
        if (!owner) return err("Nur der Besitzer kann Rollen vergeben.", 403);
        if (b.usr === me) return err("Deine eigene Rolle kannst du nicht ändern.", 400);
        const t = await membership(g, String(b.usr)); if (!t) return err("Mitglied nicht gefunden.", 404);
        if (b.role === "owner") { // Besitz übergeben
          must(await db.from("rs_group").update({ owner: b.usr }).eq("id", g));
          must(await db.from("rs_member").update({ role: "owner" }).eq("grp", g).eq("usr", b.usr));
          must(await db.from("rs_member").update({ role: "admin" }).eq("grp", g).eq("usr", me));
        } else must(await db.from("rs_member").update({ role: b.role === "admin" ? "admin" : "member" }).eq("grp", g).eq("usr", b.usr));
        return json({ ok: true });
      }
      if (b.action === "remove") {
        const t = await membership(g, String(b.usr)); if (!t) return err("Mitglied nicht gefunden.", 404);
        if (b.usr === me) return err("Zum Verlassen bitte „Gruppe verlassen“ verwenden.", 400);
        if (!(owner || (m.role === "admin" && t.role === "member"))) return err("Nur der Besitzer kann Mitglieder entfernen.", 403);
        must(await db.from("rs_member").delete().eq("grp", g).eq("usr", b.usr));
        return json({ ok: true });
      }
      if (b.action === "leave") {
        if (owner) {
          const others = must(await db.from("rs_member").select("usr,role").eq("grp", g).neq("usr", me).order("joined_at")) as any[];
          if (others.length) return err("Übergib die Gruppe zuerst an ein anderes Mitglied oder lösche sie.", 400);
          await deleteGroup(g);
        } else must(await db.from("rs_member").delete().eq("grp", g).eq("usr", me));
        return json({ ok: true, groups: await myGroups(me) });
      }
      if (b.action === "delete") {
        if (!owner) return err("Nur der Besitzer kann die Gruppe löschen.", 403);
        await deleteGroup(g);
        return json({ ok: true, groups: await myGroups(me) });
      }
      if (b.action === "invite") {
        if (!admin) return err("Nur Besitzer und Admins können einladen.", 403);
        const open = must(await db.from("rs_invite").select("token").eq("grp", g).eq("revoked", false).gt("expires_at", new Date().toISOString())) as any[];
        if (open.length >= 20) return err("Es gibt schon 20 offene Einladungen.", 400);
        const days = Math.min(30, Math.max(1, Number(b.days) || 14));
        const token = rnd(16);
        must(await db.from("rs_invite").insert({ token, grp: g, created_by: me, expires_at: new Date(Date.now() + days * 864e5).toISOString(), max_uses: Math.min(100, Math.max(1, Number(b.uses) || 20)) }));
        return json({ ok: true, token });
      }
      if (b.action === "revoke") {
        if (!admin) return err("Nur Besitzer und Admins können Einladungen zurückziehen.", 403);
        must(await db.from("rs_invite").update({ revoked: true }).eq("grp", g).eq("token", String(b.token)));
        return json({ ok: true });
      }
      return err("Unbekannte Aktion.", 400);
    }

    // ---- Gruppendaten ----
    if (path === "/sync") {
      const g = url.searchParams.get("g") || ""; const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
      const m = await membership(g, me); if (!m) return err("Du bist kein Mitglied dieser Gruppe.", 403, { gone: true });
      const group = must(await db.from("rs_group").select("id,name,kind,image,owner").eq("id", g).single()) as any;
      let q = db.from("rs_item").select("coll,id,data,rev,deleted,updated_by,updated_at,seq").eq("grp", g).gt("seq", since).order("seq").limit(5000);
      if (!since) q = q.eq("deleted", false);
      const rows = must(await q) as any[];
      const maxSeq = rows.length ? rows[rows.length - 1].seq : since;
      const out: any = { group: { ...group, role: m.role }, members: await members(g), items: rows.map(pub), seq: maxSeq, full: !since, more: rows.length >= 5000 };
      if (m.role !== "member") out.invites = must(await db.from("rs_invite").select("token,created_at,expires_at,uses,max_uses,created_by").eq("grp", g).eq("revoked", false).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false })) as any[];
      return json(out);
    }

    if (path === "/item" && req.method === "POST") {
      const b = await body(); const g = String(b.g || ""), coll = String(b.coll || ""), id = String(b.id || "");
      const m = await membership(g, me); if (!m) return err("Du bist kein Mitglied dieser Gruppe.", 403, { gone: true });
      if (!ID_RE.test(id)) return err("Ungültige ID.", 400);
      const base = typeof b.base === "number" ? b.base : undefined;
      let data: any = null;
      if (!b.del) {
        const memberIds = (await members(g)).map((x) => x.id);
        if (coll === "cal") { data = validCal(b.data, memberIds); if (typeof data === "string") return err(data, 400); }
        else if (coll === "todo") {
          const d = b.data || {}; const title = str(d.title, 120); if (!title) return err("Bitte einen Titel eingeben.", 400);
          data = { kind: d.kind === "event" ? "event" : "task", title, createdBy: me }; const note = str(d.note, 1000); if (note) data.note = note;
        } else if (coll === "shop") {
          const d = b.data || {}; const label = str(d.label, 120); if (!label) return err("Bitte einen Artikel eingeben.", 400);
          data = { label, productKey: str(d.productKey, 40) || "custom", addedBy: me };
        } else if (coll === "fev") {
          const d = b.data || {}; const title = str(d.title, 120); if (!title) return err("Bitte einen Titel eingeben.", 400);
          if (!DATE_RE.test(d.date)) return err("Ungültiges Datum.", 400);
          const cur = await getItem(g, coll, id); if (cur && cur.data?.feed !== "manual") return err("Importierte Termine können nicht bearbeitet werden.", 400);
          data = { feed: "manual", title, date: d.date, kind: WASTE_KINDS.includes(d.kind) ? d.kind : wasteKind(title), createdBy: me };
          if (d.time && TIME_RE.test(d.time)) data.time = d.time; const note = str(d.note, 500); if (note) data.note = note;
        } else if (coll === "feed") {
          const cur = await getItem(g, coll, id); if (!cur || cur.deleted) return err("Kalenderquelle nicht gefunden.", 404);
          data = { ...cur.data, name: str(b.data?.name, 60) || cur.data.name, color: COLOR_RE.test(b.data?.color) ? b.data.color : cur.data.color };
        } else return err("Unbekannte Liste.", 400);
      } else {
        if (!["cal", "todo", "shop", "fev"].includes(coll)) return err("Unbekannte Liste.", 400);
        if (coll === "fev") { const cur = await getItem(g, coll, id); if (cur && cur.data?.feed !== "manual") return err("Importierte Termine bitte über die Kalenderquelle entfernen.", 400); }
      }
      const r = await writeItem(g, coll, id, data, me, base, !!b.del);
      if (!r.ok) return err("Der Eintrag wurde auf einem anderen Gerät geändert.", 409, { code: "version_conflict", current: r.current });
      return json({ ok: true, item: r.item });
    }

    if (path === "/done" && req.method === "POST") { // Bestätigung „rausgestellt“/„erledigt“ für gemeinsame Termine
      const b = await body(); const g = String(b.g || ""), id = String(b.id || "");
      const m = await membership(g, me); if (!m) return err("Du bist kein Mitglied dieser Gruppe.", 403, { gone: true });
      if (!ID_RE.test(id)) return err("Ungültige ID.", 400);
      const r = await writeItem(g, "done", id, b.completed ? { completed: true, by: me, at: new Date().toISOString() } : { completed: false, by: me }, me);
      return json({ ok: true, item: r.item });
    }

    if (path === "/take" && req.method === "POST") { // Offenen Eintrag übernehmen
      const b = await body(); const g = String(b.g || ""), id = String(b.id || "");
      const m = await membership(g, me); if (!m) return err("Du bist kein Mitglied dieser Gruppe.", 403, { gone: true });
      const cur = await getItem(g, "todo", id);
      if (!cur || cur.deleted) return err("Der Eintrag wurde schon übernommen oder entfernt.", 409, { code: "gone" });
      if (!b.done && !DATE_RE.test(b.date)) return err("Bitte ein Datum wählen.", 400);
      const del = await writeItem(g, "todo", id, null, me, cur.rev, true);
      if (!del.ok) return err("Der Eintrag wurde gerade von jemand anderem übernommen.", 409, { code: "gone" });
      let cal = null;
      if (!b.done) {
        const d = cur.data; const cid = `${d.kind}-${Date.now()}-${rnd(3)}`;
        const data: any = { kind: d.kind, title: d.title, date: b.date, people: [me], createdBy: d.createdBy || me, fromTodo: true };
        if (d.note) data.note = d.note;
        if (d.kind === "task") data.completed = false; else data.eventType = "private";
        cal = (await writeItem(g, "cal", cid, data, me)).item;
      }
      return json({ ok: true, removed: del.item, calendarItem: cal });
    }

    if (path === "/feed" && req.method === "POST") {
      const b = await body(); const g = String(b.g || "");
      const m = await membership(g, me); if (!m) return err("Du bist kein Mitglied dieser Gruppe.", 403, { gone: true });
      if (b.action === "add") {
        const feeds = must(await db.from("rs_item").select("id").eq("grp", g).eq("coll", "feed").eq("deleted", false)) as any[];
        if (feeds.length >= 15) return err("Es sind schon 15 Kalenderquellen eingerichtet.", 400);
        const type = b.url ? "url" : "file";
        const name = str(b.name, 60) || (type === "url" ? "Abo-Kalender" : "Importierter Kalender");
        const id = "feed-" + rnd(6);
        let evs;
        try { evs = await parseIcs(type === "url" ? await fetchIcs(String(b.url)) : String(b.ics || ""), id); }
        catch (e) { return err((e as Error).message, 400); }
        const data: any = { name, type, color: COLOR_RE.test(b.color) ? b.color : "#5b6b7d", waste: b.waste !== false, createdBy: me, lastSync: new Date().toISOString(), count: evs.length, error: null };
        if (type === "url") data.url = String(b.url).slice(0, 1000);
        const w = await writeItem(g, "feed", id, data, me);
        const r = await replaceFeedEvents(g, id, evs, me);
        return json({ ok: true, feed: w.item, ...r });
      }
      const id = String(b.id || ""); const f = await getItem(g, "feed", id);
      if (!f || f.deleted) return err("Kalenderquelle nicht gefunden.", 404);
      if (b.action === "refresh") {
        if (f.data.type === "url") { const r = await refreshFeed(g, f, me); return r.ok ? json(r) : err(r.error!, 400); }
        try { const evs = await parseIcs(String(b.ics || ""), id); const r = await replaceFeedEvents(g, id, evs, me); await writeItem(g, "feed", id, { ...f.data, lastSync: new Date().toISOString(), count: evs.length, error: null }, me); return json({ ok: true, ...r }); }
        catch (e) { return err((e as Error).message, 400); }
      }
      if (b.action === "delete") {
        if (m.role === "member" && f.data.createdBy !== me) return err("Nur Admins oder wer die Quelle angelegt hat, kann sie entfernen.", 403);
        await replaceFeedEvents(g, id, [], me);
        await writeItem(g, "feed", id, null, me, undefined, true);
        return json({ ok: true });
      }
      return err("Unbekannte Aktion.", 400);
    }

    return err("Unbekannte Route.", 404);
  } catch (e) {
    console.error(e);
    return json({ error: "Serverfehler – bitte später nochmal versuchen.", code: 500 }, 500);
  }
});
