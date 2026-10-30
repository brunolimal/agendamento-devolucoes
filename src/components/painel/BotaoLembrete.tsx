"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatarDiaMesHora } from "@/lib/datas";
import { AvisarCliente } from "./AvisarCliente";

/** Botão "Enviar lembrete" de uma linha da tela de lembretes (RN-13). */
export function BotaoLembrete({ id, enviadaEm }: { id: string; enviadaEm: string | null }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <div className="text-right">
        <button
          type="button"
          onClick={() => setAberto(true)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            enviadaEm ? "border border-slate-300 bg-white text-slate-700" : "bg-primaria text-white"
          }`}
        >
          {enviadaEm ? "Reenviar" : "Enviar lembrete"}
        </button>
        {enviadaEm && <p className="mt-1 text-xs text-slate-500">Enviada em {formatarDiaMesHora(new Date(enviadaEm))}</p>}
      </div>
      {aberto && (
        <AvisarCliente
          id={id}
          tipo="LEMBRETE"
          onFechar={() => {
            setAberto(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
