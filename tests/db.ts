import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Postgres embutido com o mínimo que o Supabase fornece (papéis, auth.uid, storage). */
export async function createDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.uid', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  `);
  const dir = join(import.meta.dirname, "../supabase/migrations");
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(join(dir, f), "utf8"));
  return db;
}

type Role = "authenticated" | "anon" | "service_role";
export async function as<T = Record<string, unknown>>(
  db: PGlite, role: Role, uid: string | null, sql: string, params: unknown[] = [],
): Promise<T[]> {
  return db.transaction(async (tx) => {
    await tx.query("select set_config('request.uid', $1, true)", [uid ?? ""]);
    await tx.exec(`set local role ${role}`);
    return (await tx.query<T>(sql, params)).rows;
  });
}
