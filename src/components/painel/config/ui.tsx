"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ResultadoConfig } from "@/app/painel/actions/config";

export const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/30";
export const btn = "rounded-lg px-4 py-2 font-semibold disabled:opacity-50";
export const btnPrimario = `${btn} bg-primaria text-white`;
export const btnNeutro = `${btn} border border-slate-300 bg-white text-slate-700`;
export const btnPerigo = `${btn} border border-red-300 bg-white text-red-700`;

/** Envio de um formulário de configuração: pendente, resultado e atualização da tela ao salvar. */
export function useEnvio() {
  const router = useRouter();
  const [pendente, setPendente] = useState(false);
  const [resultado, setResultado] = useState<ResultadoConfig | null>(null);

  async function enviar(chamada: () => Promise<ResultadoConfig>) {
    setPendente(true);
    setResultado(null);
    const r = await chamada();
    setPendente(false);
    setResultado(r);
    if (r.ok) router.refresh();
    return r;
  }

  return { pendente, resultado, enviar, limpar: () => setResultado(null) };
}

export function erroDe(resultado: ResultadoConfig | null, chave: string): string | undefined {
  return resultado && !resultado.ok ? resultado.campos?.[chave] : undefined;
}

export function Retorno({ resultado }: { resultado: ResultadoConfig | null }) {
  if (!resultado) return null;
  if (!resultado.ok) {
    return (
      <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
        {resultado.erro}
      </p>
    );
  }
  return (
    <div role="status" className="space-y-1">
      <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900 ring-1 ring-green-200">{resultado.mensagem}</p>
      {resultado.avisos?.map((a) => (
        <p key={a} className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900 ring-1 ring-yellow-200">
          {a}
        </p>
      ))}
    </div>
  );
}

export function Campo({
  rotulo,
  dica,
  erro,
  children,
}: {
  rotulo: string;
  dica?: string;
  erro?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{rotulo}</span>
      {children}
      {dica && <span className="mt-1 block text-xs text-slate-500">{dica}</span>}
      {erro && <span className="mt-1 block text-sm text-red-700">{erro}</span>}
    </label>
  );
}
