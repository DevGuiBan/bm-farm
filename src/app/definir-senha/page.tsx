import { setPassword } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm } from "@/components/form";

export default function NewPassword() {
  return (
    <AuthShell title="Escolha uma senha">
      <ActionForm action={setPassword} className="space-y-4">
        <label className="block"><span className="label">Nova senha (10 caracteres ou mais)</span><input className="input" name="senha" type="password" autoComplete="new-password" required minLength={10} /></label>
        <label className="block"><span className="label">Repita a senha</span><input className="input" name="confirma" type="password" autoComplete="new-password" required /></label>
        <button className="btn w-full">Salvar senha</button>
      </ActionForm>
    </AuthShell>
  );
}
