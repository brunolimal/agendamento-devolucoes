import type { Status } from "@/lib/regras";

export const ROTULO_STATUS: Record<Status, string> = {
  SOLICITADO: "Solicitado",
  CONFIRMADO: "Confirmado",
  RECUSADO: "Recusado",
  CANCELADO_CLIENTE: "Cancelado pelo cliente",
  CANCELADO_EMPRESA: "Cancelado pela empresa",
  CONCLUIDO: "Concluído",
  NAO_COMPARECEU: "Não compareceu",
};

// Cores fixas por status (SPEC §5).
export const COR_STATUS: Record<Status, string> = {
  SOLICITADO: "bg-yellow-100 text-yellow-900 ring-yellow-300",
  CONFIRMADO: "bg-green-100 text-green-900 ring-green-300",
  RECUSADO: "bg-slate-200 text-slate-800 ring-slate-300",
  CANCELADO_CLIENTE: "bg-red-100 text-red-900 ring-red-300",
  CANCELADO_EMPRESA: "bg-red-100 text-red-900 ring-red-300",
  CONCLUIDO: "bg-blue-100 text-blue-900 ring-blue-300",
  NAO_COMPARECEU: "bg-orange-100 text-orange-900 ring-orange-300",
};

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ring-1 ring-inset ${COR_STATUS[status]} ${className}`}
    >
      {ROTULO_STATUS[status]}
    </span>
  );
}
