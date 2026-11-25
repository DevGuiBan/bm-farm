import { confirmLink } from "@/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { ActionForm } from "@/components/form";

export default async function Confirm({ searchParams }: { searchParams: Promise<{ t?: string; tipo?: string }> }) {
  const { t = "", tipo = "invite" } = await searchParams;
  return (
    <AuthShell title="Definir sua senha">
      <p className="mb-5 text-soft">Continue para confirmar o link e escolher uma senha.</p>
      <ActionForm action={confirmLink}>
        <input type="hidden" name="t" value={t} /><input type="hidden" name="tipo" value={tipo} />
        <button className="btn w-full">Continuar</button>
      </ActionForm>
    </AuthShell>
  );
}
