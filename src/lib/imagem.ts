// Validação de imagens enviadas pelo painel (SPEC §10). Pura: sem Node, para valer também no navegador.
// O servidor NÃO confia no tipo informado pelo cliente: lê a assinatura dos bytes e as dimensões do cabeçalho.

export const LIMITES_IMAGEM = {
  /** Depois da redução feita no navegador. */
  maxBytes: 500 * 1024,
  /** Arquivo original aceito no seletor (antes de reduzir). */
  maxOriginalBytes: 5 * 1024 * 1024,
  /** O navegador reduz o lado maior a este valor. */
  ladoEnvio: 800,
  minLado: 32,
  maxLado: 2000,
} as const;

export type TipoMime = "image/png" | "image/jpeg" | "image/webp";
export const TIPOS_MIME_ACEITOS: readonly TipoMime[] = ["image/png", "image/jpeg", "image/webp"];

export type TipoImagem = "porte" | "material";
export const TIPOS_IMAGEM: readonly TipoImagem[] = ["porte", "material"];
export const CODIGO_REGEX = /^[A-Z0-9_]{1,40}$/;

export interface ImagemInspecionada {
  tipoMime: TipoMime;
  largura: number;
  altura: number;
}

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u32le = (b: Uint8Array, i: number) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const texto = (b: Uint8Array, i: number, n: number) => String.fromCharCode(...b.slice(i, i + n));

function inspecionarPng(b: Uint8Array): ImagemInspecionada | null {
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || !assinatura.every((v, i) => b[i] === v)) return null;
  if (u32be(b, 8) !== 13 || texto(b, 12, 4) !== "IHDR") return null;
  return { tipoMime: "image/png", largura: u32be(b, 16), altura: u32be(b, 20) };
}

function inspecionarJpeg(b: Uint8Array): ImagemInspecionada | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    while (b[i] === 0xff && i < b.length) i++; // bytes de preenchimento
    const marcador = b[i];
    i++;
    if (marcador === 0xd9 || marcador === 0xda) return null; // fim/dados da imagem sem achar o quadro
    if (marcador === 0x01 || (marcador >= 0xd0 && marcador <= 0xd7)) continue; // sem tamanho
    if (i + 1 >= b.length) return null;
    const tamanho = u16be(b, i);
    const ehQuadro = marcador >= 0xc0 && marcador <= 0xcf && marcador !== 0xc4 && marcador !== 0xc8 && marcador !== 0xcc;
    if (ehQuadro) {
      if (i + 7 >= b.length) return null;
      return { tipoMime: "image/jpeg", altura: u16be(b, i + 3), largura: u16be(b, i + 5) };
    }
    if (tamanho < 2) return null;
    i += tamanho;
  }
  return null;
}

function inspecionarWebp(b: Uint8Array): ImagemInspecionada | null {
  if (b.length < 30 || texto(b, 0, 4) !== "RIFF" || texto(b, 8, 4) !== "WEBP") return null;
  const tipo = texto(b, 12, 4);
  if (tipo === "VP8X") {
    return { tipoMime: "image/webp", largura: u24le(b, 24) + 1, altura: u24le(b, 27) + 1 };
  }
  if (tipo === "VP8L") {
    if (b[20] !== 0x2f) return null;
    const bits = u32le(b, 21);
    return { tipoMime: "image/webp", largura: (bits & 0x3fff) + 1, altura: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (tipo === "VP8 ") {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { tipoMime: "image/webp", largura: u16le(b, 26) & 0x3fff, altura: u16le(b, 28) & 0x3fff };
  }
  return null;
}

/** Detecta o formato pela assinatura dos bytes e lê as dimensões. `null` se não for PNG, JPEG ou WebP válido. */
export function inspecionarImagem(bytes: Uint8Array): ImagemInspecionada | null {
  return inspecionarPng(bytes) ?? inspecionarJpeg(bytes) ?? inspecionarWebp(bytes);
}

export type ResultadoValidacaoImagem = ({ ok: true } & ImagemInspecionada & { tamanho: number }) | { ok: false; erro: string };

/** Regras do servidor: tamanho, formato real e dimensões. */
export function validarImagem(bytes: Uint8Array): ResultadoValidacaoImagem {
  if (bytes.length === 0) return { ok: false, erro: "O arquivo está vazio." };
  if (bytes.length > LIMITES_IMAGEM.maxBytes) {
    return { ok: false, erro: `A imagem tem mais de ${LIMITES_IMAGEM.maxBytes / 1024} KB depois de reduzida. Use uma imagem mais simples.` };
  }
  const info = inspecionarImagem(bytes);
  if (!info) return { ok: false, erro: "Formato não aceito. Envie uma imagem PNG, JPG ou WebP." };
  const { largura, altura } = info;
  if (Math.min(largura, altura) < LIMITES_IMAGEM.minLado) {
    return { ok: false, erro: `A imagem é pequena demais (mínimo ${LIMITES_IMAGEM.minLado} px de lado).` };
  }
  if (Math.max(largura, altura) > LIMITES_IMAGEM.maxLado) {
    return { ok: false, erro: `A imagem é grande demais (máximo ${LIMITES_IMAGEM.maxLado} px de lado).` };
  }
  return { ok: true, ...info, tamanho: bytes.length };
}

/** URL pública de uma imagem; `?v=` carrega o hash para o cache imutável. */
export function urlDaImagem(tipo: TipoImagem, codigo: string, hash: string): string {
  return `/imagens/${tipo}/${codigo}?v=${hash.slice(0, 16)}`;
}
