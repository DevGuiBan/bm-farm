"use client";
import { useState } from "react";
import { dayMonth, hours, plural } from "@/lib/format";
import { STAGE_LABEL, type FlowStage } from "@/lib/types";

export function DailyBars({ data }: { data: { day: string; advances: number; completed: number }[] }) {
  const [at, setAt] = useState<number | null>(null);
  const peak = Math.max(...data.map((d) => Number(d.advances)), 1);
  const step = Math.max(1, Math.ceil(peak / 4));
  const top = step * Math.ceil(peak / step);
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const every = Math.ceil(data.length / 8);
  const cur = at === null ? null : data[at];
  return (
    <figure>
      <div className="relative ml-8 h-52" onMouseLeave={() => setAt(null)}>
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-[#e4ecec]" style={{ bottom: `${(t / top) * 100}%` }}>
            <span className="absolute -left-8 w-6 -translate-y-1/2 text-right text-xs text-soft tabular-nums">{t}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-stretch">
          {data.map((d, i) => (
            <button key={d.day} type="button" className="flex min-w-0 flex-1 cursor-default items-end justify-center px-px"
              onMouseEnter={() => setAt(i)} onFocus={() => setAt(i)} onBlur={() => setAt(null)}
              aria-label={`${dayMonth(d.day)}: ${plural(d.advances, "etapa", "etapas")}, ${plural(d.completed, "cliente concluído", "clientes concluídos")}`}>
              <span className={`w-full max-w-6 rounded-t-[4px] ${at === i ? "bg-petrol-dark" : "bg-petrol"}`}
                style={{ height: `${(Number(d.advances) / top) * 100}%` }} />
            </button>
          ))}
        </div>
        {cur && (
          <div className="pointer-events-none absolute -top-2 z-10 rounded-md border border-line bg-paper px-3 py-2 text-sm whitespace-nowrap"
            style={at! > data.length / 2 ? { right: `${(1 - at! / data.length) * 100}%` } : { left: `${((at! + 1) / data.length) * 100}%` }}>
            <b>{dayMonth(cur.day)}</b><br />{plural(cur.advances, "etapa", "etapas")}<br />{plural(cur.completed, "cliente concluído", "clientes concluídos")}
          </div>
        )}
      </div>
      <div className="ml-8 flex" aria-hidden>
        {data.map((d, i) => (
          <span key={d.day} className="min-w-0 flex-1 overflow-visible pt-1.5 text-center text-xs whitespace-nowrap text-soft tabular-nums">
            {i % every === 0 && <span className="relative left-1/2 inline-block -translate-x-1/2">{dayMonth(d.day)}</span>}
          </span>
        ))}
      </div>
    </figure>
  );
}

export function StageBars({ data }: { data: { stage: FlowStage; avg_hours: number | null; samples: number; sla_hours: number }[] }) {
  const max = Math.max(...data.flatMap((d) => [Number(d.avg_hours ?? 0), Number(d.sla_hours)]), 1) * 1.05;
  return (
    <div>
      <ul className="space-y-4">
        {data.map((d) => (
          <li key={d.stage} title={`${plural(d.samples, "passagem", "passagens")} no período`}>
            <div className="mb-1 flex justify-between gap-3 text-sm">
              <span className="font-semibold">{STAGE_LABEL[d.stage]}</span>
              <span className="text-soft">{hours(d.avg_hours)}, prazo de {hours(d.sla_hours)}</span>
            </div>
            <div className="relative h-3">
              <div className="h-full rounded-r-[4px] bg-petrol" style={{ width: `${(Number(d.avg_hours ?? 0) / max) * 100}%` }} />
              <i className="absolute -inset-y-1 w-0.5 bg-ink ring-2 ring-paper" style={{ left: `${(d.sla_hours / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-2 text-sm text-soft"><i className="inline-block h-4 w-0.5 bg-ink" />Prazo da etapa</p>
    </div>
  );
}
