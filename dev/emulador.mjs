// Emulador mínimo do Supabase para desenvolvimento. NUNCA use em produção:
// os tokens não são assinados e a chave de serviço é fixa. Só escuta em 127.0.0.1.
// O banco é um Postgres real (PGlite) com as migrations, funções e RLS do projeto.
import { PGlite } from "@electric-sql/pglite";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { popular } from "./dados.mjs";

const MIGRATIONS = join(import.meta.dirname, "../supabase/migrations");
export const CHAVE_SERVICO = "chave-de-servico-local";

const BASE = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key, email text unique, password text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;`;

/** pasta: onde guardar os dados; sem ela, tudo fica em memória. */
export async function iniciar({ porta, pasta, quieto = false }) {
  // A porta serve de trava: duas instâncias abrindo a mesma pasta corromperiam o banco.
  const server = http.createServer();
  await new Promise((ok, fail) => server.once("error", fail).listen(porta, "127.0.0.1", ok));

  const files = readdirSync(MIGRATIONS).sort().map((f) => readFileSync(join(MIGRATIONS, f), "utf8"));
  const version = createHash("sha256").update(files.join("\n")).digest("hex");
  const versionFile = pasta && join(pasta, "versao");
  const existing = versionFile && existsSync(versionFile);
  if (existing && readFileSync(versionFile, "utf8") !== version) {
    throw new Error("As migrations mudaram desde a última vez. Rode: npm run local:limpar");
  }
  if (pasta) mkdirSync(pasta, { recursive: true });
  // sem o arquivo de versão, a carga inicial foi interrompida no meio
  if (pasta && !existing) rmSync(join(pasta, "banco"), { recursive: true, force: true });
  const db = new PGlite(pasta ? join(pasta, "banco") : undefined);
  if (!existing) {
    await db.exec(BASE);
    for (const f of files) await db.exec(f);
    await popular(db);
    if (versionFile) writeFileSync(versionFile, version);
  }
  const log = (...a) => quieto || console.log("[emulador]", ...a);

  // ---------- arquivos ----------
  const memory = new Map();
  const local = (k) => {
    if (!/^documentos\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(k)) throw new Error("caminho inválido");
    return join(pasta, "arquivos", k);
  };
  const put = (k, buf) => {
    if (!pasta) return memory.set(k, buf);
    mkdirSync(dirname(local(k)), { recursive: true });
    writeFileSync(local(k), buf, { flag: "wx" });
  };
  const get = (k) => (pasta ? (existsSync(local(k)) ? readFileSync(local(k)) : null) : memory.get(k));

  // ---------- usuários ----------
  const links = new Map();
  const find = async (col, v) => (await db.query(`select * from auth.users where ${col} = $1`, [v])).rows[0];
  const addUser = async (email) => {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [randomUUID(), email]);
    return find("email", email);
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const pub = (u) => ({
    id: u.id, email: u.email, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
  });
  const session = (u) => {
    const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
    const token = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: u.id, role: "authenticated", exp })}.bG9jYWw`;
    return { access_token: token, refresh_token: u.id, token_type: "bearer", expires_in: 12 * 3600, expires_at: exp, user: pub(u) };
  };
  const who = (req) => {
    const token = (req.headers.authorization ?? "").replace("Bearer ", "") || req.headers.apikey || "";
    if (token === CHAVE_SERVICO) return ["service_role", ""];
    try {
      const p = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
      if (p.exp > Date.now() / 1000) return ["authenticated", p.sub];
    } catch {}
    return ["anon", ""];
  };

  // ---------- SQL ----------
  const run = ([role, uid], sql, params) => db.transaction(async (tx) => {
    await tx.query("select set_config('request.uid', $1, true)", [uid]);
    await tx.exec(`set local role ${role}`);
    return (await tx.query(sql, params)).rows;
  });
  const id = (s) => `"${s.replace(/"/g, "")}"`;
  const enc = (v) => (v && typeof v === "object" ? JSON.stringify(v) : v);
  const where = (url, params) => {
    const w = [];
    for (const [k, v] of url.searchParams) {
      if (["select", "order", "limit", "offset", "columns"].includes(k)) continue;
      if (v.startsWith("eq.")) { params.push(v.slice(3)); w.push(`${id(k)}::text = $${params.length}`); }
      else if (v.startsWith("not.in.(")) { params.push(v.slice(8, -1).split(",")); w.push(`${id(k)}::text <> all($${params.length}::text[])`); }
      else throw new Error(`Filtro não suportado pelo emulador: ${k}=${v}`);
    }
    return w.length ? ` where ${w.join(" and ")}` : "";
  };

  async function auth(path, req, body) {
    if (path === "token") {
      const u = body.refresh_token ? await find("id", body.refresh_token) : await find("email", body.email);
      return u && (body.refresh_token || (u.password && u.password === body.password)) ? [200, session(u)] : [400, { code: "invalid_credentials", msg: "inválido" }];
    }
    if (path === "user") {
      const [role, uid] = who(req);
      const u = role === "authenticated" && (await find("id", uid));
      if (!u) return [401, { msg: "sem sessão" }];
      if (req.method === "PUT" && body.password) await db.query("update auth.users set password = $2 where id = $1", [uid, body.password]);
      return [200, pub(u)];
    }
    if (path === "logout") return [204];
    if (path === "verify") {
      const u = links.get(body.token_hash);
      links.delete(body.token_hash);
      return u ? [200, session(u)] : [403, { msg: "expirado" }];
    }
    if (path.startsWith("admin/")) {
      if (who(req)[0] !== "service_role") return [403, { msg: "negado" }];
      if (path === "admin/users") return (await find("email", body.email)) ? [422, { msg: "já existe" }] : [200, pub(await addUser(body.email))];
      if (path === "admin/generate_link") {
        let u = await find("email", body.email);
        if (u && body.type === "invite") return [422, { msg: "já existe" }];
        u ??= await addUser(body.email);
        const hash = randomUUID();
        links.set(hash, u);
        return [200, { ...pub(u), hashed_token: hash, action_link: "", email_otp: "", verification_type: body.type, redirect_to: "" }];
      }
      if (req.method === "DELETE") { await db.query("delete from auth.users where id = $1", [path.split("/")[2]]); return [200, {}]; }
    }
    return [404, {}];
  }

  function storage(path, req, raw) {
    const service = who(req)[0] === "service_role";
    if (path.startsWith("upload/sign/")) {
      const k = path.slice(12);
      if (req.method === "POST") return service ? [200, { url: `/object/upload/sign/${k}?token=local` }] : [403, {}];
      put(k, raw);
      return [200, { Key: k }];
    }
    if (path.startsWith("sign/")) {
      const k = path.slice(5);
      if (req.method === "POST") return service ? [200, { signedURL: `/object/sign/${k}?token=local` }] : [403, {}];
      const type = k.endsWith("pdf") ? "application/pdf" : k.endsWith("png") ? "image/png" : "image/jpeg";
      return get(k) ? [200, get(k), { "content-type": type }] : [404, {}];
    }
    if (!service) return [403, {}];
    if (req.method === "DELETE") return [200, []];
    return get(path) ? [200, get(path), { "content-type": "application/octet-stream" }] : [404, {}];
  }

  async function rest(path, req, url, body) {
    if (path.startsWith("rpc/")) {
      const fn = path.slice(4);
      const meta = (await db.query(
        `select proretset, proargnames names, coalesce((select json_agg(format_type(t, null) order by o)
           from unnest(proargtypes) with ordinality x(t, o)), '[]') types
         from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace`, [fn])).rows[0];
      if (!meta) return [404, { code: "PGRST202", message: `função ${fn} não existe` }];
      const keys = Object.keys(body);
      const type = (k) => meta.types[meta.names.indexOf(k)];
      const args = keys.map((k, i) => `${id(k)} => $${i + 1}::${type(k)}`).join(", ");
      const rows = await run(who(req), meta.proretset ? `select * from ${id(fn)}(${args})` : `select ${id(fn)}(${args}) v`,
        keys.map((k) => (type(k) === "jsonb" ? enc(body[k]) : body[k])));
      if (!meta.proretset) return [200, rows[0].v === "" ? null : rows[0].v];
      for (const r of rows) for (const k in r) if (r[k] instanceof Date) r[k] = k === "day" ? r[k].toISOString().slice(0, 10) : r[k].toISOString();
      return [200, rows];
    }
    const t = id(path), params = [];
    if (req.method === "GET" || req.method === "HEAD") {
      let sql = `select * from ${t}${where(url, params)}`;
      const order = url.searchParams.get("order");
      if (order) sql += ` order by ${order.split(",").map((x) => { const [c, d] = x.split("."); return id(c) + (d === "desc" ? " desc" : ""); }).join(", ")}`;
      for (const k of ["limit", "offset"]) if (url.searchParams.get(k)) sql += ` ${k} ${Number(url.searchParams.get(k))}`;
      const rows = await run(who(req), sql, params);
      const h = { "content-range": `0-${rows.length}/${rows.length}` };
      if (!(req.headers.accept ?? "").includes("pgrst.object")) return [200, rows, h];
      return rows.length === 1 ? [200, rows[0], h] : [406, { code: "PGRST116", details: `The result contains ${rows.length} rows`, message: "x" }];
    }
    const keys = Object.keys(body), vals = keys.map((k) => enc(body[k]));
    if (req.method === "POST") {
      await run(who(req), `insert into ${t} (${keys.map(id)}) values (${keys.map((_, i) => `$${i + 1}`)})`, vals);
      return [201];
    }
    if (req.method === "PATCH") {
      const w = where(url, vals);
      await run(who(req), `update ${t} set ${keys.map((k, i) => `${id(k)} = $${i + 1}`)}${w}`, vals);
      return [204];
    }
    return [405, {}];
  }

  server.on("request", async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks), url = new URL(req.url, "http://local"), p = url.pathname;
    const send = (code, body, headers = {}) => {
      res.writeHead(code, {
        "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", ...headers,
      });
      res.end(body === undefined ? "" : Buffer.isBuffer(body) ? body : JSON.stringify(body));
    };
    try {
      if (req.method === "OPTIONS") return send(200, {});
      const body = (req.headers["content-type"] ?? "").includes("json") && raw.length ? JSON.parse(raw.toString()) : {};
      if (p.startsWith("/auth/v1/")) return send(...(await auth(p.slice(9), req, body)));
      if (p.startsWith("/storage/v1/object/")) return send(...storage(p.slice(19), req, raw));
      if (p.startsWith("/rest/v1/")) return send(...(await rest(p.slice(9), req, url, body)));
      send(404, {});
    } catch (e) {
      if (!["P0001", "42501", "23505", "23514"].includes(e.code)) log("erro", req.method, req.url, e.message);
      send(400, { code: e.code, message: e.message });
    }
  });
  return { fechar: async () => { server.close(); server.closeAllConnections(); await db.close(); } };
}
