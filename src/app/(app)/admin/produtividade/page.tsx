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
  const all = ((metrics.data ?? []) as Metric[]).filter((m) => m.role === "operador" && (m.active || m.advances > 0));
  const rows = op ? all.filter((m) => m.operator_id === op) : all;
  const sum = (k: "completed" | "advances" | "rework" | "open_now") => rows.reduce((t, m) => t + Number(m[k]), 0);
  const withGoal = rows.filter((m) => m.active && m.monthly_goal > 0);
  const goal = withGoal.reduce((t, m) => t + Number(m.monthly_goal), 0), reached = withGoal.reduce((t, m) => t + Number(m.completed_month), 0);
  const best = Math.max(...rows.map((m) => Number(m.advances)), 1);
  return (
    <>
      <PageHead title="Produtividade" sub="BM criada é portfólio novo que concluiu todas as etapas, com verificação aprovada. A meta é de BMs criadas no mês atual. Uma devolução conta para quem avançou a etapa, não para quem a devolveu.">
        <a className="btn btn-quiet" href={`/api/produtividade?de=${from}&ate=${to}`}>Exportar CSV</a>
      </PageHead>
      <form className="mb-8 flex flex-wrap items-end gap-3">
        <label><span className="label">De</span><input className="input" type="date" name="de" defaultValue={from} /></label>
        <label><span className="label">Até</span><input className="input" type="date" name="ate" defaultValue={to} /></label>
        <label><span className="label">Operador</span><select className="input min-w-44" name="op" defaultValue={op ?? ""}><option value="">Todos os operadores</option>{all.map((m) => <option key={m.operator_id} value={m.operator_id}>{m.full_name}</option>)}</select></label>
        <button className="btn btn-quiet">Aplicar</button>
      </form>
      <div className="mb-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
        <Stat label="BMs criadas" value={num(sum("completed"))} />
        <Stat label="Etapas avançadas" value={num(sum("advances"))} note={plural(sum("rework"), "devolvida", "devolvidas")} />
        <Stat label="Meta do mês" value={goal ? percent(reached, goal) : "sem meta"} note={goal ? `${reached} de ${plural(goal, "BM", "BMs")}` : undefined} />
        <Stat label="Em andamento agora" value={num(sum("open_now"))} />
      </div>
      <section className="panel mb-5 overflow-x-auto p-0">
        <h2 className="px-5 pt-5 pb-2">Por operador</h2>
        <table className="table">
          <thead><tr><th>Operador</th><th className="w-32">Etapas</th><th className="n">BMs criadas</th><th className="n">Meta do mês</th><th className="n">% da meta</th><th className="n">Tempo médio</th><th className="n">Devoluções</th><th className="n">Abertas</th><th className="n">Dias ativos</th><th>Última ação</th></tr></thead>
          <tbody>{rows.map((m) => (
            <tr key={m.operator_id}>
              <td className="font-semibold whitespace-nowrap">{m.full_name}{!m.active && <span className="badge ml-2">Inativo</span>}</td>
              <td><div className="flex items-center gap-2.5"><span className="w-7 text-right tabular-nums">{m.advances}</span><span className="h-3 flex-1"><i className="block h-full rounded-r-[4px] bg-petrol" style={{ width: `${(Number(m.advances) / best) * 100}%` }} /></span></div></td>
              <td className="n">{m.completed}</td>
              <td className="n">{m.monthly_goal ? `${m.completed_month} de ${m.monthly_goal}` : "–"}</td>
              <td className="n">{m.monthly_goal ? percent(m.completed_month, m.monthly_goal) : "–"}</td><td className="n">{hours(m.avg_hours)}</td>
              <td className="n">{m.rework}</td><td className="n">{m.open_now}</td>
              <td className="n">{m.active_days}</td><td className="whitespace-nowrap">{m.last_action ? dateTime(m.last_action).slice(0, 5) + ", " + dateTime(m.last_action).slice(-5) : "Nenhuma"}</td>
            </tr>))}
          </tbody>
        </table>
        {!rows.length && <div className="px-5"><Empty>Nenhum operador para mostrar. Convide sua equipe em Equipe.</Empty></div>}
      </section>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <section className="panel min-w-0"><h2 className="mb-6">Etapas avançadas por dia, {dayMonth(from)} a {dayMonth(to)}</h2><DailyBars data={daily.data ?? []} /></section>
        <section className="panel min-w-0"><h2 className="mb-5">Tempo médio por etapa</h2><StageBars data={stages.data ?? []} /></section>
      </div>
    </>
  );
}
