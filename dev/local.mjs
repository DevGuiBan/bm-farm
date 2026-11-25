// npm run local  : app + emulador, com dados guardados em .local/
// npm run e2e    : compila, sobe em memória em outras portas e roda os testes no navegador
import { spawn } from "node:child_process";
import { join } from "node:path";
import { EQUIPE, SENHA } from "./dados.mjs";
import { CHAVE_SERVICO, CODIGO, iniciar } from "./emulador.mjs";

const RAIZ = join(import.meta.dirname, "..");
const NEXT = join(RAIZ, "node_modules/next/dist/bin/next");
const e2e = process.argv[2] === "e2e";
const portaApp = e2e ? 3200 : 3000, portaDb = e2e ? 54422 : 54321;
const site = `http://localhost:${portaApp}`;

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${portaDb}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "chave-publica-local",
  SUPABASE_SECRET_KEY: CHAVE_SERVICO, PORTAL_SECRET: "segredo-local-somente-para-desenvolvimento", NEXT_PUBLIC_SITE_URL: site,
  ...(e2e && { NEXT_DIST_DIR: ".next-e2e", E2E_URL: site }),
};
const abrir = (args, opts = {}) => spawn(process.execPath, args, { cwd: RAIZ, env, stdio: "inherit", ...opts });
const esperar = (p) => new Promise((ok) => p.on("exit", (code) => ok(code ?? 1)));

let emulador;
try {
  emulador = await iniciar({ porta: portaDb, pasta: e2e ? undefined : join(RAIZ, ".local"), quieto: e2e });
} catch (e) {
  console.error(e.code === "EADDRINUSE" ? `A porta ${portaDb} está ocupada. Feche a outra execução e tente de novo.` : e.message);
  process.exit(1);
}

if (!e2e) {
  console.log(`\nAmbiente local em ${site} (senha de todos: ${SENHA})`);
  for (const [nome, email, papel] of EQUIPE) console.log(`  ${papel.padEnd(9)} ${email.padEnd(20)} ${nome}`);
  console.log(`Código de assinatura do titular: ${CODIGO}\nNenhum e-mail é enviado. Ctrl+C encerra.\n`);
  const app = abrir([NEXT, "dev", "-H", "localhost", "-p", String(portaApp)]);
  process.on("SIGINT", () => app.kill());
  const code = await esperar(app);
  await emulador.fechar();
  process.exit(code);
}

let code = await esperar(abrir([NEXT, "build"]));
if (code === 0) {
  let app;
  for (const arquivo of ["fluxo", "casos"]) {
    if (arquivo === "casos") {
      // dados limpos para a segunda bateria
      await emulador.fechar();
      emulador = await iniciar({ porta: portaDb, quieto: true });
    }
    app ??= abrir([NEXT, "start", "-H", "localhost", "-p", String(portaApp)], { stdio: "ignore" });
    for (let i = 0; i < 60; i++) {
      if (await fetch(`${site}/login`).then((r) => r.ok, () => false)) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    console.log(`\n== ${arquivo} ==`);
    code = Math.max(code, await esperar(abrir([join(RAIZ, `tests/e2e/${arquivo}.mjs`)])));
  }
  app.kill();
}
await emulador.fechar();
process.exit(code);
