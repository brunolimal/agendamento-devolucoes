import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { materiais, portesCaminhao } from "@/db/schema";
import { Agendador } from "@/components/publico/Agendador";
import { getConfig } from "@/lib/config";
import { hojeSP } from "@/lib/datas";
import { intervaloCliente } from "@/lib/disponibilidade";
import { assinarInicio } from "@/lib/rate-limit";

export default async function PaginaAgendar() {
  const { marca, regras } = await getConfig();
  const db = getDb();
  const [portes, listaMateriais] = await db.batch([
    db.select().from(portesCaminhao).where(eq(portesCaminhao.ativo, true)).orderBy(asc(portesCaminhao.ordem)),
    db.select().from(materiais).where(eq(materiais.ativo, true)).orderBy(asc(materiais.ordem)),
  ]);
  const { min, max } = intervaloCliente(hojeSP(), regras);

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold text-primaria">{marca.nome}</h1>
      <Agendador
        regrasAceite={marca.regras_aceite}
        portes={portes.map((p) => ({
          codigo: p.codigo,
          nome: p.nome,
          descricao: p.descricao,
          pesoVagas: p.pesoVagas,
        }))}
        materiais={listaMateriais.map((m) => ({ codigo: m.codigo, nome: m.nome }))}
        min={min}
        max={max}
        inicio={assinarInicio()}
      />
    </main>
  );
}
