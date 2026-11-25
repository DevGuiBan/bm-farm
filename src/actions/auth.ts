"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/types";

export async function login(_: Result, f: FormData): Promise<Result> {
  const db = await createClient();
  const { data, error } = await db.auth.signInWithPassword({
    email: String(f.get("email") ?? "").trim().toLowerCase(), password: String(f.get("senha") ?? ""),
  });
  if (error) return { error: "E-mail ou senha incorretos." };
  const { data: p } = await db.from("profiles").select("active").eq("id", data.user.id).maybeSingle();
  if (!p?.active) {
    await db.auth.signOut();
    return { error: "Este usuário não tem acesso. Fale com um administrador." };
  }
  redirect("/painel");
}

export async function logout() {
  await (await createClient()).auth.signOut();
  redirect("/login");
}

/** O link só é consumido no clique, para pré-visualizações de mensagem não o gastarem. */
export async function confirmLink(_: Result, f: FormData): Promise<Result> {
  const type = f.get("tipo") === "recovery" ? "recovery" : "invite";
  const db = await createClient();
  const { error } = await db.auth.verifyOtp({ token_hash: String(f.get("t") ?? ""), type });
  if (error) return { error: "Link inválido ou expirado. Peça um novo a um administrador." };
  redirect("/definir-senha");
}

export async function setPassword(_: Result, f: FormData): Promise<Result> {
  const password = String(f.get("senha") ?? "");
  if (password.length < 10) return { error: "Use pelo menos 10 caracteres." };
  if (password !== f.get("confirma")) return { error: "As senhas não são iguais." };
  const { error } = await (await createClient()).auth.updateUser({ password });
  if (error) return { error: "Não foi possível salvar. Escolha outra senha ou peça um novo link." };
  redirect("/painel");
}
