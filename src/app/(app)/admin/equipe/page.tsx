import type { Metadata } from "next";
import { inviteMember, resetLink, transferClients, updateMember } from "@/actions/team";
import { ActionForm } from "@/components/form";
import { PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Equipe" };

export default async function Equipe() {
  await requireAdmin();
  const db = await createClient();
  const [{ data }, { data: counts }] = await Promise.all([
    db.from("profiles").select("*").order("active", { ascending: false }).order("full_name"), db.rpc("open_clients_by_member"),
  ]);
  const team = (data ?? []) as Profile[];
  const open = new Map(((counts ?? []) as { member_id: string; total: number }[]).map((x) => [x.member_id, Number(x.total)]));
  return (
    <>
      <PageHead title="Equipe" sub="Operadores cuidam das próprias BMs e têm meta. Administradores veem tudo e conferem documentos." />
      <section className="panel mb-5">
        <h2 className="mb-3">Convidar pessoa</h2>
        <ActionForm action={inviteMember} reset className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
          <label><span className="label">Nome completo</span><input className="input" name="full_name" required /></label>
          <label><span className="label">E-mail</span><input className="input" name="email" type="email" required /></label>
          <label><span className="label">Papel</span><select className="input" name="role"><option value="operador">Operador</option><option value="admin">Administrador</option></select></label>
          <button className="btn">Criar convite</button>
        </ActionForm>
      </section>
      <section className="panel"><ul>{team.map((p) => (
        <li key={p.id} className="grid gap-4 border-t border-[#e4ecec] py-4 first:border-0 first:pt-0 last:pb-0 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          <div className="min-w-0"><b className="font-semibold">{p.full_name}</b>{!p.active && <span className="badge ml-2">Inativo</span>}<div className="truncate text-sm text-soft">{p.email}</div>{p.role === "operador" && <div className="text-sm text-soft">{plural(open.get(p.id) ?? 0, "BM em aberto", "BMs em aberto")}</div>}</div>
          <ActionForm action={updateMember} className="flex flex-wrap items-end gap-3"><input type="hidden" name="user" value={p.id} />
            <label><span className="label">Papel</span><select className="input" name="role" defaultValue={p.role}><option value="operador">Operador</option><option value="admin">Administrador</option></select></label>
            {p.role === "operador"
              ? <label><span className="label">Meta mensal de BMs</span><input className="input w-24" name="goal" type="number" min={0} max={1000} defaultValue={p.monthly_goal} /></label>
              : <input type="hidden" name="goal" value={p.monthly_goal} />}
            <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="size-4" name="active" defaultChecked={p.active} />Ativo</label>
            <button className="btn btn-quiet">Salvar</button></ActionForm>
          <ActionForm action={resetLink}><input type="hidden" name="user" value={p.id} /><button className="btn btn-quiet">Gerar nova senha</button></ActionForm>
          {(open.get(p.id) ?? 0) > 0 && (
            <details className="lg:col-span-3"><summary className="link">Transferir BMs em aberto</summary>
              <ActionForm action={transferClients} className="mt-3 flex flex-wrap items-end gap-3"><input type="hidden" name="from" value={p.id} />
                <label><span className="label">Novo responsável</span><select className="input" name="to" required defaultValue=""><option value="" disabled>Escolha</option>
                  {team.filter((t) => t.active && t.role === "operador" && t.id !== p.id).map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}</select></label>
                <button className="btn btn-quiet">Transferir BMs</button></ActionForm></details>)}
        </li>))}</ul></section>
    </>
  );
}
