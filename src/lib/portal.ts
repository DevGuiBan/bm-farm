import "server-only";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { hashToken, openSession, sealSession } from "@/lib/portal-session";
import { adminClient } from "@/lib/supabase/admin";
import type { Client } from "@/lib/types";

const COOKIE = "portal_sessao";

export async function findInvite(token: string) {
  if (!/^[\w-]{43}$/.test(token)) return null;
  const db = adminClient();
  const { data: invite } = await db.from("portal_invites").select("id,client_id,expires_at,revoked_at")
    .eq("token_hash", hashToken(token)).maybeSingle();
  if (!invite || invite.revoked_at || Date.parse(invite.expires_at) < Date.now()) return null;
  const { data: client } = await db.from("clients").select("*").eq("id", invite.client_id).maybeSingle();
  return client ? { inviteId: invite.id as string, client: client as Client } : null;
}

export async function startSession(token: string, inviteId: string) {
  (await cookies()).set(COOKIE, sealSession(inviteId, env.portalSecret), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: `/portal/${token}`, maxAge: 7200,
  });
}

/** Convite válido e e-mail do titular confirmado nesta sessão. */
export async function portalAccess(token: string) {
  const invite = await findInvite(token);
  if (!invite) return null;
  const id = openSession((await cookies()).get(COOKIE)?.value, env.portalSecret);
  return id === invite.inviteId ? invite : null;
}
