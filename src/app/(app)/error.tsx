"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="panel"><h1>Não foi possível carregar</h1>
    <p className="mt-2 mb-4 text-soft">Verifique a conexão e tente de novo. Se continuar, avise um administrador.</p>
    <button className="btn" onClick={reset}>Tentar de novo</button></div>;
}
