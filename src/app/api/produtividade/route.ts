import { getProfile } from "@/lib/auth";
import { period } from "@/lib/format";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Metric } from "@/lib/types";

// Aspas e prefixo contra fórmulas em planilhas.
const cell = (v: unknown) => `"${String(v ?? "").replace(/^([=+\-@\t\r])/, "'$1").replace(/"/g, '""')}"`;

export async function GET(request: Request) {
  const me = await getProfile();
  if (me?.role !== "admin") return new Response("Somente administradores", { status: 403 });
  const { from, to } = period(Object.fromEntries(new URL(request.url).searchParams));
  const { data } = await (await createClient()).rpc("operator_metrics", { p_from: from, p_to: to });
  await adminClient().from("activity_log").insert({ actor_id: me.id, action: "relatorio_exportado", meta: { de: from, ate: to } });
  const head = ["Operador", "Papel", "Etapas avançadas", "Clientes concluídos", "Concluídos no mês", "Meta mensal", "No prazo", "Total com prazo",
    "Tempo médio (h)", "Devoluções", "Em andamento", "Em atraso", "Ações", "Dias ativos", "Última ação"];
  const rows = ((data ?? []) as Metric[]).map((m) => [m.full_name, m.role, m.advances, m.completed, m.completed_month, m.monthly_goal, m.sla_ok,
    m.sla_total, m.avg_hours === null ? "" : String(m.avg_hours).replace(".", ","), m.rework, m.open_now, m.late_now, m.actions, m.active_days, m.last_action]);
  return new Response("﻿" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n"), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="produtividade-${from}-a-${to}.csv"` },
  });
}
