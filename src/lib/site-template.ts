import type { SiteContent } from "@/lib/types";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Extrai só o código de verificação; nunca reaproveita HTML colado. */
export function metaCode(v?: string) {
  const m = v?.match(/content\s*=\s*["']([A-Za-z0-9_-]{6,128})["']/) ?? v?.trim().match(/^([A-Za-z0-9_-]{6,128})$/);
  return m?.[1] ?? null;
}

type Company = {
  legal_name: string; trade_name: string | null; cnpj: string; domain: string | null; public_phone: string | null; address?: string;
};

export function renderSite(c: Company, s: Partial<SiteContent>) {
  const name = esc(c.trade_name || c.legal_name);
  const code = metaCode(s.metaTag);
  const cnpj = esc(c.cnpj.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5"));
  const contact = [
    c.public_phone && `Telefone: ${esc(c.public_phone)}`,
    s.email && `E-mail: ${esc(s.email)}`,
    s.hours && `Atendimento: ${esc(s.hours)}`,
    c.address && esc(c.address),
  ].filter(Boolean).join("\n");
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">${code ? `<meta name="facebook-domain-verification" content="${code}">` : ""}
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${name}</title>
<meta name="description" content="${esc(s.headline)}">${c.domain ? `<link rel="canonical" href="https://${esc(c.domain)}/">` : ""}
<style>
*{box-sizing:border-box}body{margin:0;font:17px/1.6 system-ui,sans-serif;color:#17232b;background:#fff}
main,header,footer{max-width:960px;margin:auto;padding:0 24px}header{padding-top:72px;padding-bottom:56px}
h1{font-size:clamp(2rem,6vw,3.4rem);line-height:1.08;margin:.4em 0;max-width:18ch;letter-spacing:-.02em}h2{font-size:1.4rem;margin:0 0 16px}
section{padding:40px 0;border-top:1px solid #d9e0e3}p{max-width:65ch;white-space:pre-line}
ul{padding:0;margin:0;list-style:none;display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
li{background:#f1f5f6;padding:18px;border-radius:8px}
footer{padding-top:32px;padding-bottom:48px;border-top:1px solid #d9e0e3;font-size:.9rem;color:#50616b}
</style></head>
<body><header><strong>${name}</strong><h1>${esc(s.headline)}</h1></header><main>
<section><h2>Sobre</h2><p>${esc(s.about)}</p></section>
<section><h2>Serviços</h2><ul>${(s.services ?? []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></section>
<section><h2>Contato</h2><p>${contact}</p></section>
</main><footer>${esc(c.legal_name)}<br>CNPJ ${cnpj}</footer></body></html>`;
}
