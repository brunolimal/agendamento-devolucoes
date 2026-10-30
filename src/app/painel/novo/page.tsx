import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { materiais, portesCaminhao } from "@/db/schema";
import { Agendador } from "@/components/publico/Agendador";
import { exigirSessao } from "@/lib/auth";
import { hojeSP } from "@/lib/datas";

// RN-10: agendamento manual. Mesmo formulário do cliente, com todas as datas liberadas e a lotação visível.
export default async function NovoAgendamento() {
  await exigirSessao();
  const db = getDb();
  const [portes, listaMateriais] = await db.batch([
    db.select().from(portesCaminhao).where(eq(portesCaminhao.ativo, true)).orderBy(asc(portesCaminhao.ordem)),
    db.select().from(materiais).where(eq(materiais.ativo, true)).orderBy(asc(materiais.ordem)),
  ]);
  const hoje = hojeSP();

  return (
    <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Novo agendamento</h1>
      <Agendador
        modo="painel"
        hoje={hoje}
        min={hoje}
        max={hoje}
        portes={portes.map((p) => ({ codigo: p.codigo, nome: p.nome, descricao: p.descricao, pesoVagas: p.pesoVagas, imagemUrl: p.imagemUrl }))}
        materiais={listaMateriais.map((m) => ({ codigo: m.codigo, nome: m.nome, imagemUrl: m.imagemUrl }))}
      />
    </main>
  );
}
