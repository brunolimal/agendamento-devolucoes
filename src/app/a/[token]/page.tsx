import { eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { agendamentos, janelas, materiais, portesCaminhao } from "@/db/schema";
import { CancelarAgendamento } from "@/components/publico/CancelarAgendamento";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getConfig } from "@/lib/config";
import { formatarData, formatarDiaExtenso, formatarHora, hojeSP } from "@/lib/datas";
import { tokenValido } from "@/lib/protocolo";
import { limiteCancelamento, ocupaVaga, podeClienteCancelar, type Status } from "@/lib/regras";
import { mascararParaExibir } from "@/lib/telefone";
import { linkLogistica } from "@/lib/whatsapp";

const MENSAGEM_STATUS: Record<Status, string> = {
  SOLICITADO: "Recebemos sua solicitação. Nossa equipe vai confirmar pelo WhatsApp.",
  CONFIRMADO: "Sua devolução está confirmada. Esperamos você no horário combinado.",
  RECUSADO: "Não foi possível confirmar essa solicitação. Fale com a logística para combinar outra data.",
  CANCELADO_CLIENTE: "Você cancelou este agendamento.",
  CANCELADO_EMPRESA: "Este agendamento foi cancelado pela empresa. Fale com a logística para remarcar.",
  CONCLUIDO: "Devolução concluída. Obrigado!",
  NAO_COMPARECEU: "Não registramos o comparecimento neste agendamento. Fale com a logística para remarcar.",
};

const VOLUME: Record<string, string> = { PEQUENO: "Pequeno", MEDIO: "Médio", GRANDE: "Grande", NAO_SEI: "A alinhar" };

export default async function PaginaCliente({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!tokenValido(token)) notFound();

  const db = getDb();
  const [linha] = await db
    .select({ ag: agendamentos, janela: janelas, porte: portesCaminhao })
    .from(agendamentos)
    .innerJoin(janelas, eq(janelas.id, agendamentos.janelaId))
    .innerJoin(portesCaminhao, eq(portesCaminhao.codigo, agendamentos.porteCodigo))
    .where(eq(agendamentos.token, token));
  if (!linha) notFound();
  const { ag, janela, porte } = linha;

  const [{ marca, regras }, listaMateriais] = await Promise.all([
    getConfig(),
    db.select().from(materiais).where(inArray(materiais.codigo, ag.materiais)),
  ]);
  const hoje = hojeSP();
  const limite = formatarData(limiteCancelamento(ag.data, regras));
  const podeCancelar = podeClienteCancelar(ag.status, ag.data, hoje, regras);
  const foraDoPrazo = ocupaVaga(ag.status) && !podeCancelar;

  const nomesMateriais = [
    ...listaMateriais.map((m) => m.nome),
    ...(ag.materiaisOutros ? [ag.materiaisOutros] : []),
  ].join(", ");

  const itens: [string, string][] = [
    ["Protocolo", ag.protocolo],
    ["Data", formatarDiaExtenso(ag.data) + ", " + formatarData(ag.data)],
    ["Horário", `${formatarHora(janela.horaInicio)} às ${formatarHora(janela.horaFim)}`],
    ["Empresa", ag.empresa],
    ["Contato", mascararParaExibir(ag.whatsapp)],
    ["Materiais", nomesMateriais],
    ["Volume", VOLUME[ag.volume]],
    ["Caminhão", porte.nome],
  ];

  return (
    <main className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold text-primaria">{marca.nome}</h1>

      <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <StatusBadge status={ag.status} />
        <p className="text-slate-700">{MENSAGEM_STATUS[ag.status]}</p>
      </section>

      <dl className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        {itens.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {podeCancelar && <CancelarAgendamento token={token} limite={limite} />}
      {foraDoPrazo && (
        <p className="rounded-xl bg-yellow-50 p-3 text-yellow-900 ring-1 ring-yellow-200">
          O prazo para cancelar pelo link terminou em {limite}. Para alterar ou cancelar, fale com a logística.
        </p>
      )}

      <a
        href={linkLogistica(marca.whatsapp_empresa, ag.protocolo)}
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl bg-primaria px-5 py-4 text-center text-lg font-semibold text-white"
      >
        Falar com a logística
      </a>
    </main>
  );
}
