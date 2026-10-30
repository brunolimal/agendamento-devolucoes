"use client";

import { useState } from "react";
import { salvarMaterial, salvarPorte } from "@/app/painel/actions/config";
import { btnPrimario, campo, Campo, erroDe, Retorno, useEnvio } from "./ui";
import { UploadImagem } from "./UploadImagem";

export interface PorteLinha {
  codigo: string;
  nome: string;
  descricao: string | null;
  imagemUrl: string | null;
  pesoVagas: number;
  ordem: number;
  ativo: boolean;
}

export function EditorPortes({ portes }: { portes: PorteLinha[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Edite nome, descrição, peso (quantas vagas o caminhão ocupa) e ordem, ou desative. Envie uma imagem para o cliente ver e
        escolher; sem imagem, vale o ícone padrão. O peso novo vale só para agendamentos novos. Não é possível criar portes.
      </p>
      {portes.map((p) => (
        <LinhaPorte key={`${p.codigo}:${JSON.stringify(p)}`} inicial={p} />
      ))}
    </div>
  );
}

function LinhaPorte({ inicial }: { inicial: PorteLinha }) {
  const [v, setV] = useState({
    nome: inicial.nome,
    descricao: inicial.descricao ?? "",
    pesoVagas: String(inicial.pesoVagas),
    ordem: String(inicial.ordem),
    ativo: inicial.ativo,
  });
  const { pendente, resultado, enviar } = useEnvio();

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <form
      className="grid gap-3 sm:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar(() =>
          salvarPorte({
            codigo: inicial.codigo,
            nome: v.nome,
            descricao: v.descricao,
            pesoVagas: v.pesoVagas === "" ? undefined : Number(v.pesoVagas),
            ordem: v.ordem === "" ? undefined : Number(v.ordem),
            ativo: v.ativo,
          }),
        );
      }}
    >
      <p className="text-xs font-mono text-slate-500 sm:col-span-6">{inicial.codigo}</p>
      <div className="sm:col-span-2">
        <Campo rotulo="Nome" erro={erroDe(resultado, "nome")}>
          <input className={campo} value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} maxLength={40} />
        </Campo>
      </div>
      <div className="sm:col-span-4">
        <Campo rotulo="Descrição curta" erro={erroDe(resultado, "descricao")}>
          <input className={campo} value={v.descricao} onChange={(e) => setV({ ...v, descricao: e.target.value })} maxLength={200} />
        </Campo>
      </div>
      <Campo rotulo="Peso (vagas)" erro={erroDe(resultado, "pesoVagas")}>
        <input type="number" min={1} max={4} className={campo} value={v.pesoVagas} onChange={(e) => setV({ ...v, pesoVagas: e.target.value })} />
      </Campo>
      <Campo rotulo="Ordem" erro={erroDe(resultado, "ordem")}>
        <input type="number" min={0} max={99} className={campo} value={v.ordem} onChange={(e) => setV({ ...v, ordem: e.target.value })} />
      </Campo>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} />
        Ativo
      </label>
      <div className="space-y-2 sm:col-span-6">
        <Retorno resultado={resultado} />
        <button type="submit" disabled={pendente} className={btnPrimario}>
          {pendente ? "Salvando..." : "Salvar porte"}
        </button>
      </div>
    </form>
    <UploadImagem tipo="porte" codigo={inicial.codigo} nome={inicial.nome} imagemUrl={inicial.imagemUrl} />
    </div>
  );
}

export interface MaterialLinha {
  codigo: string;
  nome: string;
  imagemUrl: string | null;
  ordem: number;
  ativo: boolean;
}

export function EditorMateriais({ materiais }: { materiais: MaterialLinha[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Edite nome e ordem, ou desative. Envie uma imagem para o cliente ver e escolher; sem imagem, vale o ícone padrão. Não é possível criar materiais.</p>
      {materiais.map((m) => (
        <LinhaMaterial key={`${m.codigo}:${JSON.stringify(m)}`} inicial={m} />
      ))}
    </div>
  );
}

function LinhaMaterial({ inicial }: { inicial: MaterialLinha }) {
  const [v, setV] = useState({ nome: inicial.nome, ordem: String(inicial.ordem), ativo: inicial.ativo });
  const { pendente, resultado, enviar } = useEnvio();

  return (
    <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
    <form
      className="grid items-end gap-3 sm:grid-cols-[1fr_6rem_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        void enviar(() =>
          salvarMaterial({ codigo: inicial.codigo, nome: v.nome, ordem: v.ordem === "" ? undefined : Number(v.ordem), ativo: v.ativo }),
        );
      }}
    >
      <Campo rotulo={inicial.codigo} erro={erroDe(resultado, "nome")}>
        <input className={campo} value={v.nome} onChange={(e) => setV({ ...v, nome: e.target.value })} maxLength={40} />
      </Campo>
      <Campo rotulo="Ordem" erro={erroDe(resultado, "ordem")}>
        <input type="number" min={0} max={99} className={campo} value={v.ordem} onChange={(e) => setV({ ...v, ordem: e.target.value })} />
      </Campo>
      <label className="flex items-center gap-2 pb-2 text-sm">
        <input type="checkbox" checked={v.ativo} onChange={(e) => setV({ ...v, ativo: e.target.checked })} />
        Ativo
      </label>
      <button type="submit" disabled={pendente} className={btnPrimario}>
        {pendente ? "Salvando..." : "Salvar"}
      </button>
      <div className="sm:col-span-4">
        <Retorno resultado={resultado} />
      </div>
    </form>
    <UploadImagem tipo="material" codigo={inicial.codigo} nome={inicial.nome} imagemUrl={inicial.imagemUrl} />
    </div>
  );
}
