import type { Metadata } from "next";
import { updateStage } from "@/actions/team";
import { ActionForm } from "@/components/form";
import { PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STAGE_LABEL, type FlowStage } from "@/lib/types";

export const metadata: Metadata = { title: "Prazos" };

export default async function Prazos() {
  await requireAdmin();
  const { data } = await (await createClient()).from("stage_settings").select("*").order("position");
  return (
    <>
      <PageHead title="Prazos" sub="Horas corridas em cada etapa. Mudanças valem para o que ainda não foi avançado; o histórico mantém o prazo da época." />
      <section className="panel max-w-3xl"><ul>{((data ?? []) as { stage: FlowStage; sla_hours: number; counts_for_operator: boolean }[]).map((s) => (
        <li key={s.stage} className="border-t border-[#e4ecec] py-4 first:border-0 first:pt-0 last:pb-0">
          <ActionForm action={updateStage} className="flex flex-wrap items-end gap-4"><input type="hidden" name="stage" value={s.stage} />
            <b className="min-h-10 w-32 content-center font-semibold">{STAGE_LABEL[s.stage]}</b>
            <label><span className="label">Horas</span><input className="input w-28" type="number" name="sla" min={1} max={2000} defaultValue={s.sla_hours} /></label>
            <label className="flex min-h-10 items-center gap-2"><input type="checkbox" className="size-4" name="counts" defaultChecked={s.counts_for_operator} />Conta no prazo do operador</label>
            <button className="btn btn-quiet">Salvar</button></ActionForm>
        </li>))}</ul></section>
    </>
  );
}
