"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { criarSessao, encerrarSessao, exigirSessao, senhaConfere } from "@/lib/auth";
import { ipAtual, limiteExcedido, registrarTentativa } from "@/lib/rate-limit";

export interface EstadoLogin {
  erro?: string;
}

const loginSchema = z.object({ senha: z.string().min(1).max(200) });

/** SPEC §14: até 5 tentativas erradas por IP a cada 15 min. */
export async function entrar(_anterior: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const parsed = loginSchema.safeParse({ senha: formData.get("senha") });
  if (!parsed.success) return { erro: "Informe a senha." };

  const ip = await ipAtual();
  if (await limiteExcedido("login", ip)) {
    return { erro: "Muitas tentativas. Tente novamente em 15 minutos." };
  }

  if (!(await senhaConfere(parsed.data.senha))) {
    await registrarTentativa("login", ip);
    return { erro: "Senha incorreta." };
  }

  try {
    await criarSessao();
  } catch {
    return { erro: "Configuração de sessão inválida: confira SESSION_SECRET (32+ caracteres)." };
  }
  redirect("/painel");
}

export async function sair(): Promise<void> {
  await exigirSessao();
  await encerrarSessao();
  redirect("/painel/login");
}
