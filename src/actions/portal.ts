"use server";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { friendly } from "@/lib/errors";
import { findInvite, portalAccess, startSession } from "@/lib/portal";
import { adminClient, statelessClient } from "@/lib/supabase/admin";
import { TERMS_VERSION, terms, termsHash } from "@/lib/terms";
import type { Result } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const EXPIRED: Result = { error: "Sua sessão expirou. Recarregue a página e confirme o e-mail de novo." };
const BAD_LINK: Result = { error: "Link inválido ou expirado. Peça um novo à agência." };

export async function sendCode(_: Result, f: FormData): Promise<Result> {
  const invite = await findInvite(s(f, "token"));
  if (!invite) return BAD_LINK;
  const email = invite.client.contact_email;
  // Garante a conta do titular; se já existir, o erro é esperado.
  await adminClient().auth.admin.createUser({ email, email_confirm: true });
  const { error } = await statelessClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return { error: "Não foi possível enviar o código agora. Aguarde um minuto e tente de novo." };
  return { ok: "Código enviado. Confira sua caixa de entrada." };
}

export async function verifyCode(_: Result, f: FormData): Promise<Result> {
  const token = s(f, "token");
  const invite = await findInvite(token);
  if (!invite) return BAD_LINK;
  const { data, error } = await statelessClient().auth.verifyOtp({
    email: invite.client.contact_email, token: s(f, "code").replace(/\D/g, ""), type: "email",
  });
  if (error || data.user?.email !== invite.client.contact_email) return { error: "Código incorreto ou expirado." };
  await startSession(token, invite.inviteId);
  await adminClient().from("portal_invites").update({ last_used_at: new Date().toISOString() }).eq("id", invite.inviteId);
  redirect(`/portal/${token}`);
}

async function run(token: string, fn: string, args: Record<string, unknown>, ok: string): Promise<Result> {
  const a = await portalAccess(token);
  if (!a) return EXPIRED;
  const { error } = await adminClient().rpc(fn, { p_client: a.client.id, ...args });
  if (error) return { error: friendly(error) };
  revalidatePath(`/portal/${token}`);
  return { ok };
}

export async function signAuthorization(_: Result, f: FormData): Promise<Result> {
  const token = s(f, "token");
  const a = await portalAccess(token);
  if (!a) return EXPIRED;
  if (f.get("aceite") !== "on") return { error: "Marque que leu e concorda com os termos." };
  if (s(f, "phone").replace(/\D/g, "").length < 10) return { error: "Informe o telefone da empresa com DDD." };
  const domain = s(f, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const h = await headers();
  return run(token, "portal_sign", {
    p_name: s(f, "name"), p_role: s(f, "role") === "procurador" ? "procurador" : "socio", p_domain: domain, p_phone: s(f, "phone"),
    p_terms_version: TERMS_VERSION, p_terms_sha256: termsHash(terms(a.client)),
    p_ip: h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? null, p_user_agent: h.get("user-agent") ?? "",
  }, "Autorização assinada. A agência vai conferir os dados.");
}

export const revoke = async (_: Result, f: FormData) =>
  run(s(f, "token"), "portal_revoke", {}, "Autorização revogada. O atendimento foi interrompido.");
