export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-petrol-dark p-12 text-white lg:flex">
        <span className="text-xl font-bold tracking-tight">Trilho</span>
        <div>
          <p className="max-w-[16ch] text-5xl leading-[1.05] font-bold tracking-tight">Cada cliente em uma etapa, cada etapa com prazo.</p>
          <div className="mt-10 flex gap-1.5" aria-hidden>
            <i className="h-4 flex-1 rounded-[3px] bg-white" /><i className="h-4 flex-1 rounded-[3px] bg-white" />
            <i className="h-4 flex-1 overflow-hidden rounded-[3px] bg-white/25"><b className="block h-full w-3/5 bg-white" /></i>
            <i className="h-4 flex-1 rounded-[3px] bg-white/25" /><i className="h-4 flex-1 rounded-[3px] bg-white/25" />
          </div>
        </div>
        <span className="text-white/75">Acesso restrito à equipe</span>
      </div>
      <div className="flex items-center justify-center bg-paper px-6 py-16"><div className="w-full max-w-sm"><h1 className="mb-6">{title}</h1>{children}</div></div>
    </main>
  );
}
