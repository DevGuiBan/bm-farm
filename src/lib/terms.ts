import { createHash } from "node:crypto";
import { cnpj as fmt } from "@/lib/format";

export const TERMS_VERSION = "2026-11";
export function terms(c: { legal_name: string; cnpj: string }) {
  return [
    `Declaro que represento ${c.legal_name}, CNPJ ${fmt(c.cnpj)}, como sócio, administrador ou procurador com poderes para este ato, e que contratei a agência responsável por este atendimento.`,
    "Autorizo a agência a me auxiliar na configuração do portfólio empresarial da empresa na Meta, no site da empresa em domínio próprio e no acompanhamento da verificação. O portfólio, o domínio e as contas permanecem sob meu controle.",
    "Declaro que o domínio e o telefone informados pertencem à empresa e que os documentos enviados são autênticos e não foram alterados.",
    "Autorizo o tratamento dos dados e documentos enviados apenas para essa finalidade, nos termos da Lei nº 13.709/2018 (LGPD).",
    "Posso revogar esta autorização a qualquer momento neste portal. A revogação interrompe o atendimento.",
  ];
}
export const termsHash = (t: string[]) => createHash("sha256").update(t.join("\n")).digest("hex");
