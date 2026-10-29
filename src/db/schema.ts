import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  time,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const statusAgendamento = pgEnum("status_agendamento", [
  "SOLICITADO",
  "CONFIRMADO",
  "RECUSADO",
  "CANCELADO_CLIENTE",
  "CANCELADO_EMPRESA",
  "CONCLUIDO",
  "NAO_COMPARECEU",
]);
export const volumeCarga = pgEnum("volume_carga", ["PEQUENO", "MEDIO", "GRANDE", "NAO_SEI"]);
export const origemAgendamento = pgEnum("origem_agendamento", ["CLIENTE", "PAINEL"]);
export const calendarSync = pgEnum("calendar_sync", [
  "NAO_APLICA",
  "PENDENTE",
  "OK",
  "ERRO",
  "DESATIVADO",
]);

export const protocoloSeq = pgSequence("protocolo_seq");

export const configuracao = pgTable(
  "configuracao",
  {
    id: integer("id").primaryKey().default(1),
    marca: jsonb("marca").notNull(),
    regras: jsonb("regras").notNull(),
    templates: jsonb("templates").notNull(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("configuracao_id_unico", sql`${t.id} = 1`)],
);

export const janelas = pgTable(
  "janelas",
  {
    id: serial("id").primaryKey(),
    diaSemana: smallint("dia_semana").notNull(),
    horaInicio: time("hora_inicio").notNull(),
    horaFim: time("hora_fim").notNull(),
    capacidade: smallint("capacidade").notNull(),
    ativo: boolean("ativo").notNull().default(true),
  },
  (t) => [
    check("janelas_dia_semana", sql`${t.diaSemana} between 0 and 6`),
    check("janelas_hora", sql`${t.horaFim} > ${t.horaInicio}`),
    check("janelas_capacidade", sql`${t.capacidade} >= 0`),
  ],
);

export const capacidadeExcecoes = pgTable(
  "capacidade_excecoes",
  {
    data: date("data", { mode: "string" }).notNull(),
    janelaId: integer("janela_id")
      .notNull()
      .references(() => janelas.id),
    capacidade: smallint("capacidade").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.data, t.janelaId] }),
    check("capacidade_excecoes_capacidade", sql`${t.capacidade} >= 0`),
  ],
);

export const bloqueios = pgTable("bloqueios", {
  id: serial("id").primaryKey(),
  data: date("data", { mode: "string" }).notNull(),
  janelaId: integer("janela_id").references(() => janelas.id),
  motivo: text("motivo").notNull(),
});

export const portesCaminhao = pgTable("portes_caminhao", {
  codigo: text("codigo").primaryKey(),
  nome: text("nome").notNull(),
  descricao: text("descricao"),
  imagemUrl: text("imagem_url"),
  pesoVagas: smallint("peso_vagas").notNull().default(1),
  ordem: smallint("ordem").notNull(),
  ativo: boolean("ativo").notNull().default(true),
});

export const materiais = pgTable("materiais", {
  codigo: text("codigo").primaryKey(),
  nome: text("nome").notNull(),
  ordem: smallint("ordem").notNull(),
  ativo: boolean("ativo").notNull().default(true),
});

export const agendamentos = pgTable(
  "agendamentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    protocolo: text("protocolo").notNull().unique(),
    token: text("token").notNull().unique(),
    data: date("data", { mode: "string" }).notNull(),
    janelaId: integer("janela_id")
      .notNull()
      .references(() => janelas.id),
    status: statusAgendamento("status").notNull().default("SOLICITADO"),
    requerAlinhamento: boolean("requer_alinhamento").notNull().default(false),
    origem: origemAgendamento("origem").notNull().default("CLIENTE"),
    nome: text("nome").notNull(),
    empresa: text("empresa").notNull(),
    whatsapp: text("whatsapp").notNull(),
    contrato: text("contrato").notNull(),
    materiais: text("materiais").array().notNull(),
    materiaisOutros: text("materiais_outros"),
    volume: volumeCarga("volume").notNull(),
    porteCodigo: text("porte_codigo")
      .notNull()
      .references(() => portesCaminhao.codigo),
    pesoVagas: smallint("peso_vagas").notNull(),
    placa: text("placa"),
    motorista: text("motorista"),
    observacoes: text("observacoes"),
    aceiteEm: timestamp("aceite_em", { withTimezone: true }),
    motivo: text("motivo"),
    vistoEm: timestamp("visto_em", { withTimezone: true }),
    calendarEventId: text("calendar_event_id"),
    calendarSync: calendarSync("calendar_sync").notNull().default("NAO_APLICA"),
    calendarErro: text("calendar_erro"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("agendamentos_data_janela_ativos_idx")
      .on(t.data, t.janelaId)
      .where(sql`${t.status} in ('SOLICITADO','CONFIRMADO')`),
    index("agendamentos_status_idx").on(t.status),
  ],
);

export const historico = pgTable(
  "historico",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    agendamentoId: uuid("agendamento_id")
      .notNull()
      .references(() => agendamentos.id, { onDelete: "cascade" }),
    autor: text("autor").notNull(),
    acao: text("acao").notNull(),
    detalhes: jsonb("detalhes"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("historico_autor", sql`${t.autor} in ('CLIENTE','ADMIN','SISTEMA')`)],
);

export const mensagensEnviadas = pgTable("mensagens_enviadas", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  agendamentoId: uuid("agendamento_id")
    .notNull()
    .references(() => agendamentos.id, { onDelete: "cascade" }),
  tipo: text("tipo").notNull(),
  texto: text("texto").notNull(),
  enviadoEm: timestamp("enviado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const tentativasPublicas = pgTable(
  "tentativas_publicas",
  {
    ipHash: text("ip_hash").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tentativas_publicas_ip_criado_idx").on(t.ipHash, t.criadoEm)],
);
