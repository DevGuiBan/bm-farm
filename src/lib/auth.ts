import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const getProfile = cache(async (): Promise<Profile | null> => {
  const db = await createClient();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const { data: p } = await db.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
  return p?.active ? (p as Profile) : null;
});

export async function requireStaff() {
  return (await getProfile()) ?? redirect("/login?motivo=sem-acesso");
}
export async function requireAdmin() {
  const p = await requireStaff();
  if (p.role !== "admin") redirect("/painel");
  return p;
}
