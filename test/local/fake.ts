// In-Memory-Ersatz für supabase-js (nur lokale Tests): unterstützt die von der Function genutzten Abfragen.
const T: Record<string, any[]> = { rs_user: [], rs_session: [], rs_fail: [], rs_meta: [], rs_group: [], rs_member: [], rs_invite: [], rs_item: [], rs_push: [] };
const PK: Record<string, string[]> = { rs_user: ["id"], rs_session: ["token"], rs_fail: ["k"], rs_meta: ["k"], rs_group: ["id"], rs_member: ["grp", "usr"], rs_invite: ["token"], rs_item: ["grp", "coll", "id"], rs_push: ["endpoint"] };
const UNIQ: Record<string, string[][]> = { rs_user: [["name_lc"]] };
let SEQ = 0;
const now = () => new Date().toISOString();
const DEF: Record<string, () => any> = {
  rs_user: () => ({ created_at: now(), updated_at: now() }), rs_session: () => ({ created_at: now(), seen_at: now() }),
  rs_group: () => ({ created_at: now(), image: null }), rs_member: () => ({ joined_at: now() }),
  rs_invite: () => ({ created_at: now(), uses: 0, revoked: false, max_uses: 20 }), rs_item: () => ({ deleted: false, rev: 1 }),
  rs_push: () => ({ created_at: now(), fails: 0, last_ok: null, ua: null }), rs_meta: () => ({ t: now() }), rs_fail: () => ({}),
};
const touch = (t: string, r: any) => { if (t === "rs_item") { r.seq = ++SEQ; r.updated_at = now(); } };
const get = (r: any, c: string) => { const m = c.match(/^(\w+)->>(\w+)$/); if (m) { const v = r[m[1]]?.[m[2]]; return v === undefined || v === null ? null : typeof v === "string" ? v : String(v); } return r[c]; };
const JOIN: Record<string, [string, string, string]> = { rs_group: ["grp", "rs_group", "id"], rs_user: ["usr", "rs_user", "id"] };
function project(table: string, r: any, cols: string) {
  if (!cols || cols === "*") return { ...r };
  const o: any = {}; let depth = 0, cur = ""; const parts: string[] = [];
  for (const ch of cols) { if (ch === "(") depth++; if (ch === ")") depth--; if (ch === "," && !depth) { parts.push(cur); cur = ""; } else cur += ch; }
  parts.push(cur);
  for (const p of parts.map((x) => x.trim())) {
    const j = p.match(/^(\w+)\((.*)\)$/);
    if (j) { const [fk, t2, pk2] = JOIN[j[1]]; const x = T[t2].find((y) => y[pk2] === r[table === "rs_invite" || table === "rs_member" ? fk : fk]); o[j[1]] = x ? project(t2, x, j[2]) : null; }
    else o[p] = r[p] === undefined ? null : structuredClone(r[p]);
  }
  return o;
}
function cascadeDelete(t: string, rows: any[]) {
  for (const r of rows) {
    if (t === "rs_group") for (const t2 of ["rs_member", "rs_invite", "rs_item"]) T[t2] = T[t2].filter((x) => x.grp !== r.id);
    if (t === "rs_user") { for (const t2 of ["rs_session", "rs_push"]) T[t2] = T[t2].filter((x) => x.usr !== r.id); T.rs_member = T.rs_member.filter((x) => x.usr !== r.id); }
  }
}
class Q {
  f: ((r: any) => boolean)[] = []; op = "select"; cols = "*"; val: any; ord: [string, boolean] | null = null; lim = Infinity; one: "" | "single" | "maybe" = ""; ret = false;
  constructor(public t: string) {}
  select(c = "*") { if (this.op === "select") this.cols = c; else { this.ret = true; this.cols = c; } return this; }
  insert(v: any) { this.op = "insert"; this.val = v; return this; }
  upsert(v: any) { this.op = "upsert"; this.val = v; return this; }
  update(v: any) { this.op = "update"; this.val = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c: string, v: any) { this.f.push((r) => { const x = get(r, c); return typeof v === "boolean" ? x === v : String(x) === String(v) && x !== null; }); return this; }
  neq(c: string, v: any) { this.f.push((r) => String(get(r, c)) !== String(v)); return this; }
  in(c: string, v: any[]) { this.f.push((r) => v.map(String).includes(String(get(r, c)))); return this; }
  gt(c: string, v: any) { this.f.push((r) => get(r, c) !== null && get(r, c) > v); return this; }
  lt(c: string, v: any) { this.f.push((r) => get(r, c) !== null && get(r, c) < v); return this; }
  lte(c: string, v: any) { this.f.push((r) => get(r, c) !== null && get(r, c) <= v); return this; }
  is(c: string, v: any) { this.f.push((r) => (get(r, c) ?? null) === v); return this; }
  like(c: string, p: string) { const re = new RegExp("^" + p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*") + "$"); this.f.push((r) => re.test(String(get(r, c)))); return this; }
  order(c: string, o?: { ascending?: boolean }) { this.ord = [c, o?.ascending !== false]; return this; }
  limit(n: number) { this.lim = n; return this; }
  single() { this.one = "single"; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  run(): { data: any; error: any } {
    const t = this.t, rows = T[t]; const match = () => rows.filter((r) => this.f.every((f) => f(r)));
    const out = (list: any[]) => {
      let l = list; if (this.ord) { const [c, asc] = this.ord; l = [...l].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1)); }
      l = l.slice(0, this.lim).map((r) => project(t, r, this.cols));
      if (this.one === "single") return l.length === 1 ? { data: l[0], error: null } : { data: null, error: { message: "not single" } };
      if (this.one === "maybe") return { data: l[0] ?? null, error: null };
      return { data: l, error: null };
    };
    const key = (r: any) => PK[t].map((k) => r[k]).join("|");
    if (this.op === "select") return out(match());
    if (this.op === "insert" || this.op === "upsert") {
      const vals = Array.isArray(this.val) ? this.val : [this.val]; const res: any[] = [];
      for (const v0 of vals) {
        const v = structuredClone(v0); const ex = rows.find((r) => key(r) === key(v));
        if (ex && this.op === "insert") return { data: null, error: { code: "23505", message: "duplicate" } };
        for (const u of UNIQ[t] || []) if (rows.some((r) => r !== ex && u.every((k) => r[k] === v[k]))) return { data: null, error: { code: "23505", message: "duplicate" } };
        if (ex) { Object.assign(ex, v); touch(t, ex); res.push(ex); }
        else { const r = { ...DEF[t](), ...v }; touch(t, r); rows.push(r); res.push(r); }
      }
      return this.ret ? out(res) : { data: null, error: null };
    }
    if (this.op === "update") {
      const l = match();
      for (const r of l) { for (const u of UNIQ[t] || []) if (u.every((k) => k in this.val) && rows.some((x) => x !== r && u.every((k) => x[k] === this.val[k]))) return { data: null, error: { code: "23505" } }; Object.assign(r, structuredClone(this.val)); touch(t, r); }
      return this.ret ? out(l) : { data: null, error: null };
    }
    if (this.op === "delete") { const l = match(); T[t] = rows.filter((r) => !l.includes(r)); cascadeDelete(t, l); return { data: null, error: null }; }
    return { data: null, error: { message: "op" } };
  }
  then(res: any, rej: any) { try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } }
}
// ---- Storage ----
export const FILES = new Map<string, { bytes: Uint8Array; type: string }>();
const MEDIA_PORT = Number(Deno.env.get("RS_FAKE_MEDIA_PORT") || 8813);
Deno.serve({ port: MEDIA_PORT, onListen() {} }, (req) => {
  const u = new URL(req.url); const p = decodeURIComponent(u.pathname.replace(/^\/media\//, ""));
  const pub = u.pathname.startsWith("/storage/v1/object/public/"); const k = pub ? decodeURIComponent(u.pathname.slice(26)) : p;
  const f = FILES.get(k) || FILES.get(p);
  if (!f || (!pub && u.searchParams.get("token") !== "ok")) return new Response("nope", { status: 404, headers: { "access-control-allow-origin": "*" } });
  return new Response(f.bytes, { headers: { "content-type": f.type, "access-control-allow-origin": "*", "accept-ranges": "bytes" } });
});
function bucket(b: string) {
  const k = (p: string) => b + "/" + p;
  return {
    async upload(p: string, bytes: Uint8Array, o: any) { if (FILES.has(k(p))) return { error: { message: "exists" } }; FILES.set(k(p), { bytes, type: o?.contentType || "application/octet-stream" }); return { data: { path: p }, error: null }; },
    async remove(ps: string[]) { for (const p of ps) FILES.delete(k(p)); return { data: [], error: null }; },
    async list(prefix: string, o: any) {
      const pre = k(prefix) + "/"; const names = new Map<string, boolean>();
      for (const key of FILES.keys()) if (key.startsWith(pre)) { const rest = key.slice(pre.length); const i = rest.indexOf("/"); names.set(i < 0 ? rest : rest.slice(0, i), i < 0); }
      const l = [...names].map(([name, file]) => ({ name, id: file ? "f" : null })).slice(o?.offset || 0, (o?.offset || 0) + (o?.limit || 100));
      return { data: l, error: null };
    },
    async createSignedUrls(ps: string[]) { return { data: ps.map((p) => ({ path: p, signedUrl: `http://localhost:${MEDIA_PORT}/media/${encodeURIComponent(k(p))}?token=ok` })), error: null }; },
  };
}
export const DB = T;
export function fakeClient() {
  T.rs_meta.push({ k: "cron", v: "testcron", t: now() });
  const vap = Deno.env.get("RS_FAKE_VAPID"); if (vap) T.rs_meta.push({ k: "vapid", v: JSON.parse(Deno.readTextFileSync(vap)), t: now() });
  return { from: (t: string) => new Q(t), storage: { from: bucket }, _T: T, _FILES: FILES };
}
// Debug-Endpunkt
Deno.serve({ port: MEDIA_PORT + 1, onListen() {} }, () => new Response(JSON.stringify({ counts: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.length])), live: { msg: T.rs_item.filter((r) => r.coll === "msg" && !r.deleted).length }, files: [...FILES.keys()] }), { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } }));
