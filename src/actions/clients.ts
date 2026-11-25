"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireStaff } from "@/lib/auth";
import { clean, lookupCnpj, validCnpj } from "@/lib/cnpj";
import { friendly } from "@/lib/errors";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Result } from "@/lib/types";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function rpc(fn: string, args: Record<string, unknown>, ok: string): Promise<Result> {
  await requireStaff();
  const { error } = await (await createClient()).rpc(fn, args);
  if (error) return { error: friendly(error) };
  revalidatePath("/", "layout");
  return { ok };
}

const newClient = z.object({
  cnpj: z.string().refine(validCnpj, "CNPJ inválido. Confira os dígitos."),
  contact_name: z.string().min(3, "Informe o nome do titular."),
  contact_phone: z.string().max(30),
  assigned_to: z.union([z.uuid(), z.literal("")]),
  portfolio: z.enum(["novo", "existente"], "Diga se o portfólio é novo ou já existia."),
});

export async function createClientAction(_: Result, f: FormData): Promise<Result> {
  const me = await requireStaff();
  const p = newClient.safeParse({
    cnpj: s(f, "cnpj"), contact_name: s(f, "contact_name"),
    contact_phone: s(f, "contact_phone"), assigned_to: s(f, "assigned_to"),
    portfolio: s(f, "portfolio"),
  });
  if (!p.success) return { error: p.error.issues[0].message };
  if (f.get("contrato") !== "on") return { error: "Confirme que existe contrato com este cliente." };
  let company;
  try {
    company = await lookupCnpj(p.data.cnpj);
  } catch (e) {
    return { error: (e as Error).message };
  }
  if (company.registry.situacao?.toUpperCase() !== "ATIVA") {
    return { error: `A situação cadastral é ${company.registry.situacao ?? "desconhecida"}. Só empresas ativas podem entrar.` };
  }
  // Os dados públicos vêm do servidor, nunca do formulário.
  const { data, error } = await adminClient().rpc("create_client", {
    p_actor: me.id, p_cnpj: clean(p.data.cnpj), p_legal_name: company.legalName, p_trade_name: company.tradeName,
    p_registry: company.registry, p_partners: company.partners, p_contact_name: p.data.contact_name,
    p_contact_phone: p.data.contact_phone || null, p_assigned_to: p.data.assigned_to || null, p_portfolio: p.data.portfolio,
    p_reuse: s(f, "confirmar") === clean(p.data.cnpj), // a confirmação vale só para este CNPJ
  });
  if (error?.code === "BM001") return { ask: { text: `${error.message} Confirmo que quero usar de novo.`, value: clean(p.data.cnpj) } };
  if (error) return { error: friendly(error) };
  redirect(`/clientes/${data}`);
}

export const moveStage = async (_: Result, f: FormData) =>
  rpc("move_stage", {
    p_client: s(f, "client"), p_direction: s(f, "direction"), p_to: s(f, "to") || null, p_reason: s(f, "reason") || null,
  }, "Etapa atualizada.");

export const assignClient = async (_: Result, f: FormData) =>
  rpc("assign_client", { p_client: s(f, "client"), p_operator: s(f, "operator") || null }, "Responsável atualizado.");

export const updateClient = async (_: Result, f: FormData) =>
  rpc("update_client", {
    p_client: s(f, "client"), p_trade_name: s(f, "trade_name"), p_contact_phone: s(f, "contact_phone"),
    p_priority: Number(s(f, "priority")) || 2, p_portfolio: s(f, "portfolio") === "existente" ? "existente" : "novo",
  }, "Dados salvos.");

export const toggleChecklist = async (_: Result, f: FormData) =>
  rpc("toggle_checklist", { p_client: s(f, "client"), p_key: s(f, "key"), p_done: s(f, "done") === "true" }, "");

export async function addNote(_: Result, f: FormData): Promise<Result> {
  if (!s(f, "body")) return { error: "Escreva a anotação." };
  return rpc("add_note", { p_client: s(f, "client"), p_body: s(f, "body") }, "Anotação salva.");
}

export const reviewDocument = async (_: Result, f: FormData) =>
  rpc("review_document", {
    p_doc: s(f, "doc"), p_approve: s(f, "decision") === "sim", p_note: s(f, "note") || null,
  }, "Documento analisado.");

export const recordSiteReply = async (_: Result, f: FormData) =>
  rpc("record_site_reply", {
    p_client: s(f, "client"), p_approve: s(f, "decision") === "sim", p_note: s(f, "note") || null,
  }, "Resposta registrada.");

export async function saveSite(_: Result, f: FormData): Promise<Result> {
  const content = {
    headline: s(f, "headline").slice(0, 160), about: s(f, "about").slice(0, 4000), hours: s(f, "hours").slice(0, 120),
    services: s(f, "services").split("\n").map((x) => x.trim().slice(0, 160)).filter(Boolean).slice(0, 20),
    email: s(f, "email").slice(0, 160), metaTag: s(f, "metaTag").slice(0, 300),
  };
  const submit = s(f, "decision") === "enviar";
  if (submit && (!content.headline || !content.about || !content.services.length)) {
    return { error: "Preencha título, sobre e ao menos um serviço antes de enviar." };
  }
  const domain = s(f, "domain").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return rpc("save_site", { p_client: s(f, "client"), p_content: content, p_submit: submit, p_domain: domain, p_phone: s(f, "phone").slice(0, 30) },
    submit ? "Versão fechada. Envie a prévia ao cliente." : "Rascunho salvo.");
}
