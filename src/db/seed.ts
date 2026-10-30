import { randomBytes, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { diaSemana, hojeSP, instanteSP, somarDias } from "../lib/datas";
import { getDb } from "./index";
import {
  agendamentos,
  bloqueios,
  capacidadeExcecoes,
  configuracao,
  historico,
  janelas,
  materiais,
  mensagensEnviadas,
  portesCaminhao,
} from "./schema";
import {
  capacidadePadrao,
  horariosJanelas,
  marcaPadrao,
  materiaisPadrao,
  portesPadrao,
  regrasPadrao,
  templatesPadrao,
} from "./seed-dados";

type Status = (typeof agendamentos.$inferInsert)["status"] & string;
type Volume = (typeof agendamentos.$inferInsert)["volume"] & string;

type Quando =
  | { apos: number } // primeiro dia útil >= hoje + n
  | { antes: number } // último dia útil <= hoje - n
  | { breve: true }; // SOLICITADO que vence em <= 1 dia (data = hoje+3 ou hoje+4)

interface Modelo {
  status: Status;
  quando: Quando;
  jan: number; // índice preferido em horariosJanelas
  porte: string;
  volume: Volume;
  materiais: string[];
  origem?: "CLIENTE" | "PAINEL";
  motivo?: string;
  visto?: boolean;
  reagendado?: boolean;
  mensagem?: "CONFIRMACAO" | "ALINHAMENTO";
}

// ~25 agendamentos espalhados em todos os status (SPEC §13). Datas relativas a hoje (SP).
const MODELOS: Modelo[] = [
  // SOLICITADO com prazo vencido (RN-06)
  { status: "SOLICITADO", quando: { apos: 0 }, jan: 0, porte: "TRUCK", volume: "MEDIO", materiais: ["ESCORAS"] },
  { status: "SOLICITADO", quando: { apos: 0 }, jan: 1, porte: "TOCO", volume: "PEQUENO", materiais: ["FORMAS", "ACESSORIOS"] },
  // SOLICITADO que vence em <= 1 dia
  { status: "SOLICITADO", quando: { breve: true }, jan: 2, porte: "VUC", volume: "MEDIO", materiais: ["ANDAIMES"] },
  { status: "SOLICITADO", quando: { breve: true }, jan: 3, porte: "TRES_QUARTOS", volume: "GRANDE", materiais: ["PERFIS_VIGAS"] },
  // SOLICITADO no prazo
  { status: "SOLICITADO", quando: { apos: 8 }, jan: 0, porte: "CARRETA", volume: "GRANDE", materiais: ["ESCORAS", "TORRES"] },
  { status: "SOLICITADO", quando: { apos: 10 }, jan: 4, porte: "TOCO", volume: "MEDIO", materiais: ["FORMAS"] },
  // SOLICITADO pendente de alinhamento (porte e/ou volume NAO_SEI)
  { status: "SOLICITADO", quando: { apos: 9 }, jan: 1, porte: "NAO_SEI", volume: "MEDIO", materiais: ["ESCORAS"], mensagem: "ALINHAMENTO" },
  { status: "SOLICITADO", quando: { apos: 12 }, jan: 5, porte: "TOCO", volume: "NAO_SEI", materiais: ["OUTROS"] },
  { status: "SOLICITADO", quando: { apos: 15 }, jan: 6, porte: "NAO_SEI", volume: "NAO_SEI", materiais: ["ANDAIMES", "ACESSORIOS"] },
  // CONFIRMADO (o primeiro e o segundo são candidatos a lembrete, RN-13)
  { status: "CONFIRMADO", quando: { apos: 1 }, jan: 5, porte: "VUC", volume: "PEQUENO", materiais: ["ACESSORIOS"] },
  { status: "CONFIRMADO", quando: { apos: 1 }, jan: 5, porte: "TRES_QUARTOS", volume: "MEDIO", materiais: ["FORMAS"], mensagem: "CONFIRMACAO" },
  { status: "CONFIRMADO", quando: { apos: 7 }, jan: 2, porte: "TRUCK", volume: "GRANDE", materiais: ["ESCORAS", "PERFIS_VIGAS"], mensagem: "CONFIRMACAO" },
  { status: "CONFIRMADO", quando: { apos: 14 }, jan: 3, porte: "TOCO", volume: "MEDIO", materiais: ["TORRES"], mensagem: "CONFIRMACAO" },
  { status: "CONFIRMADO", quando: { apos: 14 }, jan: 3, porte: "TOCO", volume: "PEQUENO", materiais: ["ANDAIMES"] },
  { status: "CONFIRMADO", quando: { apos: 21 }, jan: 6, porte: "CARRETA", volume: "GRANDE", materiais: ["ESCORAS"], mensagem: "CONFIRMACAO" },
  { status: "CONFIRMADO", quando: { apos: 30 }, jan: 7, porte: "VUC", volume: "PEQUENO", materiais: ["OUTROS"], origem: "PAINEL" },
  { status: "CONFIRMADO", quando: { apos: 5 }, jan: 4, porte: "TOCO", volume: "MEDIO", materiais: ["FORMAS"], reagendado: true },
  // Finalizados
  { status: "CONCLUIDO", quando: { antes: 3 }, jan: 0, porte: "TRUCK", volume: "GRANDE", materiais: ["ESCORAS"] },
  { status: "CONCLUIDO", quando: { antes: 10 }, jan: 2, porte: "TOCO", volume: "MEDIO", materiais: ["FORMAS"] },
  { status: "CONCLUIDO", quando: { antes: 20 }, jan: 4, porte: "VUC", volume: "PEQUENO", materiais: ["ACESSORIOS"] },
  { status: "NAO_COMPARECEU", quando: { antes: 5 }, jan: 1, porte: "TRES_QUARTOS", volume: "MEDIO", materiais: ["ANDAIMES"] },
  { status: "RECUSADO", quando: { apos: 6 }, jan: 3, porte: "CARRETA", volume: "GRANDE", materiais: ["TORRES"], motivo: "Sem capacidade de descarga para carretas nesse dia." },
  { status: "CANCELADO_CLIENTE", quando: { apos: 11 }, jan: 2, porte: "TOCO", volume: "MEDIO", materiais: ["FORMAS"], motivo: "Obra adiou a retirada.", visto: false },
  { status: "CANCELADO_CLIENTE", quando: { apos: 18 }, jan: 6, porte: "VUC", volume: "PEQUENO", materiais: ["ESCORAS"], motivo: "Material será devolvido na próxima semana.", visto: true },
  { status: "CANCELADO_EMPRESA", quando: { apos: 13 }, jan: 5, porte: "TRUCK", volume: "MEDIO", materiais: ["PERFIS_VIGAS"], motivo: "Pátio fechado para inventário." },
];

const NOMES = [
  ["Carlos Silva", "Construtora Alfa"],
  ["Ana Souza", "Engenharia Beta"],
  ["João Pereira", "Obras Gama Ltda"],
  ["Marcos Lima", "Delta Empreendimentos"],
  ["Paula Ramos", "Construções Épsilon"],
  ["Rafael Costa", "Zeta Incorporadora"],
  ["Luciana Alves", "Eta Engenharia"],
  ["Pedro Rocha", "Theta Obras"],
  ["Fernanda Dias", "Iota Construtora"],
  ["Bruno Martins", "Kappa Edificações"],
] as const;

const fimDeSemana = (data: string) => [0, 6].includes(diaSemana(data));

export async function executarSeed() {
  const db = getDb();
  const hoje = hojeSP();

  // Datas especiais: um dia bloqueado e uma exceção de capacidade.
  const dataBloqueada = diaUtil(somarDias(hoje, 25), 1, new Set());
  const dataExcecao = diaUtil(somarDias(hoje, 33), 1, new Set([dataBloqueada]));
  const bloqueadas = new Set([dataBloqueada]);

  // 1) Limpa tudo e recria o cadastro base.
  await db.batch([
    db.execute(
      sql`truncate table historico, mensagens_enviadas, agendamentos, tentativas_publicas, bloqueios, capacidade_excecoes, janelas, portes_caminhao, materiais, imagens, configuracao restart identity cascade`,
    ),
    db.execute(sql`alter sequence protocolo_seq restart with 1`),
  ]);

  const linhasJanelas = [1, 2, 3, 4, 5].flatMap((dia) =>
    horariosJanelas.map(([ini, fim]) => ({
      diaSemana: dia,
      horaInicio: ini,
      horaFim: fim,
      capacidade: capacidadePadrao,
    })),
  );
  const [, , janelasCriadas] = await db.batch([
    db.insert(configuracao).values({ marca: marcaPadrao, regras: regrasPadrao, templates: templatesPadrao }),
    db.insert(portesCaminhao).values(portesPadrao),
    db.insert(janelas).values(linhasJanelas).returning(),
    db.insert(materiais).values(materiaisPadrao),
  ]);

  const idJanela = (dia: number, idx: number) => {
    const [ini] = horariosJanelas[idx];
    const j = janelasCriadas.find((x) => x.diaSemana === dia && x.horaInicio.startsWith(ini));
    if (!j) throw new Error(`Janela não encontrada: dia ${dia}, ${ini}`);
    return j.id;
  };

  const excecaoJanela = idJanela(diaSemana(dataExcecao), 0);
  await db.batch([
    db.insert(bloqueios).values({ data: dataBloqueada, janelaId: null, motivo: "Feriado fictício (demonstração)" }),
    db.insert(capacidadeExcecoes).values({ data: dataExcecao, janelaId: excecaoJanela, capacidade: 1 }),
  ]);

  // 2) Agendamentos: ocupam vaga via assert_vaga, tudo numa única transação.
  const pesoPorte = new Map(portesPadrao.map((p) => [p.codigo, p.pesoVagas]));
  const textoJanela = (idx: number) => `${horariosJanelas[idx][0]}–${horariosJanelas[idx][1]}`;
  const ocupacao = new Map<string, number>();
  const cabeNaJanela = (data: string, idx: number, peso: number) => {
    const cap = data === dataExcecao && idx === 0 ? 1 : capacidadePadrao;
    return (ocupacao.get(`${data}|${idx}`) ?? 0) + peso <= cap;
  };

  const batch: BatchItem<"pg">[] = [];
  MODELOS.forEach((m, i) => {
    const data = resolverData(m.quando, hoje, bloqueadas);
    const peso = pesoPorte.get(m.porte) ?? 1;
    const ocupa = m.status === "SOLICITADO" || m.status === "CONFIRMADO";

    let jan = m.jan;
    if (ocupa) {
      for (let t = 0; t < horariosJanelas.length && !cabeNaJanela(data, jan, peso); t++) {
        jan = (jan + 1) % horariosJanelas.length;
      }
      if (!cabeNaJanela(data, jan, peso)) throw new Error(`Sem janela livre para o modelo ${i} em ${data}`);
      ocupacao.set(`${data}|${jan}`, (ocupacao.get(`${data}|${jan}`) ?? 0) + peso);
    }
    const janelaId = idJanela(diaSemana(data), jan);

    const [nome, empresa] = NOMES[i % NOMES.length];
    const id = randomUUID();
    const origem = m.origem ?? "CLIENTE";
    const criadoEm = instanteSP(somarDias(data < hoje ? data : hoje, -(2 + (i % 5))), "10:00");
    const requerAlinhamento = m.porte === "NAO_SEI" || m.volume === "NAO_SEI";
    const finalizado = ["CONCLUIDO", "NAO_COMPARECEU"].includes(m.status);

    if (ocupa) batch.push(db.execute(sql`select assert_vaga(${data}::date, ${janelaId}::int, ${peso}::int)`));

    batch.push(
      db.insert(agendamentos).values({
        id,
        protocolo: sql`'DEV-' || to_char(now() at time zone 'America/Sao_Paulo', 'YYMM') || '-' || lpad(nextval('protocolo_seq')::text, 4, '0')`,
        token: randomBytes(24).toString("base64url"),
        data,
        janelaId,
        status: m.status,
        requerAlinhamento,
        origem,
        nome,
        empresa,
        whatsapp: `55119999${String(9000 + i).padStart(5, "0")}`,
        contrato: `CT-${String(1000 + i)}`,
        materiais: m.materiais,
        volume: m.volume,
        porteCodigo: m.porte,
        pesoVagas: peso,
        placa: origem === "PAINEL" || finalizado ? `DEM${i}A${String(10 + i)}` : null,
        aceiteEm: origem === "CLIENTE" ? criadoEm : null,
        motivo: m.motivo ?? null,
        vistoEm: m.visto ? instanteSP(hoje, "09:00") : null,
        calendarSync: ["CONFIRMADO", "CONCLUIDO", "NAO_COMPARECEU"].includes(m.status) ? "DESATIVADO" : "NAO_APLICA",
        criadoEm,
        atualizadoEm: criadoEm,
      }),
    );

    const eventos: { autor: string; acao: string; detalhes?: object }[] = [
      { autor: origem === "CLIENTE" ? "CLIENTE" : "ADMIN", acao: "CRIADO" },
    ];
    if (m.status !== "SOLICITADO") {
      const acao: Record<string, [string, string]> = {
        CONFIRMADO: ["ADMIN", "CONFIRMADO"],
        CONCLUIDO: ["ADMIN", "CONCLUIDO"],
        NAO_COMPARECEU: ["ADMIN", "NAO_COMPARECEU"],
        RECUSADO: ["ADMIN", "RECUSADO"],
        CANCELADO_CLIENTE: ["CLIENTE", "CANCELADO"],
        CANCELADO_EMPRESA: ["ADMIN", "CANCELADO"],
      };
      const [autor, nomeAcao] = acao[m.status];
      if (finalizado) eventos.push({ autor: "ADMIN", acao: "CONFIRMADO" });
      eventos.push({ autor, acao: nomeAcao, detalhes: m.motivo ? { motivo: m.motivo } : undefined });
    }
    if (m.reagendado) {
      eventos.push({
        autor: "ADMIN",
        acao: "REAGENDADO",
        detalhes: { de: { data: somarDias(data, -3), janela: textoJanela(jan) }, para: { data, janela: textoJanela(jan) } },
      });
    }
    batch.push(
      db.insert(historico).values(
        eventos.map((e, k) => ({
          agendamentoId: id,
          autor: e.autor,
          acao: e.acao,
          detalhes: e.detalhes ?? null,
          criadoEm: instanteSP(somarDias(data < hoje ? data : hoje, -(2 + (i % 5))), `1${k}:00`),
        })),
      ),
    );

    if (m.mensagem) {
      batch.push(
        db.insert(mensagensEnviadas).values({
          agendamentoId: id,
          tipo: m.mensagem,
          texto: `[demonstração] mensagem de ${m.mensagem.toLowerCase()} para ${nome}`,
          enviadoEm: instanteSP(somarDias(data < hoje ? data : hoje, -(2 + (i % 5))), "15:00"), // depois dos eventos do histórico
        }),
      );
    }
  });

  await db.batch(batch as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  return { agendamentos: MODELOS.length, dataBloqueada, dataExcecao };
}

/** Primeiro dia útil não bloqueado a partir de `data`, andando `passo` dia(s) por vez. */
function diaUtil(data: string, passo: 1 | -1, bloqueadas: Set<string>): string {
  let d = data;
  while (fimDeSemana(d) || bloqueadas.has(d)) d = somarDias(d, passo);
  return d;
}

function resolverData(quando: Quando, hoje: string, bloqueadas: Set<string>): string {
  if ("apos" in quando) return diaUtil(somarDias(hoje, quando.apos), 1, bloqueadas);
  if ("antes" in quando) return diaUtil(somarDias(hoje, -quando.antes), -1, bloqueadas);
  // vence em <= 1 dia: data - sla (3) cai em hoje ou hoje+1; tenta hoje+3 e hoje+4, senão o próximo dia útil
  for (const n of [3, 4]) {
    const d = somarDias(hoje, n);
    if (!fimDeSemana(d) && !bloqueadas.has(d)) return d;
  }
  return diaUtil(somarDias(hoje, 3), 1, bloqueadas);
}

// Execução direta: `npm run db:seed`
if (process.argv[1] && /seed\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) {
  executarSeed()
    .then((r) => console.log("Seed concluído:", r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
