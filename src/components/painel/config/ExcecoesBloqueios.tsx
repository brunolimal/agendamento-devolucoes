"use client";

import { useState } from "react";
import { criarBloqueio, removerBloqueio, removerExcecao, salvarExcecao } from "@/app/painel/actions/config";
import { diaSemana, formatarData, formatarDiaSemana, formatarHora } from "@/lib/datas";
import { btnPerigo, btnPrimario, campo, Campo, erroDe, Retorno, useEnvio } from "./ui";

export interface JanelaOpcao {
  id: number;
  diaSemana: number;
  horaInicio: string;
  horaFim: string;
  capacidade: number;
}

const rotuloJanela = (j: Pick<JanelaOpcao, "horaInicio" | "horaFim">) => `${formatarHora(j.horaInicio)} às ${formatarHora(j.horaFim)}`;

// ---------------------------------------------------------------- exceções de capacidade

export interface ExcecaoLinha {
  data: string;
  janelaId: number;
  capacidade: number;
  horaInicio: string;
  horaFim: string;
  capacidadePadrao: number;
}

export function ExcecoesCapacidade({ excecoes, janelas, hoje }: { excecoes: ExcecaoLinha[]; janelas: JanelaOpcao[]; hoje: string }) {
  const [data, setData] = useState("");
  const [janelaId, setJanelaId] = useState("");
  const [capacidade, setCapacidade] = useState("0");
  const adicionar = useEnvio();
  const remover = useEnvio();
  const opcoes = data ? janelas.filter((j) => j.diaSemana === diaSemana(data)) : [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Troca a capacidade de uma janela em uma data específica (ex.: 0 para fechar a janela, ou um valor maior em dia de pico).
        Só valem datas a partir de hoje.
      </p>

      <form
        className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          void adicionar.enviar(() => salvarExcecao({ data, janelaId: Number(janelaId), capacidade: Number(capacidade) }));
        }}
      >
        <Campo rotulo="Data" erro={erroDe(adicionar.resultado, "data")}>
          <input
            type="date"
            min={hoje}
            className={campo}
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              setJanelaId("");
            }}
            required
          />
        </Campo>
        <Campo rotulo="Janela" erro={erroDe(adicionar.resultado, "janelaId")}>
          <select className={campo} value={janelaId} onChange={(e) => setJanelaId(e.target.value)} required disabled={!data}>
            <option value="">{data ? (opcoes.length ? "Selecione" : "Sem janelas nesse dia") : "Escolha a data"}</option>
            {opcoes.map((j) => (
              <option key={j.id} value={j.id}>
                {rotuloJanela(j)} (padrão {j.capacidade})
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Capacidade" erro={erroDe(adicionar.resultado, "capacidade")}>
          <input type="number" min={0} max={99} className={campo} value={capacidade} onChange={(e) => setCapacidade(e.target.value)} required />
        </Campo>
        <div className="flex items-end">
          <button type="submit" className={`${btnPrimario} w-full`} disabled={adicionar.pendente || !janelaId}>
            {adicionar.pendente ? "Salvando..." : "Salvar exceção"}
          </button>
        </div>
        <div className="sm:col-span-4">
          <Retorno resultado={adicionar.resultado} />
        </div>
      </form>

      <section className="space-y-2">
        <h3 className="font-semibold">Exceções cadastradas ({excecoes.length})</h3>
        {excecoes.length === 0 && <p className="text-sm text-slate-500">Nenhuma exceção futura.</p>}
        {excecoes.map((x) => (
          <div key={`${x.data}-${x.janelaId}`} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <span className="flex-1">
              <span className="font-semibold capitalize">
                {formatarDiaSemana(x.data)}, {formatarData(x.data)}
              </span>{" "}
              · {rotuloJanela(x)} · capacidade <strong>{x.capacidade}</strong>{" "}
              <span className="text-sm text-slate-500">(padrão {x.capacidadePadrao})</span>
            </span>
            <button
              type="button"
              className={btnPerigo}
              disabled={remover.pendente}
              onClick={() => void remover.enviar(() => removerExcecao({ data: x.data, janelaId: x.janelaId }))}
            >
              Remover
            </button>
          </div>
        ))}
        <Retorno resultado={remover.resultado} />
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- bloqueios

export interface BloqueioLinha {
  id: number;
  data: string;
  janelaId: number | null;
  motivo: string;
  horaInicio: string | null;
  horaFim: string | null;
}

export function Bloqueios({ bloqueios, janelas, hoje }: { bloqueios: BloqueioLinha[]; janelas: JanelaOpcao[]; hoje: string }) {
  const [data, setData] = useState("");
  const [janelaId, setJanelaId] = useState("");
  const [motivo, setMotivo] = useState("");
  const adicionar = useEnvio();
  const remover = useEnvio();
  const opcoes = data ? janelas.filter((j) => j.diaSemana === diaSemana(data)) : [];

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        Bloqueia um dia inteiro (feriado, inventário) ou uma janela. O cliente não consegue agendar; o painel só consegue forçando.
        Reservas que já existem não são canceladas.
      </p>

      <form
        className="grid gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void adicionar.enviar(() => criarBloqueio({ data, janelaId: janelaId === "" ? null : Number(janelaId), motivo })).then((r) => {
            if (r.ok) setMotivo("");
          });
        }}
      >
        <Campo rotulo="Data" erro={erroDe(adicionar.resultado, "data")}>
          <input
            type="date"
            min={hoje}
            className={campo}
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              setJanelaId("");
            }}
            required
          />
        </Campo>
        <Campo rotulo="Abrangência" erro={erroDe(adicionar.resultado, "janelaId")}>
          <select className={campo} value={janelaId} onChange={(e) => setJanelaId(e.target.value)} disabled={!data}>
            <option value="">Dia inteiro</option>
            {opcoes.map((j) => (
              <option key={j.id} value={j.id}>
                Só a janela {rotuloJanela(j)}
              </option>
            ))}
          </select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo rotulo="Motivo" erro={erroDe(adicionar.resultado, "motivo")}>
            <input className={campo} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={200} required />
          </Campo>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className={btnPrimario} disabled={adicionar.pendente}>
            {adicionar.pendente ? "Salvando..." : "Criar bloqueio"}
          </button>
        </div>
        <div className="sm:col-span-2">
          <Retorno resultado={adicionar.resultado} />
        </div>
      </form>

      <section className="space-y-2">
        <h3 className="font-semibold">Bloqueios cadastrados ({bloqueios.length})</h3>
        {bloqueios.length === 0 && <p className="text-sm text-slate-500">Nenhum bloqueio futuro.</p>}
        {bloqueios.map((b) => (
          <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <span className="flex-1">
              <span className="font-semibold capitalize">
                {formatarDiaSemana(b.data)}, {formatarData(b.data)}
              </span>{" "}
              · {b.horaInicio && b.horaFim ? `janela ${rotuloJanela({ horaInicio: b.horaInicio, horaFim: b.horaFim })}` : "dia inteiro"} ·{" "}
              <span className="text-slate-600">{b.motivo}</span>
            </span>
            <button
              type="button"
              className={btnPerigo}
              disabled={remover.pendente}
              onClick={() => void remover.enviar(() => removerBloqueio({ id: b.id }))}
            >
              Remover
            </button>
          </div>
        ))}
        <Retorno resultado={remover.resultado} />
      </section>
    </div>
  );
}
