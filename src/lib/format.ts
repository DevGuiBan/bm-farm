const TZ = "America/Sao_Paulo";
export const cnpj = (v: string) => v.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, "$1.$2.$3/$4-$5");
export const date = (v: string) => new Date(v).toLocaleDateString("pt-BR", { timeZone: TZ });
export const dateTime = (v: string) =>
  new Date(v).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
/** "2026-11-24" -> "24/11", sem passar por fuso. */
export const dayMonth = (v: string) => `${v.slice(8, 10)}/${v.slice(5, 7)}`;
export const plural = (n: number, one: string, many: string) => `${n} ${Number(n) === 1 ? one : many}`;
export const num = (v: number) => Number(v).toLocaleString("pt-BR");
export const hours = (h: number | null) => {
  if (h === null) return "sem dados";
  const n = Number(h);
  if (n < 1) return `${Math.round(n * 60)} min`;
  if (n < 48) return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${(n / 24).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias`;
};
export const bytes = (n: number) => (n < 1048576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
export const percent = (a: number, b: number) =>
  Number(b) ? `${Math.round((Number(a) / Number(b)) * 100)}%` : "sem dados";

/** Data de hoje (AAAA-MM-DD) no fuso de São Paulo. */
export const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
export function period(sp: { de?: string; ate?: string }) {
  const ok = (v?: string): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  const to = ok(sp.ate) ? sp.ate : today();
  const back = (d: number) => new Date(Date.parse(to) - d * 864e5).toISOString().slice(0, 10);
  let from = ok(sp.de) && sp.de <= to ? sp.de : back(29);
  if (from < back(366)) from = back(366);
  return { from, to };
}
