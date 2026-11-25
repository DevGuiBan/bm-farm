"use client";
import { ChartColumn, Columns3, History, LayoutList, LogOut, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/actions/auth";
import type { Profile } from "@/lib/types";

const OPERATOR: [string, string, LucideIcon][] = [
  ["/painel", "Meu painel", LayoutList], ["/clientes", "BMs", Columns3],
];
const ADMIN: [string, string, LucideIcon][] = [
  ["/admin/produtividade", "Produtividade", ChartColumn], ["/clientes", "BMs", Columns3],
  ["/admin/equipe", "Equipe", Users], ["/admin/auditoria", "Auditoria", History],
];

export function Nav({ me }: { me: Profile }) {
  const path = usePathname();
  const items = me.role === "admin" ? ADMIN : OPERATOR;
  return (
    <aside className="flex flex-col gap-4 border-b border-line bg-paper px-4 py-4 lg:sticky lg:top-0 lg:h-dvh lg:w-60 lg:shrink-0 lg:border-r lg:border-b-0 lg:py-6">
      <Link href="/painel" className="flex items-center gap-2.5 px-2 text-lg font-bold tracking-tight">
        <span aria-hidden className="flex gap-0.5"><i className="h-4 w-2 rounded-[2px] bg-petrol" /><i className="h-4 w-2 rounded-[2px] bg-petrol" /><i className="h-4 w-2 rounded-[2px] bg-[#a9cbcd]" /></span>
        Trilho
      </Link>
      <nav aria-label="Principal" className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
        {items.map(([href, label, Icon]) => {
          const on = path.startsWith(href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 font-medium whitespace-nowrap ${on ? "bg-mist text-petrol-dark" : "text-soft hover:text-ink"}`}>
              <Icon size={18} aria-hidden />{label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between gap-2 px-2 lg:mt-auto">
        <div className="min-w-0 leading-tight"><div className="truncate font-semibold">{me.full_name}</div>
          <div className="text-sm text-soft">{me.role === "admin" ? "Administrador" : "Operador"}</div></div>
        <form action={logout}><button className="btn btn-quiet px-2.5" aria-label="Sair" title="Sair"><LogOut size={17} /></button></form>
      </div>
    </aside>
  );
}
