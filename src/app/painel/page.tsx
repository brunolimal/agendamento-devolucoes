import { and, asc, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { agendamentos, janelas } from "@/db/schema";
import { AtualizaAuto } from "@/components/painel/AtualizaAuto";
import { SeloAlinhar, SeloPrazo } from "@/components/painel/SeloPrazo";
import { marcarVisto } from "@/app/painel/actions/agendamentos";
import { exigirSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { formatarData, formatarHora, hojeSP } from "@/lib/datas";
import { classificarPrazo, prazoDecisao } from "@/lib/regras";

export default async function CaixaDeEntrada() {
  await exigirSessao();
  const db = getDb();
  const { regras } = await getConfig();
  const hoje = hojeSP();

  const [solicitados, cancelados, falhas] = await db.batch([
    db
      .select({ ag: agendamentos, janela: janelas })
      .from(agendamentos)
      .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
      .where(eq(agendamentos.status, "SOLICITADO"))
      .orderBy(asc(agendamentos.data), asc(janelas.horaInicio)),
    db
      .select({ ag: agendamentos, janela: janelas })
      .from(agendamentos)
      .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
      .where(and(eq(agendamentos.status, "CANCELADO_CLIENTE"), isNull(agendamentos.vistoEm)))
      .orderBy(desc(agendamentos.atualizadoEm)),
    db.select().from(agendamentos).where(eq(agendamentos.calendarSync, "ERRO")).orderBy(desc(agendamentos.atualizadoEm)),
  ]);

  const pendentes = solicitados.length + cancelados.length + falhas.length;

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-6">
      <AtualizaAuto pendentes={pendentes} />
      <h1 className="text-2xl font-bold">Caixa de entrada</h1>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Aguardando decisão ({solicitados.length})</h2>
        {solicitados.length === 0 && <p className="text-slate-500">Nenhuma solicitação pendente.</p>}
        {solicitados.map(({ ag, janela }) => (
          <Link
            key={ag.id}
            href={`/painel/agendamentos/${ag.id}`}
            className="block space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 hover:ring-primaria"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{ag.empresa}</span>
              <span className="text-slate-500">· {ag.nome}</span>
              <span className="ml-auto text-sm text-slate-500">{ag.protocolo}</span>
            </div>
            <div className="text-slate-700">
              {formatarData(ag.data)}, {formatarHora(janela.horaInicio)} às {formatarHora(janela.horaFim)} · {ag.porteCodigo}
            </div>
            <div className="flex flex-wrap gap-2">
              <SeloPrazo situacao={classificarPrazo(ag.data, hoje, regras)} prazo={prazoDecisao(ag.data, regras)} />
              {ag.requerAlinhamento && <SeloAlinhar />}
            </div>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Cancelados pelo cliente ({cancelados.length})</h2>
        {cancelados.length === 0 && <p className="text-slate-500">Nenhum cancelamento novo.</p>}
        {cancelados.map(({ ag, janela }) => (
          <div key={ag.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-red-200">
            <Link href={`/painel/agendamentos/${ag.id}`} className="min-w-0 flex-1">
              <span className="font-semibold">{ag.empresa}</span>
              <span className="text-slate-500"> · {ag.protocolo}</span>
              <span className="block text-slate-700">
                {formatarData(ag.data)}, {formatarHora(janela.horaInicio)} às {formatarHora(janela.horaFim)}
              </span>
            </Link>
            <form action={marcarVisto}>
              <input type="hidden" name="id" value={ag.id} />
              <button type="submit" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">
                Visto
              </button>
            </form>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Falhas de agenda ({falhas.length})</h2>
        {falhas.length === 0 && <p className="text-slate-500">Nenhuma falha de sincronização.</p>}
        {falhas.map((ag) => (
          <Link
            key={ag.id}
            href={`/painel/agendamentos/${ag.id}`}
            className="block rounded-xl bg-white p-4 shadow-sm ring-1 ring-orange-200"
          >
            <span className="font-semibold">{ag.empresa}</span>
            <span className="text-slate-500"> · {ag.protocolo}</span>
            <span className="block text-sm text-orange-900">{ag.calendarErro ?? "Erro ao sincronizar com o Google Calendar"}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
