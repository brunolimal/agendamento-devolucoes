"use client";

import { diaSemana, formatarMes, limitesDoMes, listarDias, mesDe, somarDias } from "@/lib/datas";

interface Props {
  mes: string;
  /** Datas disponíveis (yyyy-MM-dd) do mês exibido. */
  disponiveis: Set<string>;
  selecionada: string | null;
  carregando: boolean;
  mesMin: string;
  mesMax: string;
  onSelecionar: (data: string) => void;
  onMes: (mes: string) => void;
}

const CABECALHO = ["D", "S", "T", "Q", "Q", "S", "S"];

export function Calendario({ mes, disponiveis, selecionada, carregando, mesMin, mesMax, onSelecionar, onMes }: Props) {
  const { de, ate } = limitesDoMes(mes);
  const dias = listarDias(de, ate);
  const vazios = diaSemana(de);
  const anterior = mesDe(somarDias(de, -1));
  const seguinte = mesDe(somarDias(ate, 1));

  return (
    <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMes(anterior)}
          disabled={mes <= mesMin}
          aria-label="Mês anterior"
          className="h-11 w-11 rounded-lg text-xl text-primaria disabled:opacity-30"
        >
          ‹
        </button>
        <span className="font-semibold capitalize">{formatarMes(mes)}</span>
        <button
          type="button"
          onClick={() => onMes(seguinte)}
          disabled={mes >= mesMax}
          aria-label="Próximo mês"
          className="h-11 w-11 rounded-lg text-xl text-primaria disabled:opacity-30"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {CABECALHO.map((c, i) => (
          <span key={i}>{c}</span>
        ))}
      </div>
      <div className={`mt-1 grid grid-cols-7 gap-1 ${carregando ? "opacity-50" : ""}`}>
        {Array.from({ length: vazios }, (_, i) => (
          <span key={`v${i}`} />
        ))}
        {dias.map((data) => {
          const livre = !carregando && disponiveis.has(data);
          const ativa = data === selecionada;
          return (
            <button
              key={data}
              type="button"
              disabled={!livre}
              onClick={() => onSelecionar(data)}
              aria-pressed={ativa}
              className={`h-11 rounded-lg text-sm font-medium ${
                ativa
                  ? "bg-primaria text-white"
                  : livre
                    ? "bg-slate-100 text-slate-900 active:bg-slate-200"
                    : "text-slate-300"
              }`}
            >
              {Number(data.slice(8))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
