import type { Metadata } from "next";
import { login } from "@/actions/auth";
import { ActionForm } from "@/components/form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = { title: "Entrar" };
export default async function Login({ searchParams }: { searchParams: Promise<{ motivo?: string }> }) {
  const { motivo } = await searchParams;
  return (
    <AuthShell title="Entrar">
      {motivo === "sem-acesso" && <p className="mb-4 font-semibold text-warn">Seu usuário não tem acesso ativo. Fale com um administrador.</p>}
      <ActionForm action={login} className="space-y-4">
        <label className="block"><span className="label">E-mail</span><input className="input" name="email" type="email" autoComplete="username" required /></label>
        <label className="block"><span className="label">Senha</span><input className="input" name="senha" type="password" autoComplete="current-password" required /></label>
        <button className="btn w-full">Entrar</button>
      </ActionForm>
      <p className="mt-6 text-sm text-soft">Esqueceu a senha? Peça um novo link a um administrador.</p>
    </AuthShell>
  );
}
