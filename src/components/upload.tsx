"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { finishUpload, prepareUpload } from "@/actions/documents";
import { DOC_LABEL, type Result } from "@/lib/types";

export function Upload({ client }: { client: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<Result>({});

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file") as File;
    if (!file?.size) return setState({ error: "Escolha um arquivo." });
    setBusy(true);
    try {
      const p = await prepareUpload(client, file.type, file.size);
      if (!p.url || !p.path) return setState({ error: p.error });
      const r = await fetch(p.url, { method: "PUT", body: file, headers: { "content-type": file.type } });
      if (!r.ok) return setState({ error: "O envio falhou. Tente de novo." });
      const done = await finishUpload(client, p.path, String(data.get("kind")), file.name);
      setState(done);
      if (done.ok) { form.reset(); router.refresh(); }
    } catch {
      setState({ error: "O envio falhou. Verifique a conexão e tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send}>
      <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label><span className="label">Tipo</span>
          <select name="kind" className="input">{Object.entries(DOC_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label><span className="label">Arquivo como o cliente enviou (até 10 MB)</span>
          <input name="file" type="file" accept="application/pdf,image/jpeg,image/png" className="input" /></label>
        <button className="btn">{busy ? "Enviando" : "Anexar documento"}</button>
      </fieldset>
      {state.error && <p role="alert" className="mt-2 text-sm font-semibold text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="mt-2 text-sm font-semibold text-ok">{state.ok}</p>}
    </form>
  );
}
