// Um cliente do cadastro à conclusão, passando por todos os perfis.
import { B, check, ctx, fim, login, PDF, PDF_FALSO, step, tela } from "./comum.mjs";

await step("fluxo completo", async () => {
const anon = await ctx(); await anon.goto(B + "/clientes"); check("anônimo vai ao login", anon.url().includes("/login"));
await login(anon, "ana@agencia.com", "errada"); await anon.waitForSelector("text=incorretos"); check("senha errada recusada", (await anon.inputValue("[name=email]")) === "ana@agencia.com");
await anon.screenshot({ path: tela("fluxo-1-login.png") });

const ana = await ctx(); await login(ana, "ana@agencia.com"); await ana.waitForURL("**/painel"); await ana.waitForSelector("text=Sua fila"); await ana.screenshot({ path: tela("fluxo-2-painel.png"), fullPage: true });
await ana.goto(B + "/admin/produtividade"); check("operador barrado no admin", ana.url().endsWith("/painel"));
check("operador barrado no CSV", (await ana.request.get(B + "/api/produtividade")).status() === 403);
const adm = await ctx(); await login(adm, "admin@agencia.com"); await adm.waitForURL("**/painel");
await adm.goto(B + "/admin/produtividade"); await adm.waitForSelector("text=Por operador"); await adm.screenshot({ path: tela("fluxo-3-prod.png"), fullPage: true });
check("CSV do admin", (await (await adm.request.get(B + "/api/produtividade")).text()).includes("Ana Lima"));
await adm.goto(B + "/clientes?ver=quadro"); await adm.screenshot({ path: tela("fluxo-4-quadro.png") });
await adm.goto(B + "/clientes?ver=lista&q=padaria"); check("busca", (await adm.locator("tbody tr").count()) === 1); await adm.screenshot({ path: tela("fluxo-5-lista.png") });

// cliente em autorização, com a Ana (i=20 -> ops[0], target 0)
await ana.goto(B + "/clientes?ver=lista&q=lavanderia"); await ana.click("tbody a"); await ana.waitForURL(/clientes\/[0-9a-f-]{36}/); const cu = ana.url();
check("avançar bloqueado sem autorização", await ana.locator("button:has-text('Avançar')").isDisabled());
await ana.click("button:has-text('Gerar link de assinatura')"); const link = await ana.locator("[aria-label='Link gerado']").inputValue();
const cli = await ctx({ width: 390, height: 844 }); await cli.goto(link); await cli.click("button:has-text('Enviar código')"); await cli.waitForSelector("text=Código enviado");
await cli.fill("[name=code]", "000000"); await cli.click("button:has-text('Entrar')"); await cli.waitForSelector("text=Código incorreto"); check("código errado recusado", true);
await cli.fill("[name=code]", "123456"); await cli.click("button:has-text('Entrar')"); await cli.waitForSelector("text=Assinar autorização");
await cli.fill("[name=name]", "José Silva"); await cli.fill("[name=domain]", "minhaempresa.pages.dev"); await cli.fill("[name=phone]", "(11) 3333-4444"); await cli.check("[name=aceite]");
await cli.click("button:has-text('Assinar')"); await cli.waitForSelector("text=domínio próprio da empresa, como"); check("domínio gratuito recusado e nome mantido", (await cli.inputValue("[name=name]")) === "José Silva");
await cli.screenshot({ path: tela("fluxo-6-portal.png"), fullPage: true });
await cli.fill("[name=domain]", "https://www.lavanderialimpa.com.br/"); await cli.click("button:has-text('Assinar')"); await cli.waitForSelector("text=Assinada por");
check("outro navegador não entra no portal sem código", await (async () => { const x = await ctx(); await x.goto(link); return x.locator("text=Confirme seu e-mail").isVisible(); })());
check("portal sem documentos", (await cli.locator("[type=file]").count()) === 0);

await adm.goto(B + "/admin/autorizacoes"); await adm.screenshot({ path: tela("fluxo-7-aut.png") }); await adm.click("button:has-text('Aprovar')"); await adm.waitForSelector("text=Nenhuma autorização aguardando"); check("admin aprovou", true);
await ana.goto(cu); await ana.click("button:has-text('Avançar para Documentos')"); await ana.waitForSelector("text=Documento pendente: contrato social");
const up = async (k, f) => { await ana.selectOption("select[name=kind]", k); await ana.setInputFiles("[name=file]", f); await ana.click("button:has-text('Anexar documento')"); };
const links = () => ana.locator("a[href^='/api/documentos']").count();
const attach = async (k) => { const n = await links(); await up(k, PDF); await ana.waitForFunction((x) => document.querySelectorAll("a[href^='/api/documentos']").length === x, n + 1); await ana.waitForFunction(() => !document.querySelector("fieldset[disabled]")); };
await up("contrato_social", PDF_FALSO); await ana.waitForSelector("text=não corresponde"); check("PDF falso recusado", true);
for (const k of ["contrato_social", "comprovante_endereco", "documento_signatario"]) await attach(k);
check("quem anexou não aprova", (await ana.locator("button:text-is('Aprovar')").count()) === 0);
await adm.goto(cu); for (let i = 3; i > 0; i--) { await adm.locator("button:text-is('Aprovar')").first().click(); await adm.waitForFunction((n) => [...document.querySelectorAll("button")].filter((b) => b.textContent === "Aprovar").length === n, i - 1); }
await ana.goto(cu);
check("documento abre", (await ana.request.get(B + (await ana.locator("a[href^='/api/documentos']").first().getAttribute("href")))).ok());
await ana.screenshot({ path: tela("fluxo-8-cliente.png"), fullPage: true });
const bru = await ctx(); await login(bru, "bruno@agencia.com"); await bru.waitForURL("**/painel"); check("outro operador não vê cliente", (await bru.request.get(cu)).status() === 404);
check("outro operador não abre documento", (await bru.request.get(B + (await ana.locator("a[href^='/api/documentos']").first().getAttribute("href")))).status() === 404);
await ana.click("button:has-text('Avançar para Site')"); await ana.waitForSelector("[name=headline]");
check("site não baixa antes da aprovação", (await ana.request.get(cu.replace("/clientes/", "/api/sites/"))).status() === 403);
await ana.fill("[name=headline]", "Roupa limpa no mesmo dia"); await ana.fill("[name=about]", "Lavanderia de bairro."); await ana.fill("[name=services]", "Lavagem\nPassadoria"); await ana.click("button:has-text('Fechar versão')"); await ana.waitForSelector("text=Aguardando o cliente");
check("prévia interna", (await (await ana.request.get(cu.replace("/clientes/", "/api/sites/") + "?previa=1")).text()).includes("Roupa limpa"));
await ana.click("button:has-text('Cliente aprovou')"); await ana.waitForSelector("text=Anexe em Documentos o print"); check("aprovação exige print", true); await ana.screenshot({ path: tela("fluxo-8b-site.png"), fullPage: true });
await attach("aprovacao_site"); await ana.click("button:has-text('Cliente aprovou')"); await ana.waitForSelector("text=Aprovado pelo cliente");
await ana.goto(cu); await ana.click("button:has-text('Avançar para Meta')"); await ana.waitForSelector("text=Próximo passo em Meta");
check("site baixa depois", (await ana.request.get(cu.replace("/clientes/", "/api/sites/"))).ok());
for (const next of ["Avançar para Verificação", "Concluir processo"]) { while (await ana.locator("button:has-text('Marcar como feito')").count()) { const n = await ana.locator("button:has-text('Marcar como feito')").count(); await ana.locator("button:has-text('Marcar como feito')").first().click(); await ana.waitForFunction((x) => [...document.querySelectorAll("button")].filter((b) => b.textContent === "Marcar como feito").length === x, n - 1); } await ana.click(`button:has-text('${next}')`); if (next.includes("Verif")) await ana.waitForSelector("text=Próximo passo em Verificação"); }
await ana.waitForSelector("h2:has-text('Concluído')"); check("fluxo completo concluído", true);

await adm.goto(B + "/admin/equipe"); await adm.fill("[name=full_name]", "Eva Melo"); await adm.fill("[name=email]", "eva@agencia.com"); await adm.click("button:has-text('Criar convite')"); const inv = await adm.locator("[aria-label='Link gerado']").inputValue(); await adm.screenshot({ path: tela("fluxo-9-equipe.png") });
const eva = await ctx(); await eva.goto(inv); await eva.click("button:has-text('Continuar')"); await eva.waitForURL("**/definir-senha"); await eva.fill("[name=senha]", "outra-senha-123"); await eva.fill("[name=confirma]", "outra-senha-123"); await eva.click("button:has-text('Salvar')"); await eva.waitForURL("**/painel"); check("convite e senha", true);
await adm.goto(B + "/admin/auditoria"); check("auditoria registra", await adm.locator("text=assinou a autorização").first().isVisible()); await adm.screenshot({ path: tela("fluxo-10-aud.png") });
await adm.goto(B + "/admin/prazos"); await adm.screenshot({ path: tela("fluxo-11-prazos.png") });
const mob = await ctx({ width: 390, height: 844 }); await login(mob, "admin@agencia.com"); await mob.waitForURL("**/painel");
for (const u of ["/painel", "/clientes", "/admin/produtividade", "/admin/equipe", "/admin/autorizacoes", cu.replace(B, "")]) { await mob.goto(B + u); const w = await mob.evaluate(() => document.documentElement.scrollWidth); check(`sem rolagem lateral ${u.slice(0, 22)} (${w})`, w <= 390); }
await mob.goto(B + "/admin/produtividade"); await mob.screenshot({ path: tela("fluxo-12-mob.png") });
});
await fim();
