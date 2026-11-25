import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

/** Ignora RLS. Use só depois de verificar a identidade de quem pediu. */
export const adminClient = () => createClient(env.url, env.secret, options);

/** Cliente sem cookies: o código de acesso do portal não troca a sessão da equipe. */
export const statelessClient = () => createClient(env.url, env.key, options);
