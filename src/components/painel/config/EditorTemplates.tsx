"use client";

import { useRef, useState } from "react";
import { salvarTemplate } from "@/app/painel/actions/config";
import { TIPOS_TEMPLATE, type Marca, type Regras, type Templates } from "@/lib/config-schemas";
import { somarDias } from "@/lib/datas";
import {
  DESCRICAO_VARIAVEL,
  montarVariaveis,
  renderizar,
  ROTULO_TEMPLATE,
  variaveisDesconhecidas,
  VARIAVEIS,
} from "@/lib/templates";
import { btnPrimario, campo, Retorno, useEnvio } from "./ui";

interface Props {
  templates: Templates;
  marca: Marca;
  regras: Regras;
  hoje: string;
  appUrl: string;
}

export function EditorTemplates({ templates, marca, regras, hoje, appUrl }: Props) {
  const [chave, setChave] = useState<keyof Templates>("confirmacao");
  const [edicoes, setEdicoes] = useState<Partial<Templates>>({});
  const area = useRef<HTMLTextAreaElement>(null);
  const { pendente, resultado, enviar, limpar } = useEnvio();

  const salvo = templates[chave];
  const texto = edicoes[chave] ?? salvo;
  const sujo = texto !== salvo;
  const desconhecidas = variaveisDesconhecidas(texto);

  // dados de exemplo para a pré-visualização
  const exemplo = montarVariaveis({
    agendamento: {
      nome: "Carlos Silva",
      empresa: "Construtora Exemplo",
      protocolo: "DEV-2611-0001",
      data: somarDias(hoje, 10),
      token: "x".repeat(32),
      motivo: "Motivo de exemplo",
    },
    janela: { horaInicio: "08:00", horaFim: "09:00" },
    porteNome: "Toco",
    materiaisNomes: ["Escoras", "Formas"],
    anterior: { data: somarDias(hoje, 8), horaInicio: "14:00", horaFim: "15:00" },
    marca,
    regras,
    appUrl,
  });
  const previa = renderizar(texto, exemplo);

  function mudarTexto(valor: string) {
    setEdicoes((a) => ({ ...a, [chave]: valor }));
    limpar();
  }

  function inserirVariavel(nome: string) {
    const el = area.current;
    const inserido = `{${nome}}`;
    if (!el) return mudarTexto(texto + inserido);
    const ini = el.selectionStart;
    const fim = el.selectionEnd;
    mudarTexto(texto.slice(0, ini) + inserido + texto.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + inserido.length, ini + inserido.length);
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Edite os textos enviados por WhatsApp. Clique numa variável para inseri-la no cursor. A pré-visualização usa dados de
        exemplo.
      </p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Templates">
        {TIPOS_TEMPLATE.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={chave === k}
            onClick={() => {
              setChave(k);
              limpar();
            }}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              chave === k ? "bg-primaria text-white" : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            {ROTULO_TEMPLATE[k]}
            {edicoes[k] !== undefined && edicoes[k] !== templates[k] ? " •" : ""}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <textarea
            ref={area}
            aria-label={`Texto do template ${ROTULO_TEMPLATE[chave]}`}
            className={`${campo} h-80 font-mono text-sm`}
            value={texto}
            onChange={(e) => mudarTexto(e.target.value)}
            maxLength={4000}
          />
          {desconhecidas.length > 0 && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
              Variável desconhecida: {desconhecidas.map((v) => `{${v}}`).join(", ")}. Use só as da lista abaixo.
            </p>
          )}
          <Retorno resultado={resultado} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimario}
              disabled={pendente || !sujo || desconhecidas.length > 0 || texto.trim() === ""}
              onClick={() =>
                void enviar(() => salvarTemplate({ chave, texto })).then((r) => {
                  if (r.ok) setEdicoes((a) => ({ ...a, [chave]: undefined }));
                })
              }
            >
              {pendente ? "Salvando..." : "Salvar template"}
            </button>
            {sujo && (
              <button
                type="button"
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700"
                onClick={() => setEdicoes((a) => ({ ...a, [chave]: undefined }))}
              >
                Descartar alterações
              </button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">Pré-visualização</h3>
          <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-green-100 p-4 text-sm text-slate-900 shadow-sm">{previa}</div>
        </div>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-700">Variáveis disponíveis</h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {VARIAVEIS.map((nome) => (
            <li key={nome}>
              <button
                type="button"
                onClick={() => inserirVariavel(nome)}
                className="flex w-full flex-col rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-primaria"
              >
                <span className="font-mono text-sm text-primaria">{`{${nome}}`}</span>
                <span className="text-xs text-slate-600">{DESCRICAO_VARIAVEL[nome]}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
