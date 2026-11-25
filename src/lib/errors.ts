/** Mensagem segura para a tela: textos das nossas regras passam, o resto vira genérico. */
export function friendly(e: { code?: string; message?: string } | null | undefined) {
  if (!e) return "Não foi possível concluir. Tente de novo.";
  if (e.message?.includes("domain_is_own")) {
    return "Informe um domínio próprio da empresa, como empresa.com.br. Endereços gratuitos de hospedagem não valem.";
  }
  if (e.code === "23505") return e.message?.includes("cnpj") ? "Este CNPJ já está cadastrado." : "Este registro já existe.";
  if (e.code === "P0001" || (e.code === "42501" && !e.message?.startsWith("permission"))) return e.message ?? "Operação recusada.";
  console.error("[db]", e.code, e.message);
  return "Não foi possível concluir. Tente de novo.";
}
