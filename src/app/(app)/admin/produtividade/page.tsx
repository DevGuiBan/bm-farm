import type { Metadata } from "next";
import { DailyBars, StageBars } from "@/components/charts";
import { Empty, PageHead, Stat } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { dateTime, dayMonth, hours, num, percent, period, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Metric } from "@/lib/types";

export const metadata: Metadata = { title: "Produtividade" };

export default async function Produtividade({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; op?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const { from, to } = period(sp);
  const op = /^[0-9a-f-]{36}$/.test(sp.op ?? "") ? sp.op! : null;
  const db = await createClient();
  const range = { p_from: from, p_to: to };
  const [metrics, daily, stages] = await Promise.all([
    db.rpc("operator_metrics", range), db.rpc("daily_advances", { ...range, p_operator: op }), db.rpc("stage_durations", { ...range, p_operator: op }),
  ]);
  const all = ((metrics.data ?? []) as Metric[]).filter((m) => m.active || m.advances > 0);
  const rows = op ? all.filter((m) => m.operator_id === op) : all;
  const sum = (k: "completed" | "advances" | "rework" | "sla_ok" | "sla_total" | "open_now" | "late_now") => rows.reduce((t, m) => t + Number(m[k]), 0);
  const best = Math.max(...rows.map((m) => Number(m.advances)), 1);
  return (
    <>
      <PageHead title="Produtividade" sub="O prazo considera só etapas que dependem da equipe. Uma devolução conta para quem avançou a etapa, não para quem a devolveu.">
        <a className="btn btn-quiet" href={`/api/produtividade?de=${from}&ate=${to}`}>Exportar CSV</a>
      </PageHead>
      <form className="mb-8 flex flex-wrap items-end gap-3">
        <label><span className="label">De</span><input className="input" type="date" name="de" defaultValue={from} /></label>
        <label><span className="label">Até</span><input className="input" type="date" name="ate" defaultValue={to} /></label>
        <label><span className="label">Operador</span><select className="input min-w-44" name="op" defaultValue={op ?? ""}><option value="">Toda a equipe</option>{all.map((m) => <option key={m.operator_id} value={m.operator_id}>{m.full_name}</option>)}</select></label>
        <button className="btn btn-quiet">Aplicar</button>
      </form>
      <div className="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="Clientes concluídos" value={num(sum("completed"))} />
        <Stat label="Etapas avançadas" value={num(sum("advances"))} note={plural(sum("rework"), "devolvida", "devolvidas")} />
        <Stat label="Dentro do prazo" value={percent(sum("sla_ok"), sum("sla_total"))} />
        <Stat label="Em andamento agora" value={num(sum("open_now"))} note={`${sum("late_now")} em atraso`} />
      </div>
      <section className="panel mb-5 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-2">Por operador</h2>
        <table className="table">
          <thead><tr><th>Operador</th><th className="w-32">Etapas</th><th className="n">Concluídos</th><th className="n">Meta</th><th className="n">No prazo</th><th className="n">Tempo médio</th><th className="n">Devoluções</th><th className="n">Abertos</th><th className="n">Em atraso</th><th className="n">Dias ativos</th><th>Última ação</th></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.operator_id}>
              <td className="font-semibold whitespace-nowrap">{m.full_name}{!m.active && <span className="badge ml-2">Inativo</span>}</td>
              <td><div className="flex items-center gap-2.5"><span className="w-7 text-right tabular-nums">{m.advances}</span><span className="h-3 flex-1"><i className="block h-full rounded-r-[4px] bg-petrol" style={{ width: `${(Number(m.advances) / best) * 100}%` }} /></span></div></td>
              <td className="n">{m.completed}</td>
              <td className="n">{m.monthly_goal ? `${m.completed_month} de ${m.monthly_goal}` : "–"}</td>
              <td className="n">{percent(m.sla_ok, m.sla_total)}</td><td className="n">{hours(m.avg_hours)}</td>
              <td className="n">{m.rework}</td><td className="n">{m.open_now}</td>
              <td className="n">{Number(m.late_now) > 0 ? <span className="badge badge-bad">{m.late_now}</span> : 0}</td>
              <td className="n">{m.active_days}</td><td className="whitespace-nowrap">{m.last_action ? dateTime(m.last_action).slice(0, 5) + ", " + dateTime(m.last_action).slice(-5) : "Nenhuma"}</td>
            </tr>))}
          </tbody>
        </table>
        {!rows.length && <div className="px-5"><Empty>Sem atividade no período escolhido.</Empty></div>}
      </section>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="panel min-w-0"><h2 className="mb-6">Etapas avançadas por dia, {dayMonth(from)} a {dayMonth(to)}</h2><DailyBars data={daily.data ?? []} /></section>
        <section className="panel min-w-0"><h2 className="mb-5">Tempo médio por etapa</h2><StageBars data={stages.data ?? []} /></section>
      </div>
    </>
  );
}
