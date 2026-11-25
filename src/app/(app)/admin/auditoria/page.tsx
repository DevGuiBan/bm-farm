import type { Metadata } from "next";
import Link from "next/link";
import { Empty, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { activityDetail } from "@/lib/activity";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ACTION_LABEL, type Activity, type Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Auditoria" };
const SIZE = 50;

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ p?: string; op?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(Number(sp.p) || 1, 1);
  const op = /^[0-9a-f-]{36}$/.test(sp.op ?? "") ? sp.op! : "";
  const db = await createClient();
  let q = db.from("activity_feed").select("*").order("created_at", { ascending: false }).range((page - 1) * SIZE, page * SIZE);
  if (op) q = q.eq("actor_id", op);
  const [{ data }, { data: team }] = await Promise.all([q, db.from("profiles").select("*").order("full_name")]);
  const rows = (data ?? []) as Activity[];
  const link = (n: number) => `/admin/auditoria?p=${n}${op ? `&op=${op}` : ""}`;
  return (
    <>
      <PageHead title="Auditoria" sub="Registro permanente. Nem administradores conseguem editar ou apagar." />
      <form className="mb-5 flex gap-3"><select className="input max-w-60" name="op" defaultValue={op} aria-label="Pessoa"><option value="">Todas as pessoas</option>{((team ?? []) as Profile[]).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select><button className="btn btn-quiet">Filtrar</button></form>
      <div className="panel overflow-x-auto p-0">
        <table className="table"><thead><tr><th>Quando</th><th>Quem</th><th>O que fez</th><th>BM</th><th>Detalhe</th></tr></thead>
          <tbody>{rows.slice(0, SIZE).map((a) => (
            <tr key={a.id}><td className="whitespace-nowrap tabular-nums">{dateTime(a.created_at)}</td><td>{a.actor_name ?? "Sistema"}</td><td>{ACTION_LABEL[a.action] ?? a.action}</td>
              <td>{a.client_id && <Link className="link" href={`/clientes/${a.client_id}`}>{a.legal_name}</Link>}</td>
              <td className="max-w-72 text-sm break-words text-soft">{activityDetail(a)}</td></tr>))}</tbody></table>
        {!rows.length && <div className="px-5"><Empty>Nenhum registro com esse filtro.</Empty></div>}
      </div>
      <div className="mt-4 flex gap-2">{page > 1 && <Link className="btn btn-quiet" href={link(page - 1)}>Mais recentes</Link>}{rows.length > SIZE && <Link className="btn btn-quiet" href={link(page + 1)}>Mais antigos</Link>}</div>
    </>
  );
}
