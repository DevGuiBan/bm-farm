import { CircleAlert, CircleCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { reviewAuthorization } from "@/actions/clients";
import { ActionForm } from "@/components/form";
import { Empty, PageHead } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { cnpj, dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { QueueRow } from "@/lib/types";

export const metadata: Metadata = { title: "Autorizações" };

function alerts(q: QueueRow) {
  const list: string[] = [];
  if (!q.signer_in_registry) list.push("Signatário não aparece no quadro societário");
  if (q.signer_role === "procurador" && !q.has_power_of_attorney) list.push("Procuração ainda não aprovada");
  if (q.registry_email && q.registry_email !== q.signer_email) list.push(`E-mail difere do cadastro público (${q.registry_email})`);
  if (Number(q.same_email)) list.push(`Mesmo e-mail em ${q.same_email} outro(s) cliente(s)`);
  if (Number(q.same_ip)) list.push(`Assinada do mesmo IP que ${q.same_ip} outro(s) cliente(s)`);
  if (Number(q.same_domain)) list.push("Domínio já declarado por outro cliente");
  if (Number(q.same_phone)) list.push("Telefone já declarado por outro cliente");
  return list;
}

export default async function Autorizacoes() {
  await requireAdmin();
  const { data } = await (await createClient()).rpc("authorization_queue");
  const queue = (data ?? []) as QueueRow[];
  return (
    <>
      <PageHead title="Autorizações" sub="Confira se quem assinou representa a empresa. Na dúvida, ligue para o número do cadastro público antes de aprovar." />
      {!queue.length && <div className="panel"><Empty>Nenhuma autorização aguardando conferência.</Empty></div>}
      <div className="grid gap-5">{queue.map((q) => {
        const warn = alerts(q);
        return (
          <article key={q.id} className="panel grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <h2><Link className="link" href={`/clientes/${q.client_id}`}>{q.legal_name}</Link></h2>
              <p className="mb-3 text-sm text-soft">CNPJ {cnpj(q.cnpj)}, responsável {q.assigned_name ?? "não definido"}</p>
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">{([["Signatário", `${q.signer_name} (${q.signer_role === "socio" ? "sócio ou administrador" : "procurador"})`], ["Sócios no cadastro", q.partners.join(", ") || "Não informados"], ["E-mail confirmado", q.signer_email], ["Telefone declarado", q.public_phone], ["Telefone do cadastro público", q.registry_phone ?? "Não informado"], ["Domínio declarado", q.domain], ["Assinada em", `${dateTime(q.signed_at)}, IP ${q.ip ?? "não registrado"}`]] as const).map(([k, v]) => <div key={k}><dt className="text-soft">{k}</dt><dd className="break-words">{v}</dd></div>)}</dl>
            </div>
            <div>
              {warn.length ? <ul className="mb-4 space-y-1.5">{warn.map((w) => <li key={w} className="flex gap-2 text-warn"><CircleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />{w}</li>)}</ul>
                : <p className="mb-4 flex gap-2 text-ok"><CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden />Nenhum sinal de alerta.</p>}
              {q.is_mine ? <p className="text-soft">Você é responsável por este cliente. Outro administrador precisa conferir.</p> : (
                <ActionForm action={reviewAuthorization} className="space-y-2"><input type="hidden" name="auth" value={q.id} />
                  <input className="input" name="note" placeholder="Observação (obrigatória ao recusar)" aria-label="Observação" />
                  <div className="flex gap-2"><button className="btn" name="decision" value="sim">Aprovar</button><button className="btn btn-bad" name="decision" value="nao">Recusar</button></div></ActionForm>)}
            </div>
          </article>);
      })}</div>
    </>
  );
}
