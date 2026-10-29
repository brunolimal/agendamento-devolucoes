import { cache } from "react";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { configuracao } from "@/db/schema";

export const marcaSchema = z.object({
  nome: z.string().min(1),
  logo_url: z.string().nullable(),
  cor_primaria: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  whatsapp_empresa: z.string(),
  endereco_patio: z.string(),
  link_maps: z.string(),
  texto_boas_vindas: z.string(),
  regras_aceite: z.string(),
});

export const regrasSchema = z.object({
  antecedencia_min_dias: z.number().int().min(0),
  antecedencia_max_dias: z.number().int().min(1),
  prazo_cancel_dias: z.number().int().min(0),
  sla_decisao_dias: z.number().int().min(0),
  dias_lembrete: z.number().int().min(0),
});

export const TIPOS_TEMPLATE = [
  "confirmacao",
  "recusa",
  "alinhamento",
  "lembrete",
  "reagendamento",
  "cancelamento_empresa",
  "cancelamento_cliente_ok",
] as const;

export const templatesSchema = z.object({
  confirmacao: z.string(),
  recusa: z.string(),
  alinhamento: z.string(),
  lembrete: z.string(),
  reagendamento: z.string(),
  cancelamento_empresa: z.string(),
  cancelamento_cliente_ok: z.string(),
});

export type Marca = z.infer<typeof marcaSchema>;
export type Regras = z.infer<typeof regrasSchema>;
export type Templates = z.infer<typeof templatesSchema>;
export interface Configuracao {
  marca: Marca;
  regras: Regras;
  templates: Templates;
}

/** Lê e valida a configuração única. Cache por request (React.cache). */
export const getConfig = cache(async (): Promise<Configuracao> => {
  const [linha] = await getDb().select().from(configuracao).where(eq(configuracao.id, 1));
  if (!linha) throw new Error("Configuração não encontrada. Rode o seed.");
  return {
    marca: marcaSchema.parse(linha.marca),
    regras: regrasSchema.parse(linha.regras),
    templates: templatesSchema.parse(linha.templates),
  };
});

/** URL pública do app, sem barra final. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "").replace(/\/+$/, "");
}
