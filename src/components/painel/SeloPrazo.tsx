import { formatarData } from "@/lib/datas";
import type { SituacaoPrazo } from "@/lib/regras";

const ESTILO: Record<SituacaoPrazo, { classe: string; rotulo: string }> = {
  NO_PRAZO: { classe: "bg-green-100 text-green-900 ring-green-300", rotulo: "No prazo" },
  VENCE_EM_BREVE: { classe: "bg-yellow-100 text-yellow-900 ring-yellow-300", rotulo: "Vence em breve" },
  VENCIDO: { classe: "bg-red-100 text-red-900 ring-red-300", rotulo: "Prazo vencido" },
};

/** Selo da RN-06: no prazo / vence em ≤ 1 dia / vencido. */
export function SeloPrazo({ situacao, prazo }: { situacao: SituacaoPrazo; prazo: string }) {
  const e = ESTILO[situacao];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${e.classe}`}>
      {e.rotulo} · até {formatarData(prazo)}
    </span>
  );
}

export function SeloAlinhar() {
  return (
    <span className="inline-flex items-center rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-900 ring-1 ring-inset ring-orange-300">
      ⚠️ Alinhar
    </span>
  );
}
