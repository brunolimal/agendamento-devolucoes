import type { Metadata } from "next";
import Link from "next/link";
import { sair } from "@/app/painel/login/actions";
import { temSessao } from "@/lib/auth";

export const metadata: Metadata = { title: "Painel" };

const LINKS = [
  { href: "/painel", rotulo: "Caixa de entrada" },
  { href: "/painel/agenda", rotulo: "Agenda" },
  { href: "/painel/lembretes", rotulo: "Lembretes" },
  { href: "/painel/agendamentos", rotulo: "Agendamentos" },
  { href: "/painel/novo", rotulo: "Novo" },
  { href: "/painel/config", rotulo: "Config" },
];

export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const logado = await temSessao();
  return (
    <div>
      {logado && (
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {l.rotulo}
              </Link>
            ))}
            <form action={sair} className="ml-auto">
              <button type="submit" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100">
                Sair
              </button>
            </form>
          </nav>
        </header>
      )}
      {children}
    </div>
  );
}
