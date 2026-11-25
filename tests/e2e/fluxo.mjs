// Um cliente do cadastro à conclusão, passando por todos os perfis.
import { B, check, ctx, fim, login, PDF, PDF_FALSO, step, tela } from "./comum.mjs";

await step("fluxo completo", async () => {
const anon = await ctx(); await anon.goto(B + "/clientes"); check("anônimo vai ao login", anon.url().includes("/login"));
await login(anon, "ana@agencia.com", "errada"); await anon.waitForSelector("text=incorretos"); check("senha errada recusada", (await anon.inputValue("[name=email]")) === "ana@agencia.com");
await anon.screenshot({ path: tela("fluxo-1-login.png") });

const ana = await ctx(); await login(ana, "ana@agencia.com"); await ana.waitForURL("**/painel"); await ana.waitForSelector("text=Sua fila"); await ana.screenshot({ path: tela("fluxo-2-painel.png"), fullPage: true });
await ana.goto(B + "/admin/produtividade"); check("operador barrado no admin", ana.url().endsWith("/painel"));
check("operador barrado no CSV", (await ana.request.get(B + "/api/produtividade")).status() === 403);
const adm = await ctx(); await login(adm, "admin@agencia.com"); await adm.waitForURL("**/admin/produtividade");
await adm.goto(B + "/admin/produtividade"); await adm.waitForSelector("text=Por operador"); await adm.screenshot({ path: tela("fluxo-3-prod.png"), fullPage: true });
check("CSV do admin", (await (await adm.request.get(B + "/api/produtividade")).text()).includes("Ana Lima"));
await adm.goto(B + "/clientes?ver=quadro"); await adm.screenshot({ path: tela("fluxo-4-quadro.png") });
await adm.goto(B + "/clientes?ver=lista&q=padaria"); check("busca", (await adm.locator("tbody tr").count()) === 1); await adm.screenshot({ path: tela("fluxo-5-lista.png") });

// BM em Documentos, com a Ana
await ana.goto(B + "/clientes?ver=lista&q=lavanderia"); await ana.click("tbody a"); await ana.waitForURL(/clientes\/[0-9a-f-]{36}/); const cu = ana.url();
check("sem exigência de contrato", (await ana.locator("text=/contrato assinado/i").count()) === 0); check("avançar bloqueado sem documentos", await ana.locator("button:has-text('Avançar')").isDisabled());
check("sem assinatura pelo sistema", (await ana.locator("text=/link de assinatura|autoriza/i").count()) === 0);
await ana.waitForSelector("text=Documento pendente: contrato social");
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
await ana.fill("[name=headline]", "Roupa limpa no mesmo dia"); await ana.fill("[name=about]", "Lavanderia de bairro."); await ana.fill("[name=services]", "Lavagem\nPassadoria"); await ana.click("button:has-text('Fechar versão')"); await ana.waitForSelector("text=Informe o domínio do site"); check("site exige domínio", (await ana.inputValue("[name=headline]")) === "Roupa limpa no mesmo dia");
await ana.fill("form [name=domain]", "minhaempresa.pages.dev"); await ana.fill("form [name=phone]", "(11) 3333-4444"); await ana.click("button:has-text('Fechar versão')"); await ana.waitForSelector("text=Endereços gratuitos"); check("domínio gratuito recusado", true);
await ana.fill("form [name=domain]", "https://www.lavanderialimpa.agencia.com.br/"); await ana.click("button:has-text('Fechar versão')"); await ana.waitForSelector("text=Aguardando o cliente"); check("domínio da agência aceito e normalizado", await ana.locator("h2:has-text('Site em lavanderialimpa.agencia.com.br')").isVisible());
check("prévia interna", (await (await ana.request.get(cu.replace("/clientes/", "/api/sites/") + "?previa=1")).text()).includes("Roupa limpa"));
await ana.click("button:has-text('Cliente aprovou')"); await ana.waitForSelector("text=Anexe em Documentos o print"); check("aprovação exige print", true); await ana.screenshot({ path: tela("fluxo-8b-site.png"), fullPage: true });
await attach("aprovacao_site"); await ana.click("button:has-text('Cliente aprovou')"); await ana.waitForSelector("text=Aprovado pelo cliente");
await ana.goto(cu); await ana.click("button:has-text('Avançar para Meta')"); await ana.waitForSelector("text=Próximo passo em Meta");
check("site baixa depois", (await ana.request.get(cu.replace("/clientes/", "/api/sites/"))).ok());
for (const next of ["Avançar para Verificação", "Concluir processo"]) { while (await ana.locator("button:has-text('Marcar como feito')").count()) { const n = await ana.locator("button:has-text('Marcar como feito')").count(); await ana.locator("button:has-text('Marcar como feito')").first().click(); await ana.waitForFunction((x) => [...document.querySelectorAll("button")].filter((b) => b.textContent === "Marcar como feito").length === x, n - 1); } await ana.click(`button:has-text('${next}')`); if (next.includes("Verif")) await ana.waitForSelector("text=Próximo passo em Verificação"); }
await ana.waitForSelector("h2:has-text('Criada')"); check("fluxo completo concluído", true);

await adm.goto(B + "/admin/equipe"); await adm.fill("[name=full_name]", "Eva Melo"); await adm.fill("[name=email]", "eva@agencia.com"); await adm.click("button:has-text('Criar convite')"); const inv = await adm.locator("[aria-label='Link gerado']").inputValue(); await adm.screenshot({ path: tela("fluxo-9-equipe.png") });
const eva = await ctx(); await eva.goto(inv); await eva.click("button:has-text('Continuar')"); await eva.waitForURL("**/definir-senha"); await eva.fill("[name=senha]", "outra-senha-123"); await eva.fill("[name=confirma]", "outra-senha-123"); await eva.click("button:has-text('Salvar')"); await eva.waitForURL("**/painel"); check("convite e senha", true);
await adm.goto(B + "/admin/auditoria"); check("auditoria registra", await adm.locator("text=aprovou um documento").first().isVisible()); await adm.screenshot({ path: tela("fluxo-10-aud.png") });
const mob = await ctx({ width: 390, height: 844 }); await login(mob, "admin@agencia.com"); await mob.waitForURL("**/admin/produtividade");
for (const u of ["/painel", "/clientes", "/admin/produtividade", "/admin/equipe", cu.replace(B, "")]) { await mob.goto(B + u); const w = await mob.evaluate(() => document.documentElement.scrollWidth); check(`sem rolagem lateral ${u.slice(0, 22)} (${w})`, w <= 390); }
await mob.goto(B + "/admin/produtividade"); await mob.screenshot({ path: tela("fluxo-12-mob.png") });
});
await fim();
