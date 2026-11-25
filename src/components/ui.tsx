import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import { hours } from "@/lib/format";
import { FLOW, STAGE_LABEL, type ReviewStatus, type Stage } from "@/lib/types";

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

export function Deadline({ row }: { row: { stage: Stage; hours_in_stage: number; sla_hours: number | null; counts_for_operator: boolean | null; late: boolean } }) {
  if (row.stage === "concluido") return <span className="badge badge-ok"><CircleCheck size={14} />Concluído</span>;
  if (row.stage === "cancelado") return <span className="badge">Cancelado</span>;
  const left = Number(row.sla_hours) - Number(row.hours_in_stage);
  if (!row.counts_for_operator) return <span className="badge"><Clock size={14} />No cliente há {hours(row.hours_in_stage)}</span>;
  if (row.late) return <span className="badge badge-bad"><CircleAlert size={14} />Atrasado {hours(-left)}</span>;
  return <span className={`badge ${left < Number(row.sla_hours) * 0.25 ? "badge-warn" : ""}`}><Clock size={14} />Restam {hours(left)}</span>;
}

/** Trilho: cada segmento é uma etapa; o atual enche conforme o prazo é consumido. */
export function Trail({ stage, hoursIn = 0, sla, late, labels }: {
  stage: Stage; hoursIn?: number; sla?: number | null; late?: boolean; labels?: boolean;
}) {
  const at = stage === "concluido" ? FLOW.length : FLOW.indexOf(stage as (typeof FLOW)[number]);
  const used = sla ? Math.min(Number(hoursIn) / Number(sla), 1) * 100 : 0;
  return (
    <ol className="flex w-full gap-1" aria-label={`Etapa atual: ${STAGE_LABEL[stage]}`}>
      {FLOW.map((s, i) => (
        <li key={s} className="min-w-0 flex-1" title={STAGE_LABEL[s]}>
          <div className={`overflow-hidden rounded-[3px] ${labels ? "h-3" : "h-2"} ${i < at ? "bg-petrol" : i === at ? "bg-[#a9cbcd]" : "bg-[#dde6e6]"}`}>
            {i === at && <div className={`h-full ${late ? "bg-bad" : "bg-petrol"}`} style={{ width: `${Math.max(used, 6)}%` }} />}
          </div>
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
