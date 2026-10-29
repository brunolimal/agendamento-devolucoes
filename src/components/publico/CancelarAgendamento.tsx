"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cancelarPeloCliente } from "@/app/a/[token]/actions";

// RN-08: exige confirmação em 2 cliques.
export function CancelarAgendamento({ token, limite }: { token: string; limite: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function cancelar() {
    setEnviando(true);
    const r = await cancelarPeloCliente(token);
    if (r.ok) {
      router.refresh();
      return;
    }
    setEnviando(false);
    setErro(r.erro);
    setConfirmando(false);
  }

  return (
    <div className="space-y-2">
      {erro && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800 ring-1 ring-red-200">
          {erro}
        </p>
      )}
      {!confirmando ? (
        <>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="w-full rounded-xl border border-red-300 bg-white px-5 py-4 text-lg font-semibold text-red-700"
          >
            Cancelar agendamento
          </button>
          <p className="text-center text-sm text-slate-500">Você pode cancelar até {limite}.</p>
        </>
      ) : (
        <div className="space-y-2 rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
          <p className="font-medium text-red-900">Tem certeza que deseja cancelar?</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-700"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={cancelar}
              disabled={enviando}
              className="flex-1 rounded-xl bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-50"
            >
              {enviando ? "Cancelando..." : "Sim, cancelar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
