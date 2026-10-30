import { cache } from "react";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { configuracao } from "@/db/schema";
import { marcaSchema, regrasSchema, templatesSchema, type Configuracao } from "./config-schemas";

export * from "./config-schemas";

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
