import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof criarDb>;

function criarDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  return drizzle(neon(url), { schema });
}

let instancia: Db | undefined;

// Inicialização preguiçosa: importar este módulo não exige DATABASE_URL.
export function getDb(): Db {
  return (instancia ??= criarDb());
}
