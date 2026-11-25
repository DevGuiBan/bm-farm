import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createDb } from "./db";

const ADMIN = "00000000-0000-0000-0000-00000000000a";
const ANA = "00000000-0000-0000-0000-00000000000b";
const BIA = "00000000-0000-0000-0000-00000000000c";
const OUTSIDER = "00000000-0000-0000-0000-00000000000d";

let db: PGlite;
let client: string;

const create = (actor: string, cnpj: string, email: string, partners = ["JOSÉ DA SILVA"]) =>
  as<{ id: string }>(db, "service_role", null,
    "select create_client($1,$2,'EMPRESA TESTE LTDA',null,'{}',$3,'José',$4,null,null) id",
    [actor, cnpj, partners, email]).then((r) => r[0].id);
const sign = (id: string, name = "Jose da Silva", domain = "empresateste.com.br") =>
  as(db, "service_role", null, "select portal_sign($1,$2,'socio',$3,'1133334444','v1','abc','1.1.1.1','ua')", [id, name, domain]);
const authId = async (id: string) =>
  (await db.query<{ id: string }>("select id from authorizations where client_id=$1 order by signed_at desc limit 1", [id])).rows[0].id;
const attach = (uid: string, id: string, kind: string, path = `${id}/${kind}`) =>
  as(db, "service_role", null, "select add_document($1,$2,$3::doc_kind,$4,'a.pdf','application/pdf',1,'h')", [uid, id, kind, path]);
const advance = (uid: string, id: string) => as(db, "authenticated", uid, "select move_stage($1,'avancar')", [id]);
const approveAuth = async (uid: string, id: string) =>
  as(db, "authenticated", uid, "select review_authorization($1,true,null)", [await authId(id)]);

beforeAll(async () => {
  db = await createDb();
  for (const [id, name, email, role] of [
    [ADMIN, "Admin", "admin@agencia.com", "admin"], [ANA, "Ana Lima", "ana@agencia.com", "operador"],
    [BIA, "Bia Reis", "bia@agencia.com", "operador"]]) {
    await db.query("insert into auth.users values ($1,$2)", [id, email]);
    await db.query("insert into profiles (id,full_name,email,role) values ($1,$2,$3,$4)", [id, name, email, role]);
  }
  await db.query("insert into auth.users values ($1,'cliente@x.com')", [OUTSIDER]);
  client = await create(ANA, "11222333000181", "jose@empresateste.com.br");
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
  it("equipe não chama funções do portal nem lê convites", async () => {
    await expect(as(db, "authenticated", ANA, "select portal_revoke($1)", [client])).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", ANA, "select add_document($1,$2,'outro','x','x','x',1,'x')", [ANA, client])).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", ADMIN, "select portal_sign($1,'A B','socio','a.com','1','v','h','i','u')", [client])).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", ADMIN, "select 1 from portal_invites")).rejects.toThrow(/permission denied/);
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
    const id = await create(BIA, "11222333000696", "w@empresa5.com.br");
    await expect(off()).rejects.toThrow(/Transfira antes/);
    await expect(transfer(ANA, BIA, ANA)).rejects.toThrow(/administradores/);
    await expect(transfer(ADMIN, BIA, BIA)).rejects.toThrow(/outra pessoa/);
    await transfer(ADMIN, BIA, ADMIN);
    expect((await db.query<{ assigned_to: string }>("select assigned_to from clients where id=$1", [id])).rows[0].assigned_to).toBe(ADMIN);
    await off();
    await expect(transfer(ADMIN, ADMIN, BIA)).rejects.toThrow(/outra pessoa/);
    await as(db, "authenticated", ADMIN, "select update_member($1,'operador',true,0)", [BIA]);
    expect(await as(db, "authenticated", ANA, "select * from open_clients_by_member()")).toHaveLength(0);
  });
});

describe("autorização do titular", () => {
  it("equipe não pode ser titular", async () => {
    await expect(create(ANA, "11222333000262", "bia@agencia.com")).rejects.toThrow(/equipe/);
  });
  it("não avança sem autorização aprovada", async () => {
    await expect(advance(ANA, client)).rejects.toThrow(/Autorização/);
  });
  it("recusa domínio de hospedagem gratuita", async () => {
    await expect(sign(client, "Jose da Silva", "empresa.pages.dev")).rejects.toThrow(/domain_is_own/);
  });
  it("assina, confere o sócio e exige admin que não seja o responsável", async () => {
    await sign(client);
    const [a] = (await db.query<{ signer_in_registry: boolean }>("select * from authorizations")).rows;
    expect(a.signer_in_registry).toBe(true);
    await expect(advance(ANA, client)).rejects.toThrow(/Autorização/);
    await expect(approveAuth(ANA, client)).rejects.toThrow(/administradores/);
    await as(db, "authenticated", ADMIN, "select assign_client($1,$2)", [client, ADMIN]);
    await expect(approveAuth(ADMIN, client)).rejects.toThrow(/própria/);
    await as(db, "authenticated", ADMIN, "select assign_client($1,$2)", [client, ANA]);
    await approveAuth(ADMIN, client);
    await advance(ANA, client);
  });
  it("signatário fora do quadro precisa de procuração aprovada por admin", async () => {
    const id = await create(BIA, "11222333000343", "outro@empresa2.com.br");
    await sign(id, "Maria Souza", "empresa2.com.br");
    await expect(approveAuth(ADMIN, id)).rejects.toThrow(/procuração/);
    await attach(BIA, id, "procuracao");
    const d = (await db.query<{ id: string }>("select id from documents where client_id=$1", [id])).rows[0].id;
    await expect(as(db, "authenticated", BIA, "select review_document($1,true,null)", [d])).rejects.toThrow(/administradores/);
    await as(db, "authenticated", ADMIN, "select review_document($1,true,null)", [d]);
    await approveAuth(ADMIN, id);
  });
  it("revogação encerra o processo", async () => {
    const id = await create(BIA, "11222333000424", "z@empresa3.com.br");
    await sign(id, "José da Silva", "empresa3.com.br");
    await approveAuth(ADMIN, id);
    await advance(BIA, id);
    await as(db, "service_role", null, "select portal_revoke($1)", [id]);
    expect((await db.query<{ stage: string }>("select stage from clients where id=$1", [id])).rows[0].stage).toBe("cancelado");
  });
  it("a fila sinaliza IP repetido", async () => {
    const id = await create(BIA, "11222333000505", "y@empresa4.com.br");
    await sign(id, "José da Silva", "empresa4.com.br");
    const q = await as<{ same_ip: number }>(db, "authenticated", ADMIN, "select * from authorization_queue()");
    expect(Number(q[0].same_ip)).toBeGreaterThan(0);
    expect(await as(db, "authenticated", ANA, "select * from authorization_queue()")).toHaveLength(0);
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
    for (const d of (await db.query<{ id: string }>("select id from documents where client_id=$1", [client])).rows)
    {
      await expect(as(db, "authenticated", ANA, "select review_document($1,true,null)", [d.id])).rejects.toThrow(/Quem anexou/);
      await as(db, "authenticated", ADMIN, "select review_document($1,true,null)", [d.id]);
    }
    await advance(ANA, client);
  });
  it("aprovação do site exige print desta versão", async () => {
    await as(db, "authenticated", ANA, "select save_site($1,'{}',true)", [client]);
    await expect(advance(ANA, client)).rejects.toThrow(/site/);
    const tick = () => new Promise((r) => setTimeout(r, 20));
    const ok = () => as(db, "authenticated", ANA, "select record_site_reply($1,true,null)", [client]);
    await expect(ok()).rejects.toThrow(/print/);
    await tick();
    await attach(ANA, client, "aprovacao_site");
    await tick();
    await as(db, "authenticated", ANA, "select save_site($1,'{}',true)", [client]);
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
    expect(ana).toMatchObject({ completed: 1, completed_month: 1, advances: 6, rework: 1, sla_ok: 5, sla_total: 5 });
    expect(await as(db, "authenticated", ANA, "select * from operator_metrics(current_date,current_date)")).toHaveLength(1);
    const days = await as<{ advances: number }>(db, "authenticated", ADMIN, "select * from daily_advances(current_date-2,current_date+1)");
    expect(days.reduce((s, d) => s + Number(d.advances), 0)).toBeGreaterThanOrEqual(7);
    expect(await as(db, "authenticated", ADMIN, "select * from stage_durations(current_date-2,current_date+1)")).toHaveLength(5);
  });
  it("auditoria e histórico não podem ser apagados nem pelo servidor", async () => {
    await expect(as(db, "service_role", null, "delete from activity_log")).rejects.toThrow(/imutável/);
    await expect(as(db, "service_role", null, "update stage_history set operator_id=null")).rejects.toThrow(/imutável/);
  });
});
