import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHead, StageAge, Trail } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { cnpj, date } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { FLOW, STAGE_LABEL, type ClientRow, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "BMs" };
type Search = { q?: string; ver?: string; op?: string };

export default async function Clientes({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireStaff();
  const sp = await searchParams;
  const db = await createClient();
  const list = sp.ver === "lista";
  let query = db.from("client_overview").select("*").order("priority").order("stage_entered_at").limit(500);
  if (!list) query = query.not("stage", "in", "(concluido,cancelado)");
  if (sp.op) query = query.eq("assigned_to", sp.op);
  const [{ data }, { data: team }] = await Promise.all([
    query, me.role === "admin" ? db.from("profiles").select("*").eq("active", true).eq("role", "operador").order("full_name") : { data: [] },
  ]);
  const q = (sp.q ?? "").trim().toLowerCase(), digits = q.replace(/[^0-9a-z]/g, "");
  const rows = ((data ?? []) as ClientRow[]).filter((c) =>
    !q || `${c.legal_name} ${c.trade_name ?? ""}`.toLowerCase().includes(q) || (digits && c.cnpj.toLowerCase().includes(digits)));
  const tab = (ver: string, label: string) => {
    const params = new URLSearchParams({ ver, ...(sp.q && { q: sp.q }), ...(sp.op && { op: sp.op }) });
    const on = (ver === "lista") === list;
    return <Link href={`/clientes?${params}`} aria-current={on ? "page" : undefined} className={`btn ${on ? "" : "btn-quiet"}`}>{label}</Link>;
  };
  return (
    <>
      <PageHead title="BMs" sub="Portfólios empresariais em criação e já criados."><Link href="/clientes/novo" className="btn">Cadastrar BM</Link></PageHead>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <form className="flex flex-1 flex-wrap gap-3">
          <input type="hidden" name="ver" value={list ? "lista" : "quadro"} />
          <input className="input max-w-xs" name="q" defaultValue={sp.q} placeholder="Nome ou CNPJ" aria-label="Buscar BM" />
          {me.role === "admin" && (
            <select className="input max-w-52" name="op" defaultValue={sp.op ?? ""} aria-label="Responsável">
              <option value="">Todos os operadores</option>
              {((team ?? []) as Profile[]).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          )}
          <button className="btn btn-quiet">Filtrar</button>
        </form>
        <div className="flex gap-2">{tab("quadro", "Quadro")}{tab("lista", "Lista")}</div>
      </div>
      {list ? (
        <div className="panel overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>BM</th><th>CNPJ</th><th>Etapa</th><th className="w-44">Andamento</th><th>Responsável</th><th>Tempo na etapa</th><th>Entrada</th></tr></thead>
            <tbody>{rows.map((c) => (
              <tr key={c.id}>
                <td><Link className="link" href={`/clientes/${c.id}`}>{c.trade_name || c.legal_name}</Link></td>
                <td className="whitespace-nowrap tabular-nums">{cnpj(c.cnpj)}</td><td>{c.stage === "concluido" && c.portfolio === "existente" ? "Concluída" : STAGE_LABEL[c.stage]}</td>
                <td><Trail stage={c.stage} /></td>
                <td>{c.assigned_name ?? "Sem responsável"}</td><td><StageAge row={c} /></td><td>{date(c.created_at)}</td>
              </tr>))}
            </tbody>
          </table>
          {!rows.length && <div className="px-5"><Empty>Nenhuma BM encontrada com esses filtros.</Empty></div>}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {FLOW.map((s) => {
            const col = rows.filter((c) => c.stage === s);
            return (
              <section key={s} className="w-[198px] shrink-0 grow">
                <h2 className="mb-3 flex justify-between border-b-2 border-petrol pb-2"><span>{STAGE_LABEL[s]}</span><span className="text-soft">{col.length}</span></h2>
                <ul className="space-y-2.5">{col.map((c) => (
                  <li key={c.id} className="rounded-lg border border-line bg-paper p-3">
                    <Link href={`/clientes/${c.id}`} className="link mb-1 block leading-snug">{c.trade_name || c.legal_name}</Link>
                    <p className="mb-2.5 text-sm text-soft">{c.assigned_name ?? "Sem responsável"}{c.priority === 1 && ", prioridade alta"}</p>
                    <StageAge row={c} />
                  </li>))}
                </ul>
                {!col.length && <p className="text-sm text-soft">Nenhuma BM nesta etapa.</p>}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
