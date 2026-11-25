import { CircleCheck, Clock } from "lucide-react";
import { hours } from "@/lib/format";
import { FLOW, STAGE_LABEL, type Portfolio, type ReviewStatus, type Stage } from "@/lib/types";

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div><h1>{title}</h1>{sub && <p className="mt-1 max-w-[70ch] text-soft">{sub}</p>}</div>
      {children}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-soft">{children}</p>;
}

const STATUS: Record<ReviewStatus, [string, string]> = {
  pendente: ["badge-warn", "Em análise"], aprovado: ["badge-ok", "Aprovado"],
  recusado: ["badge-bad", "Recusado"], revogado: ["badge-bad", "Revogado"],
};
export function StatusBadge({ status }: { status: ReviewStatus }) {
  const [cls, text] = STATUS[status];
  return <span className={`badge ${cls}`}>{text}</span>;
}

export function StageAge({ row }: { row: { stage: Stage; hours_in_stage: number; portfolio: Portfolio } }) {
  if (row.stage === "concluido" && row.portfolio === "existente") return <span className="badge">Já existia, fora da meta</span>;
  if (row.stage === "concluido") return <span className="badge badge-ok"><CircleCheck size={14} />Criada</span>;
  if (row.stage === "cancelado") return <span className="badge">Cancelada</span>;
  return <span className="badge"><Clock size={14} />Na etapa há {hours(row.hours_in_stage)}</span>;
}

/** Trilho: cada segmento é uma etapa; o atual fica em destaque. */
export function Trail({ stage, labels }: { stage: Stage; labels?: boolean }) {
  const at = stage === "concluido" ? FLOW.length : FLOW.indexOf(stage as (typeof FLOW)[number]);
  return (
    <ol className="flex w-full gap-1" aria-label={`Etapa atual: ${STAGE_LABEL[stage]}`}>
      {FLOW.map((s, i) => (
        <li key={s} className="min-w-0 flex-1" title={STAGE_LABEL[s]}>
          <div className={`overflow-hidden rounded-[3px] ${labels ? "h-3" : "h-2"} ${i < at ? "bg-petrol" : i === at ? "bg-[#a9cbcd]" : "bg-[#dde6e6]"}`} />
          {labels && <span className={`mt-1.5 hidden truncate text-sm sm:block ${i === at ? "font-semibold" : "text-soft"}`}>{STAGE_LABEL[s]}</span>}
        </li>
      ))}
    </ol>
  );
}

export function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="min-w-0 border-l-2 border-petrol pl-4">
      <div className="text-sm text-soft">{label}</div>
      <div className="text-2xl font-semibold tracking-tight">{value}</div>
      {note && <div className="text-sm text-soft">{note}</div>}
    </div>
  );
}
