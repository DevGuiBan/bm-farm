import type { Metadata } from "next";
import { createClientAction } from "@/actions/clients";
import { ActionForm } from "@/components/form";
import { PageHead } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Cadastrar cliente" };

export default async function Novo() {
  const me = await requireStaff();
  const { data: team } = me.role === "admin"
    ? await (await createClient()).from("profiles").select("*").eq("active", true).order("full_name") : { data: [] };
  return (
    <>
      <PageHead title="Cadastrar cliente" sub="Os dados da empresa vêm do cadastro público. O titular assina a autorização por um link antes de o trabalho começar." />
      <ActionForm action={createClientAction} className="panel max-w-2xl space-y-4">
        <label className="block"><span className="label">CNPJ</span><input className="input" name="cnpj" placeholder="00.000.000/0000-00" required /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label><span className="label">Nome do titular</span><input className="input" name="contact_name" required /></label>
          <label><span className="label">Telefone do titular</span><input className="input" name="contact_phone" type="tel" /></label>
        </div>
        <label className="block"><span className="label">E-mail do titular</span><input className="input" name="contact_email" type="email" required />
          <span className="mt-1 block text-sm text-soft">O código para assinar a autorização vai para este e-mail. Ele não pode ser trocado depois.</span></label>
        {me.role === "admin" && (
          <label className="block"><span className="label">Responsável</span>
            <select className="input" name="assigned_to"><option value="">Definir depois</option>
              {((team ?? []) as Profile[]).map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>
        )}
        <label className="flex items-start gap-2.5"><input type="checkbox" name="contrato" className="mt-1 size-4" />
          <span>Existe contrato assinado entre a agência e esta empresa.</span></label>
        <button className="btn">Cadastrar cliente</button>
      </ActionForm>
    </>
  );
}
