import type { Metadata } from "next";
import { revoke, sendCode, signAuthorization, verifyCode } from "@/actions/portal";
import { ActionForm } from "@/components/form";
import { StatusBadge } from "@/components/ui";
import { cnpj, dateTime } from "@/lib/format";
import { findInvite, portalAccess } from "@/lib/portal";
import { adminClient } from "@/lib/supabase/admin";
import { terms } from "@/lib/terms";
import type { Authorization } from "@/lib/types";

export const metadata: Metadata = { title: "Autorização" };

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">{children}</main>;
}
const mask = (e: string) => e.replace(/^(.).*(@.*)$/, "$1•••$2");

export default async function Portal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const T = <input type="hidden" name="token" value={token} />;
  const invite = await findInvite(token);
  if (!invite) return <Shell><h1>Este link não vale mais</h1><p className="mt-2 text-soft">Ele expirou ou foi substituído. Peça um novo à agência.</p></Shell>;
  const access = await portalAccess(token);
  if (!access) {
    return (
      <Shell>
        <h1>Confirme seu e-mail</h1>
        <p className="mt-2 mb-6 text-soft">Vamos enviar um código para {mask(invite.client.contact_email)}. Se este e-mail não for seu, feche a página e avise a agência.</p>
        <section className="panel space-y-6">
          <ActionForm action={sendCode}>{T}<button className="btn btn-quiet">Enviar código</button></ActionForm>
          <ActionForm action={verifyCode} className="space-y-3">{T}
            <label className="block"><span className="label">Código recebido</span><input className="input max-w-48 text-lg tabular-nums" name="code" inputMode="numeric" autoComplete="one-time-code" required /></label>
            <button className="btn">Entrar</button></ActionForm>
        </section>
      </Shell>
    );
  }
  const c = access.client;
  const { data } = await adminClient().from("authorizations").select("*").eq("client_id", c.id).order("signed_at", { ascending: false });
  const auth = data?.[0] as Authorization | undefined;
  const live = auth?.status === "pendente" || auth?.status === "aprovado";
  return (
    <Shell>
      <h1>{c.legal_name}</h1>
      <p className="mt-1 mb-6 text-soft">CNPJ {cnpj(c.cnpj)}</p>
      <div className="grid gap-5">
        <section className="panel">
          <div className="mb-3 flex items-center justify-between gap-3"><h2>Autorização</h2>{auth && <StatusBadge status={auth.status} />}</div>
          {auth && <p className="mb-3 text-sm text-soft">Assinada por {auth.signer_name} em {dateTime(auth.signed_at)}.{auth.review_note && ` Observação: ${auth.review_note}`}</p>}
          {!live && c.stage === "autorizacao" && (
            <ActionForm action={signAuthorization} className="space-y-4">{T}
              <ol className="list-decimal space-y-2 pl-5">{terms(c).map((t) => <li key={t}>{t}</li>)}</ol>
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="label">Seu nome completo</span><input className="input" name="name" autoComplete="name" required /></label>
                <label><span className="label">Você assina como</span><select className="input" name="role"><option value="socio">Sócio ou administrador</option><option value="procurador">Procurador</option></select></label>
                <label><span className="label">Domínio próprio da empresa</span><input className="input" name="domain" placeholder="empresa.com.br" required /></label>
                <label><span className="label">Telefone da empresa</span><input className="input" name="phone" type="tel" required /></label>
              </div>
              <label className="flex items-start gap-2.5"><input type="checkbox" name="aceite" className="mt-1 size-4" /><span>Li e concordo com os termos acima.</span></label>
              <button className="btn">Assinar autorização</button>
            </ActionForm>)}
          {live && <details><summary className="link">Revogar autorização</summary><ActionForm action={revoke} className="mt-3" confirm="O atendimento será interrompido. Clique de novo para confirmar.">{T}<button className="btn btn-bad">Revogar autorização</button></ActionForm></details>}
        </section>
      </div>
    </Shell>
  );
}
