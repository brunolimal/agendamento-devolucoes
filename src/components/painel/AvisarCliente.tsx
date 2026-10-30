"use client";

import { useEffect, useState } from "react";
import { prepararMensagem, registrarEnvio, type PreparoMensagem } from "@/app/painel/actions/mensagens";
import { formatarDiaMesHora } from "@/lib/datas";
import { ROTULO_TIPO, type TipoMensagem } from "@/lib/templates";

interface Props {
  id: string;
  tipo: TipoMensagem;
  onFechar: () => void;
}

/** Painel lateral "Avisar o cliente" (SPEC §10, padrão pós-ação). */
export function AvisarCliente({ id, tipo, onFechar }: Props) {
  const chave = `${id}|${tipo}`;
  const [preparo, setPreparo] = useState<{ chave: string; r: PreparoMensagem } | null>(null);
  const [edicao, setEdicao] = useState<{ chave: string; valor: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviadaAgora, setEnviadaAgora] = useState<string | null>(null);
  const [linkManual, setLinkManual] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    prepararMensagem({ id, tipo }).then((r) => {
      if (ativo) setPreparo({ chave, r });
    });
    return () => {
      ativo = false;
    };
  }, [id, tipo, chave]);

  const carregado = preparo?.chave === chave ? preparo.r : null;
  const dados = carregado?.ok ? carregado : null;
  const texto = edicao?.chave === chave ? edicao.valor : (dados?.texto ?? "");
  const enviadaEm = enviadaAgora ?? dados?.enviadaEm ?? null;
  const pendentes = [...new Set([...texto.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];

  async function enviar() {
    // A aba é aberta já no clique (antes do await) para o navegador não bloquear o pop-up.
    const aba = window.open("", "_blank");
    if (aba) aba.opener = null;
    setEnviando(true);
    setErro(null);
    const r = await registrarEnvio({ id, tipo, texto }); // RN-12: grava antes de abrir o WhatsApp
    setEnviando(false);
    if (!r.ok) {
      aba?.close();
      setErro(r.erro);
      return;
    }
    if (aba) aba.location.href = r.link;
    else setLinkManual(r.link);
    setEnviadaAgora(r.enviadoEm); // a tela só é atualizada ao fechar o painel
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Avisar o cliente">
      <button type="button" aria-label="Fechar" onClick={onFechar} className="absolute inset-0 bg-black/40" />
      <aside className="absolute inset-x-0 bottom-0 max-h-[92vh] space-y-4 overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[28rem] sm:rounded-none">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Avisar o cliente</h2>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="text-2xl leading-none text-slate-500">
            ×
          </button>
        </div>

        {!carregado && <p className="text-sm text-slate-500">Preparando a mensagem...</p>}
        {carregado && !carregado.ok && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            {carregado.erro}
          </p>
        )}

        {dados && (
          <>
            <p className="text-sm text-slate-600">
              <span className="font-semibold">{ROTULO_TIPO[tipo]}</span> para {dados.nome} · {dados.telefone}
            </p>
            <textarea
              aria-label="Texto da mensagem"
              className="h-72 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/30"
              value={texto}
              onChange={(e) => setEdicao({ chave, valor: e.target.value })}
              placeholder={tipo === "LIVRE" ? "Escreva a mensagem" : undefined}
            />
            {pendentes.length > 0 && (
              <p className="rounded-lg bg-yellow-50 p-3 text-sm text-yellow-900 ring-1 ring-yellow-200">
                Ainda há campos sem valor no texto: {pendentes.map((v) => `{${v}}`).join(", ")}. Ajuste antes de enviar.
              </p>
            )}
            {erro && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
                {erro}
              </p>
            )}
            {enviadaEm && (
              <p className="text-sm font-medium text-green-800">
                Enviada em {formatarDiaMesHora(new Date(enviadaEm))} · Reenviar
              </p>
            )}
            {linkManual && (
              <a
                href={linkManual}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-primaria px-4 py-3 text-center font-semibold text-primaria"
              >
                Abrir WhatsApp
              </a>
            )}
            <div className="space-y-2">
              <button
                type="button"
                onClick={enviar}
                disabled={enviando || texto.trim() === ""}
                className="w-full rounded-xl bg-primaria px-5 py-3 text-base font-semibold text-white disabled:opacity-50"
              >
                {enviando ? "Registrando..." : enviadaEm ? "Reenviar no WhatsApp" : "Enviar no WhatsApp"}
              </button>
              <button type="button" onClick={onFechar} className="block w-full text-center text-sm text-slate-500 underline">
                {enviadaEm ? "Fechar" : "Não enviar agora"}
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
