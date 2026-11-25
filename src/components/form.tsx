"use client";
import { Check, Copy } from "lucide-react";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { Result } from "@/lib/types";

type Action = (prev: Result, f: FormData) => Promise<Result>;

/** Formulário ligado a uma server action. Mantém o que foi digitado quando há erro. */
export function ActionForm({ action, children, className, reset, confirm }: {
  action: Action; children: React.ReactNode; className?: string; reset?: boolean; confirm?: string;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const [armed, setArmed] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok && reset) ref.current?.reset(); }, [state, reset]);
  return (
    <form
      ref={ref} onChange={() => setArmed(false)}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !armed) return setArmed(true);
        setArmed(false);
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => dispatch(data));
      }}
    >
      <fieldset disabled={pending} className={`min-w-0 ${className ?? ""}`}>{children}</fieldset>
      {armed && <p role="alert" className="mt-2 text-sm font-semibold text-warn">{confirm}</p>}
      {state.error && <p role="alert" className="mt-2 text-sm font-semibold text-bad">{state.error}</p>}
      {state.ok && <p role="status" className="mt-2 text-sm font-semibold text-ok">{state.ok}</p>}
      {state.link && <CopyLink value={state.link} />}
    </form>
  );
}

export function CopyLink({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="mt-2 flex gap-2">
      <input className="input text-sm" readOnly value={value} aria-label="Link gerado" onFocus={(e) => e.target.select()} />
      <button type="button" className="btn btn-quiet" onClick={() => navigator.clipboard.writeText(value).then(() => setDone(true))}>
        {done ? <Check size={16} /> : <Copy size={16} />}{done ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
