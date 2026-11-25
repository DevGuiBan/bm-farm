import { DOC_LABEL, STAGE_LABEL, type Activity, type DocKind, type Stage } from "@/lib/types";

/** Resumo legível do que mudou em um registro de atividade. */
export function activityDetail({ action, meta: m }: Pick<Activity, "action" | "meta">): string {
  const parts: string[] = [];
  const stage = (v: unknown) => STAGE_LABEL[v as Stage] ?? String(v);
  if (action === "clientes_transferidos") parts.push(`${m.quantidade} de ${m.de} para ${m.para}`);
  else if (action === "relatorio_exportado") parts.push(`${m.de} a ${m.ate}`);
  else if (action.startsWith("etapa_") && m.de && m.para) parts.push(`${stage(m.de)} para ${stage(m.para)}`);
  if (m.responsavel) parts.push(`novo responsável: ${m.responsavel}`);
  if (m.etapa) parts.push(`${stage(m.etapa)} em ${m.horas} h`);
  if (m.nome) parts.push(String(m.nome));
  if (m.papel) parts.push(m.papel === "admin" ? "administrador" : "operador");
  if (typeof m.ativo === "boolean") parts.push(m.ativo ? "ativo" : "inativo");
  if (typeof m.meta === "number") parts.push(`meta ${m.meta}`);
  if (m.documento) parts.push(DOC_LABEL[m.documento as DocKind] ?? String(m.documento));
  if (m.arquivo) parts.push(String(m.arquivo));
  if (m.item) parts.push(String(m.item));
  if (m.signatario) parts.push(`signatário ${m.signatario}`);
  if (m.motivo) parts.push(`motivo: ${m.motivo}`);
  return parts.join(", ");
}
