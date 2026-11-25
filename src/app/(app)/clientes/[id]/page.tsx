import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addNote, assignClient, moveStage, recordSiteReply, reviewDocument, saveSite, toggleChecklist, updateClient } from "@/actions/clients";
import { ActionForm } from "@/components/form";
import { Upload } from "@/components/upload";
import { StageAge, Empty, PageHead, StatusBadge, Trail } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { activityDetail } from "@/lib/activity";
import { bytes, cnpj, dateTime, plural } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import {
  ACTION_LABEL, DOC_LABEL, FLOW, PORTFOLIO_LABEL, PRIORITY_LABEL, STAGE_LABEL, type Activity, type ChecklistItem, type Client,
  type ClientRow, type Doc, type Profile, type Site, type Stage,
} from "@/lib/types";

export const metadata: Metadata = { title: "BM" };
const SITE_LABEL = { rascunho: "Rascunho", em_aprovacao: "Aguardando o cliente", aprovado: "Aprovado pelo cliente", ajustes: "Cliente pediu ajustes" };
const Id = ({ id }: { id: string }) => <input type="hidden" name="client" value={id} />;

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStaff();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const db = await createClient();
  const [client, overview, uses, docs, site, checklist, notes, feed, blockers, team] = await Promise.all([
    db.from("clients").select("*").eq("id", id).maybeSingle(),
    db.from("client_overview").select("*").eq("id", id).maybeSingle(),
    db.rpc("cnpj_other_uses", { p_client: id }),
    db.from("documents").select("*").eq("client_id", id).order("uploaded_at", { ascending: false }),
    db.from("sites").select("*").eq("client_id", id).maybeSingle(),
    db.from("checklist_items").select("*").eq("client_id", id).order("position"),
    db.from("note_feed").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    db.from("activity_feed").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(30),
    db.rpc("stage_blockers", { p_client: id }),
    db.from("profiles").select("*").eq("active", true).eq("role", "operador").order("full_name"),
  ]);
  if (!client.data || !overview.data) notFound();
  const c = client.data as Client, row = overview.data as ClientRow, st = site.data as Site | null;
  const closed = c.stage === "concluido" || c.stage === "cancelado";
  const missing = (blockers.data ?? []) as string[];
  const others = Number(uses.data ?? 0);
  const items = ((checklist.data ?? []) as ChecklistItem[]).filter((i) => i.stage === c.stage);
  const at = c.stage === "concluido" ? FLOW.length : FLOW.indexOf(c.stage as (typeof FLOW)[number]);
  const previous = FLOW.slice(0, Math.max(at, 0)) as readonly Stage[];
  const reg = c.registry;
  return (
    <>
      <PageHead title={c.trade_name || c.legal_name} sub={`${c.legal_name}, CNPJ ${cnpj(c.cnpj)}`}><StageAge row={row} /></PageHead>
      {others > 0 && <p className="mb-5"><span className="badge badge-warn">CNPJ também em uso em {plural(others, "outra BM", "outras BMs")}</span></p>}
      {c.stage !== "cancelado" && <div className="mb-6"><Trail stage={c.stage} labels /></div>}
      <div className="grid items-start gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="grid min-w-0 gap-5">
          <section className="panel">
            <h2 className="mb-3">{closed ? (c.stage === "concluido" && c.portfolio === "existente" ? "Concluída, fora da meta" : STAGE_LABEL[c.stage]) : `Próximo passo em ${STAGE_LABEL[c.stage]}`}</h2>
            {!closed && (missing.length > 0
              ? <ul className="mb-4 list-disc space-y-1 pl-5">{missing.map((b) => <li key={b}>{b}</li>)}</ul>
              : <p className="mb-4">Tudo pronto para avançar.</p>)}
            {!closed && <ActionForm action={moveStage}><Id id={id} /><input type="hidden" name="direction" value="avancar" />
              <button className="btn" disabled={missing.length > 0}>{at === FLOW.length - 1 ? "Concluir processo" : `Avançar para ${STAGE_LABEL[FLOW[at + 1]]}`}</button></ActionForm>}
            {c.stage === "cancelado" && me.role === "admin" && <ActionForm action={moveStage}><Id id={id} /><input type="hidden" name="direction" value="reabrir" /><button className="btn btn-quiet">Reabrir processo</button></ActionForm>}
            {c.stage !== "cancelado" && (!closed || me.role === "admin") && (
              <details className="mt-4"><summary className="link">Devolver ou cancelar</summary>
                <ActionForm action={moveStage} reset className="mt-3 grid gap-3 sm:grid-cols-2" confirm="Confira o motivo e clique de novo para confirmar."><Id id={id} />
                  <label className="sm:col-span-2"><span className="label">Motivo</span><input className="input" name="reason" required minLength={5} /></label>
                  <label><span className="label">O que fazer</span><select className="input" name="direction">{previous.length > 0 && <option value="devolver">Devolver para outra etapa</option>}{!closed && <option value="cancelar">Cancelar processo</option>}</select></label>
                  {previous.length > 0 && <label><span className="label">Etapa de destino</span><select className="input" name="to">{previous.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select></label>}
                  <div><button className="btn btn-bad">Registrar</button></div>
                </ActionForm>
              </details>)}
            {items.length > 0 && <ul className="mt-5 space-y-2 border-t border-[#e4ecec] pt-4">{items.map((i) => (
              <li key={i.key}><ActionForm action={toggleChecklist} className="flex flex-wrap items-center justify-between gap-3"><Id id={id} /><input type="hidden" name="key" value={i.key} /><input type="hidden" name="done" value={String(!i.done_at)} />
                <span className={i.done_at ? "text-soft line-through" : ""}>{i.label}</span><button className="btn btn-quiet">{i.done_at ? "Desmarcar" : "Marcar como feito"}</button></ActionForm></li>))}</ul>}
          </section>

          <section className="panel">
            <h2 className="mb-3">Documentos</h2>
            {!closed && <div className="mb-4"><Upload client={id} /></div>}
            {!docs.data?.length && <Empty>Nenhum documento anexado. Anexe os arquivos recebidos do cliente, sem alterações.</Empty>}
            <ul>{((docs.data ?? []) as Doc[]).map((d) => (
              <li key={d.id} className="border-t border-[#e4ecec] py-3.5 first:border-0 first:pt-0">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><a className="link" href={`/api/documentos/${d.id}`} target="_blank" rel="noreferrer">{DOC_LABEL[d.kind]}</a> {d.kind !== "aprovacao_site" && <StatusBadge status={d.status} />}</div>
                  <span className="text-sm text-soft">{dateTime(d.uploaded_at)}</span></div>
                <p className="truncate text-sm text-soft" title={`SHA-256: ${d.sha256}`}>{d.file_name} ({bytes(d.size_bytes)}), impressão digital {d.sha256.slice(0, 12)}</p>
                {d.review_note && <p className="text-sm">Observação: {d.review_note}</p>}
                {d.status === "pendente" && d.kind !== "aprovacao_site" && d.uploaded_by === me.id && <p className="mt-1 text-sm text-soft">Aguardando conferência de outra pessoa da equipe.</p>}
                {d.status === "pendente" && d.kind !== "aprovacao_site" && d.uploaded_by !== me.id && (d.kind !== "procuracao" || me.role === "admin") && (
                  <ActionForm action={reviewDocument} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="doc" value={d.id} />
                    <input className="input w-auto grow" name="note" placeholder="Observação (obrigatória ao recusar)" aria-label="Observação" />
                    <button className="btn" name="decision" value="sim">Aprovar</button><button className="btn btn-bad" name="decision" value="nao">Recusar</button></ActionForm>)}
              </li>))}</ul>
          </section>

          {st && <section className="panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2>Site em {c.domain ?? "domínio a definir"}</h2><span className={`badge ${st.status === "aprovado" ? "badge-ok" : st.status === "ajustes" ? "badge-warn" : ""}`}>{SITE_LABEL[st.status]}</span></div>
            {st.client_note && <p className="mb-3">Cliente: {st.client_note}</p>}
            {st.content.headline && <a className="btn btn-quiet mb-4" href={`/api/sites/${id}?previa=1`} target="_blank" rel="noreferrer">Ver prévia</a>}
            {c.stage === "site" && st.status === "em_aprovacao" && (
              <ActionForm action={recordSiteReply} className="mb-5 space-y-2"><Id id={id} />
                <p>Envie a prévia ao cliente. Ao receber a resposta, anexe o print em Documentos e registre aqui.</p>
                <input className="input" name="note" placeholder="O que o cliente pediu (obrigatório para ajustes)" aria-label="Resposta do cliente" />
                <div className="flex flex-wrap gap-2"><button className="btn" name="decision" value="sim">Cliente aprovou</button><button className="btn btn-quiet" name="decision" value="nao">Cliente pediu ajustes</button></div></ActionForm>)}
            {c.stage === "site" ? (
              <ActionForm action={saveSite} className="grid gap-3 sm:grid-cols-2"><Id id={id} />
                <label><span className="label">Domínio do site (do cliente ou da agência)</span><input className="input" name="domain" defaultValue={c.domain ?? ""} placeholder="empresa.com.br" /></label>
                <label><span className="label">Telefone da empresa</span><input className="input" name="phone" type="tel" defaultValue={c.public_phone ?? ""} /></label>
                <label className="sm:col-span-2"><span className="label">Título</span><input className="input" name="headline" defaultValue={st.content.headline} maxLength={160} /></label>
                <label className="sm:col-span-2"><span className="label">Sobre a empresa</span><textarea className="input" rows={5} name="about" defaultValue={st.content.about} /></label>
                <label className="sm:col-span-2"><span className="label">Serviços (um por linha)</span><textarea className="input" rows={4} name="services" defaultValue={st.content.services?.join("\n")} /></label>
                <label><span className="label">Horário de atendimento</span><input className="input" name="hours" defaultValue={st.content.hours} /></label>
                <label><span className="label">E-mail de contato</span><input className="input" name="email" type="email" defaultValue={st.content.email} /></label>
                <label className="sm:col-span-2"><span className="label">Código de verificação de domínio da Meta</span><input className="input" name="metaTag" defaultValue={st.content.metaTag} /></label>
                <div className="flex gap-2 sm:col-span-2"><button className="btn" name="decision" value="enviar">Fechar versão para aprovação</button><button className="btn btn-quiet" name="decision" value="rascunho">Salvar rascunho</button></div>
              </ActionForm>
            ) : st.status !== "aprovado" && <p className="text-soft">O conteúdo é editado na etapa Site.</p>}
            {st.status === "aprovado" && <a className="btn btn-quiet mt-3" href={`/api/sites/${id}`}>Baixar site aprovado</a>}
          </section>}

          <section className="panel">
            <h2 className="mb-3">Anotações</h2>
            <ActionForm action={addNote} reset className="mb-3"><Id id={id} /><textarea className="input" name="body" rows={2} aria-label="Nova anotação" /><button className="btn btn-quiet mt-2">Salvar anotação</button></ActionForm>
            <ul>{(notes.data ?? []).map((n) => <li key={n.id} className="border-t border-[#e4ecec] py-3"><p className="whitespace-pre-line">{n.body}</p><p className="text-sm text-soft">{n.author_name}, {dateTime(n.created_at)}</p></li>)}</ul>
          </section>
        </div>

        <div className="grid min-w-0 gap-5">
          <section className="panel">
            <h2 className="mb-3">Dados</h2>
            <dl className="mb-4 space-y-2 text-sm">{([["Titular", c.contact_name], ["Telefone do titular", c.contact_phone], ["Portfólio", PORTFOLIO_LABEL[c.portfolio]], ["Sócios no cadastro", c.partners.join(", ") || "Não informados"], ["Atividade", reg.cnae], ["Endereço", [reg.endereco, reg.municipio, reg.uf, reg.cep].filter(Boolean).join(", ")], ["Telefone da empresa", c.public_phone]] as const).map(([k, v]) => <div key={k}><dt className="text-soft">{k}</dt><dd>{v || "Não informado"}</dd></div>)}</dl>
            <details><summary className="link">Editar dados de trabalho</summary>
              <ActionForm action={updateClient} className="mt-3 space-y-3"><Id id={id} />
                <label className="block"><span className="label">Nome fantasia</span><input className="input" name="trade_name" defaultValue={c.trade_name ?? ""} /></label>
                <label className="block"><span className="label">Telefone do titular</span><input className="input" name="contact_phone" defaultValue={c.contact_phone ?? ""} /></label>
                <label className="block"><span className="label">Prioridade</span><select className="input" name="priority" defaultValue={c.priority}>{Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="block"><span className="label">Portfólio na Meta</span><select className="input" name="portfolio" defaultValue={c.portfolio}>{Object.entries(PORTFOLIO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <button className="btn btn-quiet">Salvar dados</button></ActionForm></details>
          </section>
          <section className="panel">
            <h2 className="mb-3">Responsável</h2>
            {me.role === "admin" ? <ActionForm action={assignClient} className="flex flex-wrap gap-2"><Id id={id} />
              <select className="input w-auto grow" name="operator" defaultValue={c.assigned_to ?? ""} aria-label="Responsável">{!((team.data ?? []) as Profile[]).some((p) => p.id === c.assigned_to) && <option value="">Escolha</option>}{((team.data ?? []) as Profile[]).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
              <button className="btn btn-quiet">Trocar</button></ActionForm> : <p>{row.assigned_name ?? "Sem responsável"}</p>}
          </section>
          <section className="panel">
            <h2 className="mb-3">Histórico</h2>
            <ul className="space-y-2.5 text-sm">{((feed.data ?? []) as Activity[]).map((a) => <li key={a.id}><b className="font-semibold">{a.actor_name ?? "Sistema"}</b> {ACTION_LABEL[a.action] ?? a.action}{activityDetail(a) && `: ${activityDetail(a)}`}<br /><span className="text-soft">{dateTime(a.created_at)}</span></li>)}</ul>
          </section>
        </div>
      </div>
    </>
  );
}
