"use client";

import { useState } from "react";
import { salvarMarca, salvarRegras } from "@/app/painel/actions/config";
import type { Marca, Regras } from "@/lib/config";
import { btnPrimario, campo, Campo, erroDe, Retorno, useEnvio } from "./ui";

export function FormMarca({ marca }: { marca: Marca }) {
  const [v, setV] = useState({ ...marca, logo_url: marca.logo_url ?? "" });
  const { pendente, resultado, enviar } = useEnvio();
  const set = <K extends keyof typeof v>(chave: K, valor: (typeof v)[K]) => setV((a) => ({ ...a, [chave]: valor }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar(() => salvarMarca(v));
      }}
    >
      <Campo rotulo="Nome da empresa" erro={erroDe(resultado, "nome")}>
        <input className={campo} value={v.nome} onChange={(e) => set("nome", e.target.value)} maxLength={80} />
      </Campo>
      <Campo rotulo="Logo (endereço da imagem)" dica="Opcional. Use um link https://… de uma imagem." erro={erroDe(resultado, "logo_url")}>
        <input className={campo} value={v.logo_url} onChange={(e) => set("logo_url", e.target.value)} placeholder="https://" />
      </Campo>
      <Campo rotulo="Cor primária" dica="Aplicada nos botões e destaques do site." erro={erroDe(resultado, "cor_primaria")}>
        <span className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Escolher cor"
            value={/^#[0-9a-fA-F]{6}$/.test(v.cor_primaria) ? v.cor_primaria : "#000000"}
            onChange={(e) => set("cor_primaria", e.target.value)}
            className="h-10 w-14 rounded border border-slate-300"
          />
          <input className={campo} value={v.cor_primaria} onChange={(e) => set("cor_primaria", e.target.value)} maxLength={7} />
        </span>
      </Campo>
      <Campo
        rotulo="WhatsApp da empresa"
        dica="DDD + número (o 55 é adicionado). É para onde vai o botão “Falar com a logística”."
        erro={erroDe(resultado, "whatsapp_empresa")}
      >
        <input className={campo} value={v.whatsapp_empresa} onChange={(e) => set("whatsapp_empresa", e.target.value)} inputMode="tel" />
      </Campo>
      <Campo rotulo="Endereço do pátio" erro={erroDe(resultado, "endereco_patio")}>
        <input className={campo} value={v.endereco_patio} onChange={(e) => set("endereco_patio", e.target.value)} maxLength={200} />
      </Campo>
      <Campo rotulo="Link do mapa" dica="Opcional. Aparece nas mensagens." erro={erroDe(resultado, "link_maps")}>
        <input className={campo} value={v.link_maps} onChange={(e) => set("link_maps", e.target.value)} placeholder="https://" />
      </Campo>
      <Campo rotulo="Texto de boas-vindas" erro={erroDe(resultado, "texto_boas_vindas")}>
        <textarea className={campo} rows={3} value={v.texto_boas_vindas} onChange={(e) => set("texto_boas_vindas", e.target.value)} maxLength={500} />
      </Campo>
      <Campo rotulo="Regras de aceite (passo final do cliente)" erro={erroDe(resultado, "regras_aceite")}>
        <textarea className={campo} rows={4} value={v.regras_aceite} onChange={(e) => set("regras_aceite", e.target.value)} maxLength={2000} />
      </Campo>
      <Retorno resultado={resultado} />
      <button type="submit" disabled={pendente} className={btnPrimario}>
        {pendente ? "Salvando..." : "Salvar marca"}
      </button>
    </form>
  );
}

const CAMPOS_REGRAS: { chave: keyof Regras; rotulo: string; dica: string }[] = [
  { chave: "antecedencia_min_dias", rotulo: "Antecedência mínima (dias)", dica: "O cliente só vê datas a partir de hoje + este número (RN-01)." },
  { chave: "antecedencia_max_dias", rotulo: "Antecedência máxima (dias)", dica: "O cliente só vê datas até hoje + este número (RN-01)." },
  { chave: "prazo_cancel_dias", rotulo: "Prazo para o cliente cancelar (dias antes)", dica: "Depois disso, só pelo WhatsApp da logística (RN-08)." },
  { chave: "sla_decisao_dias", rotulo: "Prazo de decisão (dias antes)", dica: "Solicitações sem resposta até data − este número aparecem como vencidas (RN-06)." },
  { chave: "dias_lembrete", rotulo: "Lembrete (dias antes)", dica: "Define quais agendamentos entram na tela de lembretes (RN-13)." },
];

export function FormRegras({ regras }: { regras: Regras }) {
  const [v, setV] = useState<Record<keyof Regras, string>>({
    antecedencia_min_dias: String(regras.antecedencia_min_dias),
    antecedencia_max_dias: String(regras.antecedencia_max_dias),
    prazo_cancel_dias: String(regras.prazo_cancel_dias),
    sla_decisao_dias: String(regras.sla_decisao_dias),
    dias_lembrete: String(regras.dias_lembrete),
  });
  const { pendente, resultado, enviar } = useEnvio();

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const numeros = Object.fromEntries(Object.entries(v).map(([k, s]) => [k, s.trim() === "" ? undefined : Number(s)]));
        void enviar(() => salvarRegras(numeros));
      }}
    >
      {CAMPOS_REGRAS.map((c) => (
        <Campo key={c.chave} rotulo={c.rotulo} dica={c.dica} erro={erroDe(resultado, c.chave)}>
          <input
            type="number"
            min={0}
            className={campo}
            value={v[c.chave]}
            onChange={(e) => setV((a) => ({ ...a, [c.chave]: e.target.value }))}
          />
        </Campo>
      ))}
      <Retorno resultado={resultado} />
      <button type="submit" disabled={pendente} className={btnPrimario}>
        {pendente ? "Salvando..." : "Salvar regras"}
      </button>
    </form>
  );
}
