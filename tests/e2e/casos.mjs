// Recusas, exceções e administração.
import { B, check, ctx, enter, fim, login, step, tela } from "./comum.mjs";

const shot = (p, n) => p.screenshot({ path: tela(`${n}.png`), fullPage: true });
const open = async (p, q) => { await p.goto(`${B}/clientes?ver=lista&q=${encodeURIComponent(q)}`); await p.click("tbody a"); await p.waitForURL(/clientes\/[0-9a-f-]{36}/); return p.url(); };
const move = async (p, why, dir, to) => { await p.click("summary:has-text('Devolver ou cancelar')"); await p.fill("[name=reason]", why); await p.selectOption("[name=direction]:not([type=hidden])", dir); if (to) await p.selectOption("select[name=to]", to); await p.click("button:has-text('Registrar')"); await p.waitForSelector("text=Confira o motivo"); await p.click("button:has-text('Registrar')"); };

const l = await ctx(); await l.goto(B + "/login"); await shot(l, "01-login");
const ana = await enter("ana@agencia.com"), adm = await enter("admin@agencia.com"), bru = await enter("bruno@agencia.com");
await shot(ana, "02-operador-painel"); await ana.goto(B + "/clientes"); await shot(ana, "03-operador-clientes");
check("operador não vê menu de admin", (await ana.locator("text=Produtividade").count()) === 0);
for (const u of ["produtividade", "autorizacoes", "equipe", "auditoria", "prazos"]) { await ana.goto(`${B}/admin/${u}`); check(`operador barrado em ${u}`, ana.url().endsWith("/painel")); }

await step("cadastro", async () => {
  await ana.goto(B + "/clientes/novo"); await ana.fill("[name=cnpj]", "11.111.111/1111-11"); await ana.fill("[name=contact_name]", "Titular Teste"); await ana.fill("[name=contact_email]", "titular@exemplo.com.br");
  await ana.click("button:has-text('Cadastrar cliente')"); await ana.waitForSelector("text=CNPJ inválido"); check("CNPJ inválido recusado", true);
  await ana.fill("[name=cnpj]", "00.000.000/0001-91"); await ana.click("button:has-text('Cadastrar cliente')"); await ana.waitForSelector("text=Confirme que existe contrato"); check("exige contrato", true);
  await shot(ana, "04-operador-cadastro");
  await ana.check("[name=contrato]"); await ana.fill("[name=contact_email]", "bruno@agencia.com"); await ana.click("button:has-text('Cadastrar cliente')"); await ana.waitForSelector("text=pertence a alguém da equipe"); check("e-mail da equipe recusado como titular", true);
  await ana.fill("[name=contact_email]", "titular@exemplo.com.br"); await ana.click("button:has-text('Cadastrar cliente')"); await ana.waitForURL(/clientes\/[0-9a-f-]{36}/); check("cadastro com CNPJ real (BrasilAPI)", (await ana.locator("body").innerText()).includes("BANCO DO BRASIL"));
  await ana.goto(B + "/clientes/novo"); await ana.fill("[name=cnpj]", "00.000.000/0001-91"); await ana.fill("[name=contact_name]", "Outro Teste"); await ana.fill("[name=contact_email]", "x@exemplo.com.br"); await ana.check("[name=contrato]"); await ana.click("button:has-text('Cadastrar cliente')"); await ana.waitForSelector("text=já está cadastrado"); check("CNPJ duplicado recusado", true);
});

await step("devolução", async () => { await open(ana, "Barbearia"); await move(ana, "Texto precisa de correção", "devolver", "site"); await ana.waitForSelector("text=Próximo passo em Site"); check("devolução com motivo", (await ana.locator("body").innerText()).includes("Texto precisa de correção"));
  await adm.goto(B + "/admin/produtividade"); const row = await adm.locator("tr:has-text('Ana Lima')").innerText(); check("devolução contada para a operadora", /\t1\t/.test(row), row); });
await step("cancelar e reabrir", async () => { const u = await open(ana, "Doceria"); await move(ana, "Cliente desistiu do serviço", "cancelar"); await ana.waitForSelector("h2:has-text('Cancelado')"); check("cancelamento", true); check("operador não reabre", (await ana.locator("button:has-text('Reabrir')").count()) === 0);
  await adm.goto(u); await adm.click("button:has-text('Reabrir')"); await adm.waitForSelector("text=Próximo passo em Autorização"); check("admin reabre", true); });
await step("responsável", async () => { const u = await open(adm, "Gráfica"); await adm.selectOption("[name=operator]", { label: "Bruno Reis" }); await adm.click("button:has-text('Trocar')"); await adm.waitForSelector("text=Responsável atualizado"); await bru.goto(u); check("novo responsável vê", await bru.locator("h1:has-text('Gráfica')").isVisible()); check("antigo responsável perde acesso", (await ana.request.get(u)).status() === 404); });
await step("anotação", async () => { await open(ana, "Transportes"); await ana.fill("[name=body]", "Cliente prefere contato à tarde."); await ana.click("button:has-text('Salvar anotação')"); await ana.waitForSelector("text=Anotação salva"); check("anotação", await ana.locator("li:has-text('contato à tarde')").first().isVisible()); await ana.click("summary:has-text('Editar dados')"); await ana.selectOption("[name=priority]", "3"); await ana.click("button:has-text('Salvar dados')"); await ana.waitForSelector("text=Dados salvos"); check("edição de prioridade", true); await shot(ana, "05-operador-cliente"); });

const sign = async (link, name, role, domain) => { const c = await ctx({ width: 390, height: 844 }); await c.goto(link); await shot(c, "06-titular-codigo"); await c.click("button:has-text('Enviar código')"); await c.waitForSelector("text=Código enviado"); await c.fill("[name=code]", "123456"); await c.click("button:has-text('Entrar')"); await c.waitForSelector("text=Assinar autorização"); await c.fill("[name=name]", name); await c.selectOption("[name=role]", role); await c.fill("[name=domain]", domain); await c.fill("[name=phone]", "(11) 3333-4444"); await shot(c, "07-titular-assinatura"); await c.click("button:has-text('Assinar')"); await c.waitForSelector("text=Marque que leu"); await c.check("[name=aceite]"); await c.click("button:has-text('Assinar')"); await c.waitForSelector("text=Assinada por"); await shot(c, "08-titular-assinado"); return c; };
const linkFor = async (p) => { await p.click("button:has-text('Gerar link de assinatura')"); return p.locator("[aria-label='Link gerado']").inputValue(); };
await step("assinatura e recusa", async () => {
  const dv = await enter("davi@agencia.com"); const u = await open(dv, "Imobiliária"); const old = await linkFor(dv); await dv.reload(); const link = await linkFor(dv);
  const o = await ctx(); await o.goto(old); check("link antigo deixa de valer", await o.locator("text=não vale mais").isVisible());
  await sign(link, "Maria Souza", "procurador", "imobiliarialar.com.br"); check("termos são obrigatórios", true);
  await adm.goto(B + "/admin/autorizacoes"); await adm.waitForSelector("text=não aparece no quadro"); check("alerta de signatário fora do quadro", true); await shot(adm, "10-admin-autorizacoes");
  await adm.click("button:text-is('Aprovar')"); await adm.waitForSelector("text=é preciso uma procuração"); check("sem procuração não aprova", true);
  await adm.click("button:text-is('Recusar')"); await adm.waitForSelector("text=Informe o motivo"); await adm.fill("[name=note]", "Enviar procuração assinada"); await adm.click("button:text-is('Recusar')"); await adm.waitForSelector("text=Nenhuma autorização"); await dv.goto(u); check("recusa visível ao operador", await dv.locator("text=Enviar procuração assinada").first().isVisible());
  const lk = await linkFor(dv); const c = await sign(lk, "José Silva", "socio", "imobiliarialar.com.br"); await adm.goto(B + "/admin/autorizacoes"); await adm.click("button:text-is('Aprovar')"); await adm.waitForSelector("text=Nenhuma autorização"); check("nova assinatura aprovada", true);
  await dv.goto(u); await dv.click("button:has-text('Avançar para Documentos')"); await dv.waitForSelector("text=Próximo passo em Documentos");
  await c.reload(); await c.click("summary:has-text('Revogar')"); await c.click("button:has-text('Revogar')"); await c.waitForSelector("text=Clique de novo"); await c.click("button:has-text('Revogar')"); await c.waitForSelector("text=Revogado"); await dv.goto(u); check("revogação encerra o processo", await dv.locator("h2:has-text('Cancelado')").isVisible());
});
await step("equipe", async () => {
  await adm.goto(B + "/admin/equipe"); await shot(adm, "11-admin-equipe"); const row = adm.locator("li:has-text('bruno@agencia.com')");
  await row.locator("button:has-text('Gerar nova senha')").click(); const lk = await row.locator("[aria-label='Link gerado']").inputValue(); const n = await ctx(); await n.goto(lk); await n.click("button:has-text('Continuar')"); await n.waitForURL("**/definir-senha"); await n.fill("[name=senha]", "nova-senha-999"); await n.fill("[name=confirma]", "nova-senha-998"); await n.click("button:has-text('Salvar')"); await n.waitForSelector("text=não são iguais"); await n.fill("[name=confirma]", "nova-senha-999"); await n.click("button:has-text('Salvar')"); await n.waitForURL("**/painel"); check("redefinição de senha", true);
  await enter("bruno@agencia.com", "nova-senha-999"); check("login com a nova senha", true); const again = await ctx(); await again.goto(lk); await again.click("button:has-text('Continuar')"); await again.waitForSelector("text=inválido ou expirado"); check("link de senha é de uso único", true);
  await adm.goto(B + "/admin/equipe"); const d = adm.locator("li:has-text('davi@agencia.com')");
  await d.locator("[name=active]").uncheck(); await d.locator("[name=goal]").fill("15"); await d.locator("button:text-is('Salvar')").click();
  await adm.waitForSelector("text=Transfira antes"); check("desativar com clientes em aberto é recusado", true);
  await d.locator("summary").click(); await d.locator("[name=to]").selectOption({ label: "Ana Lima" }); await d.locator("button:has-text('Transferir clientes')").click();
  await d.locator("text=0 clientes em aberto").waitFor(); check("transferência em lote", true);
  await d.locator("[name=active]").uncheck(); await d.locator("button:text-is('Salvar')").click(); await adm.waitForSelector("text=Membro atualizado");
  const x = await ctx(); await login(x, "davi@agencia.com"); await x.waitForSelector("text=não tem acesso"); check("membro desativado não entra", true);
  const me = adm.locator("li:has-text('admin@agencia.com')"); await me.locator("[name=active]").uncheck(); await me.locator("button:text-is('Salvar')").click(); await adm.waitForSelector("text=não pode remover o próprio"); check("admin não se bloqueia", true);
});
await step("prazos", async () => { await adm.goto(B + "/admin/prazos"); await shot(adm, "13-admin-prazos"); const r = adm.locator("li:has-text('Meta')").last(); await adm.locator("li:has(input[value=meta]) [name=sla]").fill("200"); await adm.locator("li:has(input[value=meta]) button").click(); await adm.waitForSelector("text=Prazo salvo"); await adm.goto(B + "/clientes?ver=quadro"); check("prazo novo recalcula atrasos", (await adm.locator("section:has(h2:has-text('Meta')) >> text=Atrasado").count()) === 0); await shot(adm, "12-admin-quadro"); });
await step("relatórios", async () => { await adm.goto(B + "/admin/produtividade"); await shot(adm, "09-admin-produtividade"); await adm.selectOption("[name=op]", { label: "Ana Lima" }); await adm.click("button:has-text('Aplicar')"); await adm.waitForURL(/op=/); await adm.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1); check("filtro por operador", true);
  await adm.goto(B + "/admin/produtividade?de=2020-01-01&ate=2020-01-10"); check("período vazio não quebra", await adm.locator("h1:has-text('Produtividade')").isVisible()); await adm.goto(B + "/admin/produtividade?de=lixo&ate=2026-99-99&op=x"); check("filtro inválido não quebra", await adm.locator("text=Por operador").isVisible());
  await adm.goto(B + "/admin/produtividade"); await adm.locator("figure button").nth(20).hover(); check("dica no gráfico", await adm.locator("text=clientes concluídos").last().isVisible()); const csv = await (await adm.request.get(B + "/api/produtividade")).text(); check("CSV", csv.includes("Etapas avançadas") && csv.includes("Ana Lima"));
  await adm.goto(B + "/admin/auditoria"); await shot(adm, "14-admin-auditoria"); check("auditoria", (await adm.locator("tbody tr").count()) > 20);
  const audit = await adm.locator("tbody").innerText(); for (const t of ["motivo: Enviar procuração assinada", "novo responsável: Ana Lima", "Meta em 200 h", "de Davi Costa para Ana Lima"]) check(`auditoria detalha "${t}"`, audit.includes(t)); await adm.click("text=Mais antigos"); await adm.waitForURL(/p=2/); check("paginação", (await adm.locator("tbody tr").count()) > 0); });
await step("sair", async () => { await ana.goto(B + "/painel"); await ana.click("[aria-label=Sair]"); await ana.waitForURL("**/login"); await ana.goto(B + "/painel"); check("sair encerra a sessão", ana.url().includes("/login")); });
await fim();
