import { describe, expect, it } from "vitest";
import { inspecionarImagem, LIMITES_IMAGEM, urlDaImagem, validarImagem } from "@/lib/imagem";

// ---- fixtures mínimas: só cabeçalhos válidos (o servidor lê assinatura e dimensões, não decodifica)
function png(largura: number, altura: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR
  new DataView(b.buffer).setUint32(16, largura);
  new DataView(b.buffer).setUint32(20, altura);
  return b;
}

function jpeg(largura: number, altura: number, comApp0 = true): Uint8Array {
  const partes: number[] = [0xff, 0xd8];
  if (comApp0) partes.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0); // APP0 (16 bytes)
  partes.push(0xff, 0xc0, 0x00, 0x11, 0x08, altura >> 8, altura & 0xff, largura >> 8, largura & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  return new Uint8Array(partes);
}

function webpVp8x(largura: number, altura: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x58, 10, 0, 0, 0]);
  const w = largura - 1;
  const h = altura - 1;
  b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  b.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return b;
}

function webpVp8l(largura: number, altura: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c, 5, 0, 0, 0, 0x2f]);
  const bits = ((largura - 1) & 0x3fff) | (((altura - 1) & 0x3fff) << 14);
  new DataView(b.buffer).setUint32(21, bits >>> 0, true);
  return b;
}

function webpVp8(largura: number, altura: number): Uint8Array {
  const b = new Uint8Array(32);
  b.set([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20, 10, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a]);
  new DataView(b.buffer).setUint16(26, largura, true);
  new DataView(b.buffer).setUint16(28, altura, true);
  return b;
}

const ascii = (s: string) => new TextEncoder().encode(s);

describe("inspecionarImagem: lê o formato real pela assinatura", () => {
  it("PNG", () => {
    expect(inspecionarImagem(png(640, 480))).toEqual({ tipoMime: "image/png", largura: 640, altura: 480 });
  });

  it("JPEG (com e sem APP0 antes do quadro)", () => {
    expect(inspecionarImagem(jpeg(800, 600))).toEqual({ tipoMime: "image/jpeg", largura: 800, altura: 600 });
    expect(inspecionarImagem(jpeg(320, 200, false))).toEqual({ tipoMime: "image/jpeg", largura: 320, altura: 200 });
  });

  it("WebP nos três formatos (VP8X, VP8L e VP8)", () => {
    expect(inspecionarImagem(webpVp8x(800, 450))).toEqual({ tipoMime: "image/webp", largura: 800, altura: 450 });
    expect(inspecionarImagem(webpVp8l(512, 384))).toEqual({ tipoMime: "image/webp", largura: 512, altura: 384 });
    expect(inspecionarImagem(webpVp8(300, 200))).toEqual({ tipoMime: "image/webp", largura: 300, altura: 200 });
  });
});

describe("inspecionarImagem: rejeita o que não é imagem aceita", () => {
  it("SVG, GIF, HTML e texto", () => {
    expect(inspecionarImagem(ascii('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"></svg>'))).toBeNull();
    expect(inspecionarImagem(ascii("GIF89a\x40\x00\x40\x00" + "\x00".repeat(30)))).toBeNull();
    expect(inspecionarImagem(ascii("<html><script>alert(1)</script></html>"))).toBeNull();
    expect(inspecionarImagem(ascii("não sou uma imagem, só um texto comprido de teste"))).toBeNull();
  });

  it("arquivo vazio, truncado ou com assinatura quebrada", () => {
    expect(inspecionarImagem(new Uint8Array(0))).toBeNull();
    expect(inspecionarImagem(png(10, 10).slice(0, 12))).toBeNull();
    expect(inspecionarImagem(jpeg(100, 100).slice(0, 8))).toBeNull();
    expect(inspecionarImagem(webpVp8x(100, 100).slice(0, 14))).toBeNull();
    const pngRuim = png(10, 10);
    pngRuim[12] = 0x58; // IHDR -> XHDR
    expect(inspecionarImagem(pngRuim)).toBeNull();
  });

  it("não se deixa enganar por extensão ou tipo informado: só vale a assinatura", () => {
    const svgDisfarcado = ascii('<svg onload="alert(1)"></svg>');
    expect(validarImagem(svgDisfarcado).ok).toBe(false);
  });
});

describe("validarImagem (regras do servidor)", () => {
  it("aceita uma imagem dentro dos limites", () => {
    expect(validarImagem(png(640, 480))).toMatchObject({ ok: true, tipoMime: "image/png", largura: 640, altura: 480, tamanho: 33 });
  });

  it("rejeita vazio", () => {
    const r = validarImagem(new Uint8Array(0));
    expect(r.ok).toBe(false);
  });

  it("rejeita acima de 500 KB, mesmo sendo uma imagem válida", () => {
    const grande = new Uint8Array(LIMITES_IMAGEM.maxBytes + 1);
    grande.set(png(640, 480));
    const r = validarImagem(grande);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("500 KB");
    const noLimite = new Uint8Array(LIMITES_IMAGEM.maxBytes);
    noLimite.set(png(640, 480));
    expect(validarImagem(noLimite).ok).toBe(true);
  });

  it("rejeita dimensões fora de 32–2000 px", () => {
    expect(validarImagem(png(31, 400)).ok).toBe(false);
    expect(validarImagem(png(400, 20)).ok).toBe(false);
    expect(validarImagem(png(2001, 400)).ok).toBe(false);
    expect(validarImagem(png(32, 32)).ok).toBe(true);
    expect(validarImagem(png(2000, 2000)).ok).toBe(true);
  });

  it("rejeita formato desconhecido com mensagem clara", () => {
    const r = validarImagem(ascii("GIF89a" + "x".repeat(40)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toMatch(/PNG, JPG ou WebP/);
  });
});

describe("urlDaImagem", () => {
  it("monta a rota pública com o hash como versão", () => {
    expect(urlDaImagem("porte", "TOCO", "a".repeat(64))).toBe(`/imagens/porte/TOCO?v=${"a".repeat(16)}`);
    expect(urlDaImagem("material", "ESCORAS", "0123456789abcdef0000")).toBe("/imagens/material/ESCORAS?v=0123456789abcdef");
  });
});
