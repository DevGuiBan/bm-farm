import Link from "next/link";
export default function NotFound() {
  return <main className="mx-auto max-w-lg px-6 py-24"><h1>Página não encontrada</h1>
    <p className="mt-2 mb-6 text-soft">O endereço não existe ou você não tem acesso a ele.</p><Link href="/painel" className="btn">Ir para o painel</Link></main>;
}
