"use client";

import { useState } from "react";

export function BotaoCopiar({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // sem permissão de área de transferência: o protocolo continua visível na tela
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="rounded-xl border border-primaria px-5 py-3 font-semibold text-primaria active:bg-primaria/10"
    >
      {copiado ? "Copiado!" : "Copiar"}
    </button>
  );
}
