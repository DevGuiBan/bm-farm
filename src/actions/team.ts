"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { env } from "@/lib/env";
import { friendly } from "@/lib/errors";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const linkFor = (hash: string, type: string) => `${env.site}/auth/confirmar?t=${hash}&tipo=${type}`;

const member = z.object({
  full_name: z.string().min(2, "Informe o nome."),
  email: z.email("Informe um e-mail válido."),
  role: z.enum(["admin", "operador"]),
});

export async function inviteMember(_: Result, f: FormData): Promise<Result> {
  const me = await requireAdmin();
  const p = member.safeParse({ full_name: s(f, "full_name"), email: s(f, "email").toLowerCase(), role: s(f, "role") });
  if (!p.success) return { error: p.error.issues[0].message };
  const db = adminClient();
  const { data, error } = await db.auth.admin.generateLink({ type: "invite", email: p.data.email });
  if (error) return { error: "Este e-mail já tem acesso ou não pôde ser convidado." };
  const { error: e2 } = await db.from("profiles").insert({ id: data.user.id, ...p.data });
  if (e2) {
    await db.auth.admin.deleteUser(data.user.id);
    return { error: friendly(e2) };
  }
  await db.from("activity_log").insert({
    actor_id: me.id, action: "membro_convidado", meta: { nome: p.data.full_name, papel: p.data.role },
  });
  revalidatePath("/admin/equipe");
  return { ok: "Convite criado. Envie o link para a pessoa definir a senha.", link: linkFor(data.properties.hashed_token, "invite") };
}

export async function resetLink(_: Result, f: FormData): Promise<Result> {
  await requireAdmin();
  const db = adminClient();
  const { data: p } = await db.from("profiles").select("email").eq("id", s(f, "user")).maybeSingle();
  if (!p) return { error: "Membro não encontrado." };
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: p.email });
  if (error) return { error: "Não foi possível gerar o link." };
  return { ok: "Link de nova senha gerado.", link: linkFor(data.properties.hashed_token, "recovery") };
}

async function rpc(fn: string, args: Record<string, unknown>, ok: string): Promise<Result> {
  await requireAdmin();
  const { error } = await (await createClient()).rpc(fn, args);
  if (error) return { error: friendly(error) };
  revalidatePath("/", "layout");
  return { ok };
}

export const transferClients = async (_: Result, f: FormData) =>
  rpc("transfer_clients", { p_from: s(f, "from"), p_to: s(f, "to") || null }, "BMs transferidas.");

export const updateMember = async (_: Result, f: FormData) =>
  rpc("update_member", {
    p_user: s(f, "user"), p_role: s(f, "role"), p_active: f.get("active") === "on", p_goal: Math.max(0, Number(s(f, "goal")) || 0),
  }, "Membro atualizado.");
