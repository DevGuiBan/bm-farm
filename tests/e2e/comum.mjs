import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { SENHA } from "../../dev/dados.mjs";

export const B = process.env.E2E_URL;
if (!B) { console.error("Rode por: npm run e2e"); process.exit(1); }
const TELAS = join(import.meta.dirname, "../../.local/telas");
mkdirSync(TELAS, { recursive: true });
export const tela = (nome) => join(TELAS, nome);

// Usa o navegador já instalado na máquina.
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch({ channel: "msedge" }));
const erros = new Set();
let ok = 0, falhas = 0;

export const PDF = { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 teste") };
export const PDF_FALSO = { name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("nao sou pdf") };

export const check = (nome, v, info = "") => {
  if (v) ok++; else falhas++;
  console.log(v ? "OK   " : "FALHA", nome, v ? "" : info);
};
export const step = async (nome, fn) => {
  try { await fn(); } catch (e) { check(nome, false, e.message.split("\n").slice(0, 4).join(" ")); }
};
export const ctx = async (viewport = { width: 1440, height: 900 }) => {
  const p = await (await browser.newContext({ viewport })).newPage();
  p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => erros.add(e.message));
  return p;
};
export const login = async (p, email, senha = SENHA) => {
  await p.goto(`${B}/login`);
  await p.fill("[name=email]", email);
  await p.fill("[name=senha]", senha);
  await p.click("button:has-text('Entrar')");
};
export const enter = async (email, senha) => {
  const p = await ctx();
  await login(p, email, senha);
  await p.waitForURL("**/painel");
  return p;
};
export const fim = async () => {
  if (erros.size) check("sem erros no navegador", false, [...erros].join(" | "));
  console.log(`${ok} OK, ${falhas} falhas`);
  await browser.close();
  process.exit(falhas ? 1 : 0);
};
