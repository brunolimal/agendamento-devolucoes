import { beforeEach, describe, expect, it } from "vitest";
import { codigoDoErro, mensagemDoErro } from "@/lib/transacao";
import { assinarInicio, excedeuLimite, extrairIp, hashIp, LIMITES, validarInicio } from "@/lib/rate-limit";
import { assinarSessao, verificarSessao } from "@/lib/sessao";

const SEGREDO = "x".repeat(40);

beforeEach(() => {
  process.env.SESSION_SECRET = SEGREDO;
});

describe("sessão (jose, HS256)", () => {
  it("aceita um token assinado e rejeita lixo, ausência e outro segredo", async () => {
    const token = await assinarSessao();
    expect(await verificarSessao(token)).toBe(true);
    expect(await verificarSessao(undefined)).toBe(false);
    expect(await verificarSessao("abc.def.ghi")).toBe(false);

    process.env.SESSION_SECRET = "y".repeat(40);
    expect(await verificarSessao(token)).toBe(false);
  });

  it("recusa segredo com menos de 32 caracteres", async () => {
    process.env.SESSION_SECRET = "curto";
    await expect(assinarSessao()).rejects.toThrow();
    expect(await verificarSessao("qualquer")).toBe(false);
  });
});

describe("rate limit", () => {
  it("usa os limites da SPEC", () => {
    expect(LIMITES.envioPublico).toMatchObject({ max: 10, minutos: 60 });
    expect(LIMITES.login).toMatchObject({ max: 5, minutos: 15 });
  });

  it("bloqueia ao atingir o máximo", () => {
    expect(excedeuLimite(9, 10)).toBe(false);
    expect(excedeuLimite(10, 10)).toBe(true);
  });

  it("faz hash do IP com salt", () => {
    expect(hashIp("1.2.3.4", "s1")).toBe(hashIp("1.2.3.4", "s1"));
    expect(hashIp("1.2.3.4", "s1")).not.toBe(hashIp("1.2.3.4", "s2"));
    expect(hashIp("1.2.3.4", "s1")).not.toContain("1.2.3.4");
    expect(hashIp("1.2.3.4", "s1")).toHaveLength(64);
  });

  it("extrai o primeiro IP do x-forwarded-for", () => {
    const h = (m: Record<string, string>) => ({ get: (n: string) => m[n] ?? null });
    expect(extrairIp(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(extrairIp(h({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(extrairIp(h({}))).toBe("desconhecido");
  });
});

describe("antiabuso: tempo mínimo de 5 s", () => {
  it("rejeita envio imediato e aceita depois de 5 s", () => {
    const abertura = 1_000_000;
    const token = assinarInicio(abertura);
    expect(validarInicio(token, 5, abertura + 4_999)).toEqual({ ok: false, motivo: "RAPIDO_DEMAIS" });
    expect(validarInicio(token, 5, abertura + 5_000)).toEqual({ ok: true });
  });

  it("rejeita token adulterado ou ausente", () => {
    const token = assinarInicio(1_000_000);
    const [, assinatura] = token.split(".");
    expect(validarInicio(`1.${assinatura}`, 5, 9_999_999)).toEqual({ ok: false, motivo: "INVALIDO" });
    expect(validarInicio("", 5, 9_999_999)).toEqual({ ok: false, motivo: "INVALIDO" });
    expect(validarInicio("abc", 5, 9_999_999)).toEqual({ ok: false, motivo: "INVALIDO" });
  });
});

describe("erros do Postgres (assert_vaga / assert_status)", () => {
  it("identifica o código na mensagem e nas causas", () => {
    expect(codigoDoErro(new Error("error: SEM_VAGA"))).toBe("SEM_VAGA");
    expect(codigoDoErro(new Error("Failed query", { cause: new Error("DATA_BLOQUEADA") }))).toBe("DATA_BLOQUEADA");
    expect(codigoDoErro(new Error("JANELA_INVALIDA"))).toBe("JANELA_INVALIDA");
    expect(codigoDoErro(new Error("STATUS_INVALIDO"))).toBe("STATUS_INVALIDO");
    expect(codigoDoErro(new Error("boom"))).toBe("DESCONHECIDO");
  });

  it("devolve a mensagem amigável pedida pela SPEC", () => {
    expect(mensagemDoErro(new Error("SEM_VAGA"), "publico").mensagem).toBe(
      "Esse horário acabou de ser preenchido, escolha outro.",
    );
  });
});
