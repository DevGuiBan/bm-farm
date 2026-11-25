// Recusas, exceções e administração.
import { B, check, ctx, enter, fim, login, step, tela } from "./comum.mjs";

const shot = (p, n) => p.screenshot({ path: tela(`${n}.png`), fullPage: true });
const open = async (p, q) => { await p.goto(`${B}/clientes?ver=lista&q=${encodeURIComponent(q)}`); await p.click("tbody a"); await p.waitForURL(/clientes\/[0-9a-f-]{36}/); return p.url(); };
const move = async (p, why, dir, to) => { await p.click("summary:has-text('Devolver ou cancelar')"); await p.fill("[name=reason]", why); await p.selectOption("[name=direction]:not([type=hidden])", dir); if (to) await p.selectOption("select[name=to]", to); await p.click("button:has-text('Registrar')"); await p.waitForSelector("text=Confira o motivo"); await p.click("button:has-text('Registrar')"); };

const l = await ctx(); await l.goto(B + "/login"); await shot(l, "01-login");
const ana = await enter("ana@agencia.com"), adm = await enter("admin@agencia.com"), bru = await enter("bruno@agencia.com");
await shot(ana, "02-operador-painel"); await ana.goto(B + "/clientes"); await shot(ana, "03-operador-clientes");
check("operador não vê menu de admin", (await ana.locator("text=Produtividade").count()) === 0);
for (const u of ["produtividade", "equipe", "auditoria"]) { await ana.goto(`${B}/admin/${u}`); check(`operador barrado em ${u}`, ana.url().endsWith("/painel")); }

await step("cadastro", async () => {
  await ana.goto(B + "/clientes/novo"); await ana.fill("[name=cnpj]", "11.111.111/1111-11"); await ana.fill("[name=contact_name]", "Titular Teste"); await ana.selectOption("[name=portfolio]", "novo");
  await ana.click("button:has-text('Cadastrar BM')"); await ana.waitForSelector("text=CNPJ inválido"); check("CNPJ inválido recusado", true);
  await ana.fill("[name=cnpj]", "00.000.000/0001-91"); await ana.click("button:has-text('Cadastrar BM')"); await ana.waitForSelector("text=Confirme que existe contrato"); check("exige contrato", true);
  await shot(ana, "04-operador-cadastro");
  await ana.check("[name=contrato]"); await ana.click("button:has-text('Cadastrar BM')"); await ana.waitForURL(/clientes\/[0-9a-f-]{36}/); check("cadastro com CNPJ real (BrasilAPI)", (await ana.locator("body").innerText()).includes("BANCO DO BRASIL"));
  check("sem campo de e-mail do titular", (await ana.locator("[name=contact_email]").count()) === 0);
  const novo = async (p) => { await p.goto(B + "/clientes/novo"); await p.fill("[name=cnpj]", "00.000.000/0001-91"); await p.fill("[name=contact_name]", "Outro Teste"); await p.selectOption("[name=portfolio]", "existente"); await p.check("[name=contrato]"); await p.click("button:has-text('Cadastrar BM')"); };
  await novo(bru); await bru.waitForSelector("text=já está em uso em 1 BM (Ana Lima)"); check("CNPJ repetido é informado", true); await shot(bru, "06-cnpj-repetido");
  await bru.click("button:has-text('Cadastrar BM')"); await bru.waitForFunction(() => !document.querySelector("fieldset[disabled]")); check("sem confirmar não cadastra", bru.url().endsWith("/clientes/novo"));
  await bru.check("[name=confirmar]"); await bru.fill("[name=cnpj]", "33.000.167/0001-01"); await bru.fill("[name=cnpj]", "00.000.000/0001-91"); await bru.click("button:has-text('Cadastrar BM')"); await bru.waitForURL(/clientes\/[0-9a-f-]{36}/); check("com confirmação o CNPJ é reutilizado", true);
  check("BM mostra o CNPJ em uso", await bru.locator("text=CNPJ também em uso em 1 outra BM").isVisible()); check("reuso fica no histórico", await bru.locator("text=confirmou o uso de um CNPJ repetido").first().isVisible());
  await bru.click("summary:has-text('Editar dados')"); await bru.selectOption("[name=portfolio]", "novo"); await bru.click("button:has-text('Salvar dados')"); await bru.waitForSelector("text=Só um administrador pode mudar o portfólio"); check("operador não muda existente para novo", true);
});

await step("devolução", async () => { await open(ana, "Barbearia"); await move(ana, "Texto precisa de correção", "devolver", "site"); await ana.waitForSelector("text=Próximo passo em Site"); check("devolução com motivo", (await ana.locator("body").innerText()).includes("Texto precisa de correção"));
  await adm.goto(B + "/admin/produtividade"); const row = await adm.locator("tr:has-text('Ana Lima')").innerText(); check("devolução contada para a operadora", /\t1\t/.test(row), row); });
await step("cancelar e reabrir", async () => { const u = await open(ana, "Doceria"); await move(ana, "Cliente desistiu do serviço", "cancelar"); await ana.waitForSelector("h2:has-text('Cancelada')"); check("cancelamento", true); check("operador não reabre", (await ana.locator("button:has-text('Reabrir')").count()) === 0);
  await adm.goto(u); await adm.click("button:has-text('Reabrir')"); await adm.waitForSelector("text=Próximo passo em Documentos"); check("admin reabre", true); });
await step("responsável", async () => { const u = await open(adm, "Gráfica"); await adm.selectOption("[name=operator]", { label: "Bruno Reis" }); await adm.click("button:has-text('Trocar')"); await adm.waitForSelector("text=Responsável atualizado"); await bru.goto(u); check("novo responsável vê", await bru.locator("h1:has-text('Gráfica')").isVisible()); check("antigo responsável perde acesso", (await ana.request.get(u)).status() === 404); });
await step("anotação", async () => { await open(ana, "Transportes"); await ana.fill("[name=body]", "Cliente prefere contato à tarde."); await ana.click("button:has-text('Salvar anotação')"); await ana.waitForSelector("text=Anotação salva"); check("anotação", await ana.locator("li:has-text('contato à tarde')").first().isVisible()); await ana.click("summary:has-text('Editar dados')"); await ana.selectOption("[name=priority]", "3"); await ana.click("button:has-text('Salvar dados')"); await ana.waitForSelector("text=Dados salvos"); check("edição de prioridade", true); await shot(ana, "05-operador-cliente"); });

await step("sem assinatura", async () => {
  const x = await ctx(); for (const u of ["/portal/abc", "/admin/autorizacoes"]) check(`${u} não existe`, (await adm.request.get(B + u)).status() === 404);
  await x.goto(B + "/portal/abc"); check("portal exige login", x.url().includes("/login"));
  await adm.goto(B + "/clientes?ver=quadro"); check("quadro sem Autorização", !/autoriza/i.test(await adm.locator("body").innerText()));
});
await step("portfólio existente", async () => { await adm.goto(B + "/clientes?ver=lista&q=serrano"); check("concluída existente fora da meta", await adm.locator("text=Já existia, fora da meta").isVisible()); await open(adm, "serrano"); await shot(adm, "10-portfolio-existente"); });
await step("equipe", async () => {
  await adm.goto(B + "/admin/equipe"); await shot(adm, "11-admin-equipe"); const row = adm.locator("li:has-text('bruno@agencia.com')");
  await row.locator("button:has-text('Gerar nova senha')").click(); const lk = await row.locator("[aria-label='Link gerado']").inputValue(); const n = await ctx(); await n.goto(lk); await n.click("button:has-text('Continuar')"); await n.waitForURL("**/definir-senha"); await n.fill("[name=senha]", "nova-senha-999"); await n.fill("[name=confirma]", "nova-senha-998"); await n.click("button:has-text('Salvar')"); await n.waitForSelector("text=não são iguais"); await n.fill("[name=confirma]", "nova-senha-999"); await n.click("button:has-text('Salvar')"); await n.waitForURL("**/painel"); check("redefinição de senha", true);
  await enter("bruno@agencia.com", "nova-senha-999"); check("login com a nova senha", true); const again = await ctx(); await again.goto(lk); await again.click("button:has-text('Continuar')"); await again.waitForSelector("text=inválido ou expirado"); check("link de senha é de uso único", true);
  await adm.goto(B + "/admin/equipe"); const d = adm.locator("li:has-text('davi@agencia.com')");
  await d.locator("[name=active]").uncheck(); await d.locator("[name=goal]").fill("15"); await d.locator("button:text-is('Salvar')").click();
  await adm.waitForSelector("text=Transfira antes"); check("desativar com BMs em aberto é recusado", true);
  await d.locator("summary").click(); await d.locator("[name=to]").selectOption({ label: "Ana Lima" }); await d.locator("button:has-text('Transferir BMs')").click();
  await d.locator("text=0 BMs em aberto").waitFor(); check("transferência em lote", true);
  await d.locator("[name=active]").uncheck(); await d.locator("button:text-is('Salvar')").click(); await adm.waitForSelector("text=Membro atualizado");
  const x = await ctx(); await login(x, "davi@agencia.com"); await x.waitForSelector("text=não tem acesso"); check("membro desativado não entra", true);
  const me = adm.locator("li:has-text('admin@agencia.com')"); await me.locator("[name=active]").uncheck(); await me.locator("button:text-is('Salvar')").click(); await adm.waitForSelector("text=não pode remover o próprio"); check("admin não se bloqueia", true);
});
await step("admin não é operador", async () => {
  await adm.goto(B + "/painel"); check("admin abre em Produtividade", adm.url().endsWith("/admin/produtividade"));
  check("admin sem Meu painel no menu", (await adm.locator("nav >> text=Meu painel").count()) === 0);
  const tabela = await adm.locator("table tbody").innerText(), filtro = await adm.locator("[name=op]").innerText();
  check("admin fora da produtividade", !tabela.includes("Carla Nunes") && !filtro.includes("Carla Nunes") && tabela.includes("Ana Lima"));
  check("admin fora do CSV", !(await (await adm.request.get(B + "/api/produtividade")).text()).includes("Carla Nunes"));
  await adm.goto(B + "/clientes/novo"); check("admin não é opção de responsável", !(await adm.locator("[name=assigned_to]").innerText()).includes("Carla Nunes"));
  await adm.goto(B + "/clientes"); check("admin fora do filtro de BMs", !(await adm.locator("[name=op]").innerText()).includes("Carla Nunes"));
  await adm.goto(B + "/admin/equipe"); check("admin sem meta em Equipe", (await adm.locator("li:has-text('admin@agencia.com') >> text=Meta mensal").count()) === 0);
  const eu = adm.locator("li:has-text('ana@agencia.com')"); await eu.locator("[name=role]").selectOption("admin"); await eu.locator("button:text-is('Salvar')").click();
  await adm.waitForSelector("text=Transfira antes as BMs"); check("promover com BMs em aberto é recusado", true);
});
await step("sem prazos", async () => {
  check("página de prazos não existe", (await adm.request.get(B + "/admin/prazos")).status() === 404);
  for (const [u, n] of [["/painel", ""], ["/clientes?ver=quadro", "12-admin-quadro"], ["/clientes?ver=lista", "13-admin-lista"], ["/admin/produtividade", ""]]) {
    const p = u === "/painel" ? ana : adm;
    await p.goto(B + u); if (n) await shot(p, n);
    check(`sem prazo ou atraso em ${u}`, !/prazo|atras/i.test(await p.locator("body").innerText()));
  }
  for (const u of ["/painel", "/clientes", "/clientes/novo", "/admin/equipe", "/admin/produtividade"]) {
    const p = u === "/painel" ? ana : adm; await p.goto(B + u); const menu = await p.locator("nav, h1, th, main button, main a.btn").allInnerTexts();
    check(`fala em BM em ${u}`, !/cliente/i.test(menu.join(" ")));
  }
  check("meta do mês visível", await adm.locator("text=Meta do mês").first().isVisible());
});
await step("relatórios", async () => { await adm.goto(B + "/admin/produtividade"); await shot(adm, "09-admin-produtividade"); await adm.selectOption("[name=op]", { label: "Ana Lima" }); await adm.click("button:has-text('Aplicar')"); await adm.waitForURL(/op=/); await adm.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1); check("filtro por operador", true);
  await adm.goto(B + "/admin/produtividade?de=2020-01-01&ate=2020-01-10"); check("período vazio não quebra", await adm.locator("h1:has-text('Produtividade')").isVisible()); await adm.goto(B + "/admin/produtividade?de=lixo&ate=2026-99-99&op=x"); check("filtro inválido não quebra", await adm.locator("text=Por operador").isVisible());
  await adm.goto(B + "/admin/produtividade"); await adm.locator("figure button").nth(20).hover(); check("dica no gráfico", await adm.locator("text=BMs criadas").last().isVisible()); const csv = await (await adm.request.get(B + "/api/produtividade")).text(); check("CSV", csv.includes("Etapas avançadas") && csv.includes("Ana Lima"));
  await adm.goto(B + "/admin/auditoria"); await shot(adm, "14-admin-auditoria"); check("auditoria", (await adm.locator("tbody tr").count()) > 20);
  const audit = await adm.locator("tbody").innerText(); for (const t of ["novo responsável: Ana Lima", "de Davi Costa para Ana Lima"]) check(`auditoria detalha "${t}"`, audit.includes(t)); await adm.click("text=Mais antigos"); await adm.waitForURL(/p=2/); check("paginação", (await adm.locator("tbody tr").count()) > 0); });
await step("sair", async () => { await ana.goto(B + "/painel"); await ana.click("[aria-label=Sair]"); await ana.waitForURL("**/login"); await ana.goto(B + "/painel"); check("sair encerra a sessão", ana.url().includes("/login")); });
await fim();
