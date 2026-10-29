import { describe, expect, it } from "vitest";
import { mascararEntrada, mascararParaExibir, normalizarTelefone } from "@/lib/telefone";
import { linkLogistica, linkWhatsapp } from "@/lib/whatsapp";

describe("RN-17: telefone", () => {
  it("guarda só dígitos e prefixa 55 quando tem 10 ou 11 dígitos", () => {
    expect(normalizarTelefone("(11) 98888-7777")).toBe("5511988887777");
    expect(normalizarTelefone("11 3888-7777")).toBe("551138887777");
  });

  it("aceita número que já vem com DDI (12 e 13 dígitos)", () => {
    expect(normalizarTelefone("+55 11 98888-7777")).toBe("5511988887777");
    expect(normalizarTelefone("551138887777")).toBe("551138887777");
  });

  it("rejeita fora de 12–13 dígitos", () => {
    expect(normalizarTelefone("98888-7777")).toBeNull(); // 9 dígitos
    expect(normalizarTelefone("")).toBeNull();
    expect(normalizarTelefone("55119888877778")).toBeNull(); // 14 dígitos
  });

  it("aplica máscara de digitação BR", () => {
    expect(mascararEntrada("11988887777")).toBe("(11) 98888-7777");
    expect(mascararEntrada("1138887777")).toBe("(11) 3888-7777");
    expect(mascararEntrada("119")).toBe("(11) 9");
    expect(mascararEntrada("5511988887777")).toBe("(11) 98888-7777");
  });

  it("mascara para exibição pública", () => {
    expect(mascararParaExibir("5511988887777")).toBe("+55 (11) *****-7777");
    expect(mascararParaExibir("123")).toBe("***");
  });
});

describe("whatsapp: links wa.me", () => {
  it("codifica o texto", () => {
    expect(linkWhatsapp("5511988887777", "Olá, tudo bem?\nok")).toBe(
      "https://wa.me/5511988887777?text=Ol%C3%A1%2C%20tudo%20bem%3F%0Aok",
    );
  });

  it("limpa o número e monta o link da logística", () => {
    const l = linkLogistica("+55 (11) 90000-0000", "DEV-2603-0001");
    expect(l.startsWith("https://wa.me/5511900000000?text=")).toBe(true);
    expect(decodeURIComponent(l.split("text=")[1])).toBe("Olá! Sobre o agendamento DEV-2603-0001: ");
  });
});
