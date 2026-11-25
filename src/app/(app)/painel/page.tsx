import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Empty, PageHead, Stat, StageAge, Trail } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { hours, percent, period, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABEL, type ClientRow, type Metric } from "@/lib/types";

export const metadata: Metadata = { title: "Meu painel" };

export default async function Painel() {
  const me = await requireStaff();
  if (me.role === "admin") redirect("/admin/produtividade"); // fila e números pessoais são de operador
  const db = await createClient();
  const { from, to } = period({});
  const [{ data: rows }, { data: metrics }] = await Promise.all([
    db.from("client_overview").select("*").eq("assigned_to", me.id).not("stage", "in", "(concluido,cancelado)")
      .order("priority").order("stage_entered_at"),
    db.rpc("operator_metrics", { p_from: from, p_to: to }),
  ]);
  const m = ((metrics ?? []) as Metric[]).find((x) => x.operator_id === me.id);
  const queue = (rows ?? []) as ClientRow[];
  return (
    <>
      <PageHead title={`Olá, ${me.full_name.split(" ")[0]}`} sub="Seus números dos últimos 30 dias e o que precisa da sua atenção.">
        <Link href="/clientes/novo" className="btn">Cadastrar BM</Link>
      </PageHead>
      {m && (
        <div className="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
          <Stat label="BMs criadas no mês" value={m.completed_month} note={me.monthly_goal ? `Meta: ${me.monthly_goal} (${percent(m.completed_month, me.monthly_goal)})` : undefined} />
          <Stat label="Etapas avançadas" value={m.advances} note={plural(m.rework, "devolvida", "devolvidas")} />
          <Stat label="BMs em andamento" value={m.open_now} />
          <Stat label="Tempo médio por etapa" value={hours(m.avg_hours)} />
        </div>
      )}
      <section className="panel">
        <h2 className="mb-2">Sua fila</h2>
        {queue.length === 0 && <Empty>Nenhuma BM em andamento com você. Cadastre uma BM para começar.</Empty>}
        <ul>
          {queue.map((c) => (
            <li key={c.id} className="grid items-center gap-x-6 gap-y-2 border-t border-[#e4ecec] py-3.5 first:border-0 md:grid-cols-[1.2fr_1fr_12.5rem]">
              <div className="min-w-0">
                <Link href={`/clientes/${c.id}`} className="link block truncate">{c.trade_name || c.legal_name}</Link>
                <span className="text-sm text-soft">{STAGE_LABEL[c.stage]}{c.priority === 1 && ", prioridade alta"}</span>
              </div>
              <Trail stage={c.stage} />
              <div className="md:text-right"><StageAge row={c} /></div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
