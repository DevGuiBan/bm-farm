import type { Registry } from "@/lib/types";

export const clean = (v: string) => v.toUpperCase().replace(/[^0-9A-Z]/g, "");

/** Dígitos verificadores; aceita também o formato alfanumérico. */
export function validCnpj(v: string) {
  const c = clean(v);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1+$/.test(c)) return false;
  const digit = (s: string) => {
    let w = 2, sum = 0;
    for (let i = s.length - 1; i >= 0; i--) {
      sum += (s.charCodeAt(i) - 48) * w;
      w = w === 9 ? 2 : w + 1;
    }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digit(c.slice(0, 12));
  return c.endsWith(`${d1}${digit(c.slice(0, 12) + d1)}`);
}

export async function lookupCnpj(v: string) {
  const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean(v)}`, {
    cache: "no-store", headers: { "User-Agent": "consulta-cnpj/1.0" }, signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  if (r && (r.status === 404 || r.status === 400)) throw new Error("CNPJ não encontrado no cadastro público.");
  if (!r?.ok) throw new Error("A consulta de CNPJ está indisponível. Tente de novo em instantes.");
  const d = await r.json();
  const registry: Registry = {
    situacao: d.descricao_situacao_cadastral, cnae: d.cnae_fiscal_descricao,
    endereco: [d.descricao_tipo_de_logradouro, d.logradouro, d.numero, d.bairro].filter(Boolean).join(" "),
    municipio: d.municipio, uf: d.uf, cep: d.cep, email: d.email?.toLowerCase() ?? undefined, telefone: d.ddd_telefone_1 || undefined,
    inicio: d.data_inicio_atividade,
  };
  const partners: string[] = (d.qsa ?? []).map((s: { nome_socio?: string }) => s.nome_socio).filter(Boolean);
  return { legalName: String(d.razao_social), tradeName: (d.nome_fantasia as string) || null, registry, partners };
}
