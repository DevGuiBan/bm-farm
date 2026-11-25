/** Textos do banco falam em cliente; a tela fala em BM. */
const inBm = (m: string) => m.replace("os clientes em aberto", "as BMs em aberto").replace("a este cliente", "a esta BM");

/** Mensagem segura para a tela: textos das nossas regras passam, o resto vira genérico. */
export function friendly(e: { code?: string; message?: string } | null | undefined) {
  if (!e) return "Não foi possível concluir. Tente de novo.";
  if (e.message?.includes("domain_is_own")) {
    return "Informe um domínio do cliente ou da agência, como empresa.com.br ou empresa.agencia.com.br. Endereços gratuitos de hospedagem não valem.";
  }
  if (e.code === "23505") return "Este registro já existe.";
  if (e.code === "P0001" || (e.code === "42501" && !e.message?.startsWith("permission"))) return inBm(e.message ?? "Operação recusada.");
  console.error("[db]", e.code, e.message);
  return "Não foi possível concluir. Tente de novo.";
}
