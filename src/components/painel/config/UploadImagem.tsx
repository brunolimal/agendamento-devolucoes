"use client";

import { useEffect, useRef, useState } from "react";
import { enviarImagem, removerImagem } from "@/app/painel/actions/config";
import { ImagemCatalogo } from "@/components/ui/ImagemCatalogo";
import { LIMITES_IMAGEM, type TipoImagem } from "@/lib/imagem";
import { btnNeutro, btnPerigo, btnPrimario, Retorno, useEnvio } from "./ui";

interface Props {
  tipo: TipoImagem;
  codigo: string;
  nome: string;
  /** Imagem atual (rota /imagens/...), ou null para o ícone padrão. */
  imagemUrl: string | null;
}

interface Preparada {
  blob: Blob;
  url: string;
  largura: number;
  altura: number;
}

const ACEITOS = ["image/png", "image/jpeg", "image/webp"];

function desenhar(bitmap: ImageBitmap, escala: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * escala));
  canvas.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não conseguiu preparar a imagem.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, qualidade));
}

/**
 * Reduz no navegador (sem biblioteca): lado maior até 800 px, recodificado em WebP (mantém transparência).
 * Se o resultado passar de 500 KB, tenta qualidade menor e depois uma escala menor.
 */
async function prepararImagem(arquivo: File): Promise<Preparada> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("Não foi possível ler essa imagem.");
  });
  const escalaBase = Math.min(1, LIMITES_IMAGEM.ladoEnvio / Math.max(bitmap.width, bitmap.height));
  const tentativas: [number, number][] = [
    [1, 0.85],
    [1, 0.7],
    [1, 0.55],
    [0.75, 0.7],
    [0.5, 0.7],
  ];

  for (const [fator, qualidade] of tentativas) {
    const canvas = desenhar(bitmap, escalaBase * fator);
    let blob = await paraBlob(canvas, "image/webp", qualidade);
    // sem suporte a WebP no canvas: PNG para PNG/WebP de origem, JPEG para JPEG
    if (!blob || blob.type !== "image/webp") {
      blob = arquivo.type === "image/jpeg" ? await paraBlob(canvas, "image/jpeg", qualidade) : await paraBlob(canvas, "image/png");
    }
    if (blob && blob.size <= LIMITES_IMAGEM.maxBytes) {
      bitmap.close();
      return { blob, url: URL.createObjectURL(blob), largura: canvas.width, altura: canvas.height };
    }
  }
  bitmap.close();
  throw new Error(`Não foi possível reduzir a imagem para menos de ${LIMITES_IMAGEM.maxBytes / 1024} KB. Use uma imagem mais simples.`);
}

export function UploadImagem({ tipo, codigo, nome, imagemUrl }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [preparada, setPreparada] = useState<Preparada | null>(null);
  const [processando, setProcessando] = useState(false);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const envio = useEnvio();
  const remocao = useEnvio();

  // libera a URL temporária da prévia quando ela é trocada ou o componente sai da tela
  useEffect(() => {
    const url = preparada?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [preparada]);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    setErroLocal(null);
    setPreparada(null);
    envio.limpar();
    if (!arquivo) return;
    if (!ACEITOS.includes(arquivo.type)) {
      setErroLocal("Formato não aceito. Envie uma imagem PNG, JPG ou WebP.");
      return;
    }
    if (arquivo.size > LIMITES_IMAGEM.maxOriginalBytes) {
      setErroLocal(`O arquivo tem mais de ${LIMITES_IMAGEM.maxOriginalBytes / 1024 / 1024} MB. Escolha um menor.`);
      return;
    }
    setProcessando(true);
    try {
      setPreparada(await prepararImagem(arquivo));
    } catch (err) {
      setErroLocal(err instanceof Error ? err.message : "Não foi possível preparar a imagem.");
    } finally {
      setProcessando(false);
    }
  }

  async function enviarPreparada() {
    if (!preparada) return;
    const dados = new FormData();
    dados.set("tipo", tipo);
    dados.set("codigo", codigo);
    dados.set("arquivo", new File([preparada.blob], `${codigo.toLowerCase()}.${preparada.blob.type.split("/")[1]}`, { type: preparada.blob.type }));
    const r = await envio.enviar(() => enviarImagem(dados));
    if (r.ok) {
      setPreparada(null);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
      <p className="text-sm font-medium text-slate-700">Imagem para o cliente</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
          {preparada ? (
            <ImagemCatalogo src={preparada.url} alt={`Prévia de ${nome}`} className="h-full w-full object-contain" />
          ) : imagemUrl ? (
            <ImagemCatalogo src={imagemUrl} alt={`Imagem de ${nome}`} className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-slate-500">Sem imagem: o cliente vê o ícone padrão</span>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label={`Escolher imagem de ${nome}`}
            onChange={aoEscolher}
            disabled={processando || envio.pendente}
            className="block text-sm file:mr-3 file:rounded-lg file:border file:border-slate-300 file:bg-white file:px-3 file:py-2 file:font-semibold file:text-slate-700"
          />
          <p className="text-xs text-slate-500">
            PNG, JPG ou WebP, até {LIMITES_IMAGEM.maxOriginalBytes / 1024 / 1024} MB. A imagem é reduzida para até {LIMITES_IMAGEM.ladoEnvio} px antes de enviar.
          </p>
          <div className="flex flex-wrap gap-2">
            {preparada && (
              <button type="button" className={btnPrimario} disabled={envio.pendente} onClick={() => void enviarPreparada()}>
                {envio.pendente ? "Enviando..." : "Enviar imagem"}
              </button>
            )}
            {imagemUrl && !preparada && (
              <button
                type="button"
                className={btnPerigo}
                disabled={remocao.pendente}
                onClick={() => {
                  if (window.confirm(`Remover a imagem de ${nome}? O cliente volta a ver o ícone padrão.`)) {
                    void remocao.enviar(() => removerImagem({ tipo, codigo }));
                  }
                }}
              >
                {remocao.pendente ? "Removendo..." : "Remover imagem"}
              </button>
            )}
            {preparada && (
              <button
                type="button"
                className={btnNeutro}
                onClick={() => {
                  setPreparada(null);
                  if (entrada.current) entrada.current.value = "";
                }}
              >
                Cancelar
              </button>
            )}
          </div>
          {processando && <p className="text-sm text-slate-500">Reduzindo a imagem...</p>}
          {preparada && (
            <p className="text-xs text-slate-500">
              Pronta para enviar: {preparada.largura}×{preparada.altura} px, {Math.max(1, Math.round(preparada.blob.size / 1024))} KB.
            </p>
          )}
        </div>
      </div>
      {erroLocal && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {erroLocal}
        </p>
      )}
      <Retorno resultado={envio.resultado} />
      <Retorno resultado={remocao.resultado} />
    </div>
  );
}
