"use client";

import { useState } from "react";
import { copiarJanelas, salvarJanelasDia } from "@/app/painel/actions/config";
import { NOMES_DIA, ORDEM_DIAS } from "@/lib/janelas";
import { btnNeutro, btnPerigo, btnPrimario, campo, Retorno, useEnvio } from "./ui";

export interface LinhaJanela {
  id?: number;
  horaInicio: string;
  horaFim: string;
  capacidade: number;
  ativo: boolean;
}

export function EditorJanelas({ porDia }: { porDia: Record<number, LinhaJanela[]> }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Defina as janelas de cada dia da semana. Janelas que já têm agendamentos não são apagadas: ficam desativadas.
        Janelas do mesmo dia não podem se sobrepor.
      </p>
      {ORDEM_DIAS.map((dia) => (
        <DiaJanelas key={`${dia}:${JSON.stringify(porDia[dia])}`} dia={dia} inicial={porDia[dia] ?? []} />
      ))}
    </div>
  );
}

function DiaJanelas({ dia, inicial }: { dia: number; inicial: LinhaJanela[] }) {
  const [linhas, setLinhas] = useState<LinhaJanela[]>(inicial);
  const [destinos, setDestinos] = useState<number[]>([]);
  const salvar = useEnvio();
  const copiar = useEnvio();
  const sujo = JSON.stringify(linhas) !== JSON.stringify(inicial);

  function alterar(i: number, parcial: Partial<LinhaJanela>) {
    setLinhas((a) => a.map((l, k) => (k === i ? { ...l, ...parcial } : l)));
  }

  return (
    <details className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200" open={sujo || inicial.length > 0}>
      <summary className="cursor-pointer font-semibold">
        {NOMES_DIA[dia]}{" "}
        <span className="text-sm font-normal text-slate-500">
          ({inicial.filter((l) => l.ativo).length} ativa{inicial.filter((l) => l.ativo).length === 1 ? "" : "s"}
          {sujo ? " · alterações não salvas" : ""})
        </span>
      </summary>

      <div className="mt-3 space-y-2">
        {linhas.length === 0 && <p className="text-sm text-slate-500">Sem janelas neste dia.</p>}
        {linhas.map((l, i) => (
          <div key={l.id ?? `n${i}`} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_6rem_auto_auto]">
            <label className="text-xs text-slate-600">
              Início
              <input type="time" className={campo} value={l.horaInicio} onChange={(e) => alterar(i, { horaInicio: e.target.value })} />
            </label>
            <label className="text-xs text-slate-600">
              Fim
              <input type="time" className={campo} value={l.horaFim} onChange={(e) => alterar(i, { horaFim: e.target.value })} />
            </label>
            <label className="text-xs text-slate-600">
              Capacidade
              <input
                type="number"
                min={0}
                max={99}
                className={campo}
                value={l.capacidade}
                onChange={(e) => alterar(i, { capacidade: e.target.value === "" ? 0 : Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={l.ativo} onChange={(e) => alterar(i, { ativo: e.target.checked })} />
              Ativa
            </label>
            <button type="button" className={`${btnPerigo} pb-2`} onClick={() => setLinhas((a) => a.filter((_, k) => k !== i))}>
              Remover
            </button>
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            className={btnNeutro}
            onClick={() => setLinhas((a) => [...a, { horaInicio: "08:00", horaFim: "09:00", capacidade: 2, ativo: true }])}
          >
            + Adicionar janela
          </button>
          <button
            type="button"
            className={btnPrimario}
            disabled={salvar.pendente || !sujo}
            onClick={() => void salvar.enviar(() => salvarJanelasDia({ dia, janelas: linhas }))}
          >
            {salvar.pendente ? "Salvando..." : `Salvar ${NOMES_DIA[dia].toLowerCase()}`}
          </button>
        </div>
        <Retorno resultado={salvar.resultado} />

        {inicial.some((l) => l.ativo) && (
          <fieldset className="space-y-2 rounded-lg bg-slate-50 p-3">
            <legend className="px-1 text-sm font-medium">Copiar estas janelas para outros dias</legend>
            <div className="flex flex-wrap gap-3">
              {ORDEM_DIAS.filter((d) => d !== dia).map((d) => (
                <label key={d} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={destinos.includes(d)}
                    onChange={(e) => setDestinos((a) => (e.target.checked ? [...a, d] : a.filter((x) => x !== d)))}
                  />
                  {NOMES_DIA[d]}
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Copia o que está <strong>salvo</strong> e substitui as janelas dos dias marcados.
              {sujo && " Salve as alterações deste dia antes de copiar."}
            </p>
            <button
              type="button"
              className={btnNeutro}
              disabled={copiar.pendente || sujo || destinos.length === 0}
              onClick={() => {
                const nomes = destinos.map((d) => NOMES_DIA[d]).join(", ");
                if (!window.confirm(`As janelas de ${nomes} serão substituídas pelas de ${NOMES_DIA[dia]}. Continuar?`)) return;
                void copiar.enviar(() => copiarJanelas({ origem: dia, destinos })).then((r) => {
                  if (r.ok) setDestinos([]);
                });
              }}
            >
              {copiar.pendente ? "Copiando..." : "Copiar para os dias marcados"}
            </button>
            <Retorno resultado={copiar.resultado} />
          </fieldset>
        )}
      </div>
    </details>
  );
}
