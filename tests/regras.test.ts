import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb } from "./db";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ANA = "00000000-0000-0000-0000-00000000000b";
const BIA = "00000000-0000-0000-0000-00000000000c";
const OUTSIDER = "00000000-0000-0000-0000-00000000000d";

let db: PGlite;
let client: string;

const create = (actor: string, cnpj: string, o: { portfolio?: string; reuse?: boolean } = {}) =>
  as<{ id: string }>(db, "service_role", null,
    "select create_client($1,$2,'EMPRESA TESTE LTDA',null,'{}','{JOSÉ DA SILVA}','José',null,null,$3,$4) id",
    [actor, cnpj, o.portfolio ?? "novo", o.reuse ?? false]).then((r) => r[0].id);
const attach = (uid: string, id: string, kind: string, path = `${id}/${kind}`) =>
  as(db, "service_role", null, "select add_document($1,$2,$3::doc_kind,$4,'a.pdf','application/pdf',1,'h')", [uid, id, kind, path]);
const advance = (uid: string, id: string) => as(db, "authenticated", uid, "select move_stage($1,'avancar')", [id]);
const docs = async (id: string, kind: string) =>
  (await db.query<{ id: string }>("select id from documents where client_id=$1 and kind=$2::doc_kind order by uploaded_at desc", [id, kind])).rows[0].id;
const review = (uid: string, doc: string, ok = true) => as(db, "authenticated", uid, "select review_document($1,$2,'motivo da análise')", [doc, ok]);
const saveSite = (uid: string, id: string, domain: string | null = "empresateste.com.br", phone: string | null = "(11) 3333-4444") =>
  as(db, "authenticated", uid, "select save_site($1,'{}',true,$2,$3)", [id, domain, phone]);
/** Leva uma BM nova até a conclusão. */
const finish = async (uid: string, id: string) => {
  for (const k of ["contrato_social", "comprovante_endereco", "documento_signatario"]) {
    await attach(uid, id, k);
    await review(ADMIN, await docs(id, k));
  }
  await advance(uid, id);
  await saveSite(uid, id);
  await new Promise((r) => setTimeout(r, 20));
  await attach(uid, id, "aprovacao_site");
  await as(db, "authenticated", uid, "select record_site_reply($1,true,null)", [id]);
  await advance(uid, id);
  for (const s of ["meta", "verificacao"]) {
    for (const i of (await db.query<{ key: string }>("select key from checklist_items where client_id=$1 and stage=$2", [id, s])).rows)
      await as(db, "authenticated", uid, "select toggle_checklist($1,$2,true)", [id, i.key]);
    await advance(uid, id);
  }
};
const made = async (uid: string) => {
  const rows = await as<{ operator_id: string; completed: number; completed_month: number }>(db, "authenticated", ADMIN, "select * from operator_metrics(current_date-2,current_date+1)");
  const days = await as<{ completed: number }>(db, "authenticated", ADMIN, "select * from daily_advances(current_date-2,current_date+1,$1)", [uid]);
  const m = rows.find((r) => r.operator_id === uid)!;
  expect(days.reduce((t, d) => t + Number(d.completed), 0)).toBe(Number(m.completed));
  expect(Number(m.completed_month)).toBe(Number(m.completed));
  return Number(m.completed);
};

beforeAll(async () => {
  db = await createDb();
  for (const [id, name, email, role] of [
    [ADMIN, "Admin", "admin@agencia.com", "admin"], [ANA, "Ana Lima", "ana@agencia.com", "operador"],
    [BIA, "Bia Reis", "bia@agencia.com", "operador"]]) {
    await db.query("insert into auth.users values ($1,$2)", [id, email]);
    await db.query("insert into profiles (id,full_name,email,role) values ($1,$2,$3,$4)", [id, name, email, role]);
  }
  await db.query("insert into auth.users values ($1,'cliente@x.com')", [OUTSIDER]);
  client = await create(ANA, "11222333000181");
}, 60000);

describe("isolamento", () => {
  it("operador só vê os próprios clientes; admin vê todos", async () => {
    expect(await as(db, "authenticated", ANA, "select id from clients")).toHaveLength(1);
    expect(await as(db, "authenticated", BIA, "select id from client_overview")).toHaveLength(0);
    expect(await as(db, "authenticated", ADMIN, "select id from clients")).toHaveLength(1);
  });
  it("usuário autenticado sem perfil não vê nada", async () => {
    for (const t of ["clients", "profiles", "activity_log", "documents"])
      expect(await as(db, "authenticated", OUTSIDER, `select 1 from ${t}`)).toHaveLength(0);
    expect(await as(db, "authenticated", OUTSIDER, "select * from operator_metrics(current_date-30,current_date)")).toHaveLength(0);
  });
  it("anon não lê tabelas nem executa funções", async () => {
    await expect(as(db, "anon", null, "select 1 from clients")).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, "select is_staff()")).rejects.toThrow(/permission denied/);
  });
  it("ninguém escreve direto nas tabelas", async () => {
    for (const sql of ["update clients set stage='concluido'", "update profiles set role='admin'", "delete from activity_log",
      "insert into stage_history (client_id,stage,entered_at,to_stage,outcome) select id,'meta',now(),'concluido','avanco' from clients"])
      for (const uid of [ANA, ADMIN])
        await expect(as(db, "authenticated", uid, sql)).rejects.toThrow(/permission denied/);
  });
  it("equipe não chama funções só do servidor", async () => {
    await expect(as(db, "authenticated", ANA, "select add_document($1,$2,'outro','x','x','x',1,'x')", [ANA, client])).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", ANA, "select create_client($1,'11222333000181','x',null,'{}','{}','x',null,null,'novo',true)", [ANA])).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", ANA, "select log_event($1,null,'x')", [ANA])).rejects.toThrow(/permission denied/);
  });
  it("operador não age em cliente alheio nem em funções de admin", async () => {
    await expect(advance(BIA, client)).rejects.toThrow(/Sem acesso/);
    await expect(as(db, "authenticated", ANA, "select update_member($1,'admin',true,0)", [ANA])).rejects.toThrow(/administradores/);
    await expect(as(db, "authenticated", ANA, "select assign_client($1,$2)", [client, BIA])).rejects.toThrow(/administradores/);
  });
  it("membro desativado perde o acesso", async () => {
    await as(db, "authenticated", ADMIN, "select update_member($1,'operador',false,0)", [BIA]);
    expect(await as(db, "authenticated", BIA, "select 1 from profiles")).toHaveLength(0);
    await as(db, "authenticated", ADMIN, "select update_member($1,'operador',true,0)", [BIA]);
  });
  it("desativar exige transferir os clientes em aberto", async () => {
    const off = () => as(db, "authenticated", ADMIN, "select update_member($1,'operador',false,0)", [BIA]);
    const transfer = (uid: string, from: string, to: string) => as(db, "authenticated", uid, "select transfer_clients($1,$2)", [from, to]);
    const id = await create(BIA, "11222333000696");
    await expect(off()).rejects.toThrow(/Transfira antes/);
    await expect(transfer(ANA, BIA, ANA)).rejects.toThrow(/administradores/);
    await expect(transfer(ADMIN, BIA, BIA)).rejects.toThrow(/outra pessoa/);
    await expect(transfer(ADMIN, BIA, ADMIN)).rejects.toThrow(/Só um operador/);
    await expect(as(db, "authenticated", ADMIN, "select update_member($1,'admin',true,0)", [BIA])).rejects.toThrow(/Transfira antes/);
    await transfer(ADMIN, BIA, ANA);
    expect((await db.query<{ assigned_to: string }>("select assigned_to from clients where id=$1", [id])).rows[0].assigned_to).toBe(ANA);
    await off();
    await expect(transfer(ADMIN, ANA, BIA)).rejects.toThrow(/outra pessoa/);
    await as(db, "authenticated", ADMIN, "select update_member($1,'operador',true,0)", [BIA]);
    expect(await as(db, "authenticated", ANA, "select * from open_clients_by_member()")).toHaveLength(0);
  });
});

describe("contrato feito por fora", () => {
  it("a assinatura pelo sistema não existe mais", async () => {
    const { rows } = await db.query("select 1 from information_schema.tables where table_schema='public' and table_name in ('authorizations','portal_invites')");
    expect(rows).toHaveLength(0);
    const fns = await db.query("select 1 from pg_proc where proname in ('portal_sign','portal_revoke','create_invite','review_authorization','authorization_queue')");
    expect(fns.rows).toHaveLength(0);
    expect((await db.query<{ stage: string }>("select stage from clients where id=$1", [client])).rows[0].stage).toBe("documentos");
    await expect(db.query("update clients set stage='autorizacao' where id=$1", [client])).rejects.toThrow(/stage_in_use/);
  });
  it("contrato não é exigido no sistema; os documentos da empresa são", async () => {
    await expect(advance(ANA, client)).rejects.toThrow(/^(?!.*Contrato assinado).*contrato social/);
  });
  it("procuração só é conferida por administrador que não a anexou", async () => {
    await attach(ANA, client, "procuracao");
    const d = await docs(client, "procuracao");
    await expect(review(ANA, d)).rejects.toThrow(/administradores/);
    await review(ADMIN, d);
    await attach(ADMIN, client, "procuracao", "p2");
    await expect(review(ADMIN, await docs(client, "procuracao"))).rejects.toThrow(/Quem anexou/);
  });
});

describe("CNPJ repetido", () => {
  const CNPJ = "11222333000777";
  it("avisa com quem está e só segue com confirmação, registrada na auditoria", async () => {
    const a = await create(ANA, CNPJ);
    await expect(create(BIA, CNPJ)).rejects.toThrow(/já está em uso em 1 BM \(Ana Lima\)/);
    const b = await create(BIA, CNPJ, { reuse: true });
    await expect(create(BIA, CNPJ)).rejects.toThrow(/2 BMs \(Ana Lima, Bia Reis\)/);
    const log = (await db.query<{ client_id: string }>("select client_id from activity_log where action='cnpj_reutilizado'")).rows;
    expect(log.map((r) => r.client_id)).toEqual([b]);
    const uses = (uid: string, id: string) => as<{ n: number }>(db, "authenticated", uid, "select cnpj_other_uses($1) n", [id]).then((r) => Number(r[0].n));
    expect(await uses(BIA, b)).toBe(1);
    await expect(uses(BIA, a)).rejects.toThrow(/Sem acesso/);
    expect(await as(db, "authenticated", BIA, "select 1 from clients where id=$1", [a])).toHaveLength(0);
    for (const [uid, id] of [[ANA, a], [BIA, b]]) await as(db, "authenticated", uid, "select move_stage($1,'cancelar',null,'Teste encerrado')", [id]);
    await create(ANA, CNPJ); // canceladas não contam como uso
  });
});

describe("o que conta na meta", () => {
  it("portfólio que já existia é atendido, mas não conta", async () => {
    const before = await made(BIA);
    const id = await create(BIA, "11222333000858", { portfolio: "existente" });
    await finish(BIA, id);
    expect((await db.query<{ stage: string }>("select stage from clients where id=$1", [id])).rows[0].stage).toBe("concluido");
    expect(await made(BIA)).toBe(before);
  });
  it("operador não transforma existente em novo, e o tipo trava ao concluir", async () => {
    const set = (uid: string, id: string, v: string) => as(db, "authenticated", uid, "select update_client($1,null,null,2,$2)", [id, v]);
    const id = await create(BIA, "11222333000939");
    await set(BIA, id, "existente");
    await expect(set(BIA, id, "novo")).rejects.toThrow(/administrador/);
    await set(ADMIN, id, "novo");
    await expect(set(BIA, id, "outro")).rejects.toThrow(/check/);
    await finish(BIA, id);
    await expect(set(ADMIN, id, "existente")).rejects.toThrow(/encerrado/);
  });
  it("devolvida depois de concluída deixa de contar, e ao concluir de novo conta uma vez", async () => {
    const before = await made(BIA);
    const id = await create(BIA, "11222333001072");
    await finish(BIA, id);
    expect(await made(BIA)).toBe(before + 1);
    await as(db, "authenticated", ADMIN, "select move_stage($1,'devolver','verificacao','Verificação caiu')", [id]);
    expect(await made(BIA)).toBe(before);
    await advance(BIA, id);
    expect(await made(BIA)).toBe(before + 1);
  });
  it("reabrir volta para Documentos", async () => {
    const id = await create(BIA, "11222333001153");
    await as(db, "authenticated", BIA, "select move_stage($1,'cancelar',null,'Desistência')", [id]);
    await as(db, "authenticated", ADMIN, "select move_stage($1,'reabrir')", [id]);
    expect((await db.query<{ stage: string }>("select stage from clients where id=$1", [id])).rows[0].stage).toBe("documentos");
    await expect(as(db, "authenticated", ADMIN, "select move_stage($1,'devolver','autorizacao','Motivo qualquer')", [id])).rejects.toThrow(/etapa anterior/);
  });
});

describe("fluxo completo e indicadores", () => {
  it("documentos originais são imutáveis e liberam a etapa", async () => {
    await expect(advance(ANA, client)).rejects.toThrow(/contrato social/);
    for (const k of ["contrato_social", "comprovante_endereco", "documento_signatario"])
      await attach(ANA, client, k);
    await expect(attach(BIA, client, "outro")).rejects.toThrow(/Sem acesso/);
    await expect(as(db, "service_role", null, "update documents set sha256='x'")).rejects.toThrow(/original/);
    await expect(as(db, "service_role", null, "delete from documents")).rejects.toThrow(/imutável/);
    for (const d of (await db.query<{ id: string }>("select id from documents where client_id=$1 and kind <> 'procuracao'", [client])).rows)
    {
      await expect(as(db, "authenticated", ANA, "select review_document($1,true,null)", [d.id])).rejects.toThrow(/Quem anexou/);
      await as(db, "authenticated", ADMIN, "select review_document($1,true,null)", [d.id]);
    }
    await advance(ANA, client);
  });
  it("aprovação do site exige print desta versão", async () => {
    await expect(saveSite(ANA, client, null)).rejects.toThrow(/domínio/);
    await expect(saveSite(ANA, client, "empresateste.com.br", "123")).rejects.toThrow(/DDD/);
    await expect(saveSite(ANA, client, "empresa.pages.dev")).rejects.toThrow(/domain_is_own/);
    await saveSite(ANA, client, "cliente.agencia.com.br"); // subdomínio da agência vale
    await expect(advance(ANA, client)).rejects.toThrow(/site/);
    const tick = () => new Promise((r) => setTimeout(r, 20));
    const ok = () => as(db, "authenticated", ANA, "select record_site_reply($1,true,null)", [client]);
    await expect(ok()).rejects.toThrow(/print/);
    await tick();
    await attach(ANA, client, "aprovacao_site");
    await tick();
    await saveSite(ANA, client);
    await expect(ok()).rejects.toThrow(/print/);
    await tick();
    await attach(ANA, client, "aprovacao_site", "segunda-versao");
    await ok();
    await advance(ANA, client);
  });
  it("devolução conta retrabalho para quem avançou", async () => {
    await expect(as(db, "authenticated", ANA, "select move_stage($1,'devolver','site',null)", [client])).rejects.toThrow(/motivo/);
    await as(db, "authenticated", ADMIN, "select move_stage($1,'devolver','site','Texto incorreto')", [client]);
    await advance(ANA, client);
  });
  it("checklist completo conclui e os números batem", async () => {
    for (const s of ["meta", "verificacao"]) {
      await expect(advance(ANA, client)).rejects.toThrow(/Checklist/);
      for (const i of (await db.query<{ key: string }>("select key from checklist_items where client_id=$1 and stage=$2", [client, s])).rows)
        await as(db, "authenticated", ANA, "select toggle_checklist($1,$2,true)", [client, i.key]);
      await advance(ANA, client);
    }
    const rows = await as<Record<string, unknown>>(db, "authenticated", ADMIN, "select * from operator_metrics(current_date-2,current_date+1)");
    const ana = rows.find((r) => r.operator_id === ANA)!;
    expect(ana).toMatchObject({ completed: 1, completed_month: 1, advances: 5, rework: 1, open_now: 2 });
    expect(await as(db, "authenticated", ANA, "select * from operator_metrics(current_date,current_date)")).toHaveLength(1);
    const days = await as<{ advances: number }>(db, "authenticated", ADMIN, "select * from daily_advances(current_date-2,current_date+1)");
    expect(days.reduce((s, d) => s + Number(d.advances), 0)).toBeGreaterThanOrEqual(5);
    expect(await as(db, "authenticated", ADMIN, "select * from stage_durations(current_date-2,current_date+1)")).toHaveLength(4);
  });
  it("não há mais prazos, e o que foi recriado segue fechado para anônimos", async () => {
    const { rows } = await db.query("select 1 from information_schema.columns where table_schema='public' and column_name in ('sla_hours','late','sla_ok','late_now')");
    expect(rows).toHaveLength(0);
    for (const q of ["select * from client_overview", "select * from operator_metrics(current_date,current_date)", "select * from stage_durations(current_date,current_date)"])
      await expect(as(db, "anon", null, q)).rejects.toThrow(/permission denied/);
  });
  it("auditoria e histórico não podem ser apagados nem pelo servidor", async () => {
    await expect(as(db, "service_role", null, "delete from activity_log")).rejects.toThrow(/imutável/);
    await expect(as(db, "service_role", null, "update stage_history set operator_id=null")).rejects.toThrow(/imutável/);
  });
});
