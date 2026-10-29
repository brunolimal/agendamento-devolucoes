CREATE TYPE "public"."calendar_sync" AS ENUM('NAO_APLICA', 'PENDENTE', 'OK', 'ERRO', 'DESATIVADO');--> statement-breakpoint
CREATE TYPE "public"."origem_agendamento" AS ENUM('CLIENTE', 'PAINEL');--> statement-breakpoint
CREATE TYPE "public"."status_agendamento" AS ENUM('SOLICITADO', 'CONFIRMADO', 'RECUSADO', 'CANCELADO_CLIENTE', 'CANCELADO_EMPRESA', 'CONCLUIDO', 'NAO_COMPARECEU');--> statement-breakpoint
CREATE TYPE "public"."volume_carga" AS ENUM('PEQUENO', 'MEDIO', 'GRANDE', 'NAO_SEI');--> statement-breakpoint
CREATE SEQUENCE "public"."protocolo_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "agendamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"protocolo" text NOT NULL,
	"token" text NOT NULL,
	"data" date NOT NULL,
	"janela_id" integer NOT NULL,
	"status" "status_agendamento" DEFAULT 'SOLICITADO' NOT NULL,
	"requer_alinhamento" boolean DEFAULT false NOT NULL,
	"origem" "origem_agendamento" DEFAULT 'CLIENTE' NOT NULL,
	"nome" text NOT NULL,
	"empresa" text NOT NULL,
	"whatsapp" text NOT NULL,
	"contrato" text NOT NULL,
	"materiais" text[] NOT NULL,
	"materiais_outros" text,
	"volume" "volume_carga" NOT NULL,
	"porte_codigo" text NOT NULL,
	"peso_vagas" smallint NOT NULL,
	"placa" text,
	"motorista" text,
	"observacoes" text,
	"aceite_em" timestamp with time zone,
	"motivo" text,
	"visto_em" timestamp with time zone,
	"calendar_event_id" text,
	"calendar_sync" "calendar_sync" DEFAULT 'NAO_APLICA' NOT NULL,
	"calendar_erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agendamentos_protocolo_unique" UNIQUE("protocolo"),
	CONSTRAINT "agendamentos_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "bloqueios" (
	"id" serial PRIMARY KEY NOT NULL,
	"data" date NOT NULL,
	"janela_id" integer,
	"motivo" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capacidade_excecoes" (
	"data" date NOT NULL,
	"janela_id" integer NOT NULL,
	"capacidade" smallint NOT NULL,
	CONSTRAINT "capacidade_excecoes_data_janela_id_pk" PRIMARY KEY("data","janela_id"),
	CONSTRAINT "capacidade_excecoes_capacidade" CHECK ("capacidade_excecoes"."capacidade" >= 0)
);
--> statement-breakpoint
CREATE TABLE "configuracao" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"marca" jsonb NOT NULL,
	"regras" jsonb NOT NULL,
	"templates" jsonb NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "configuracao_id_unico" CHECK ("configuracao"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "historico" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agendamento_id" uuid NOT NULL,
	"autor" text NOT NULL,
	"acao" text NOT NULL,
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "historico_autor" CHECK ("historico"."autor" in ('CLIENTE','ADMIN','SISTEMA'))
);
--> statement-breakpoint
CREATE TABLE "janelas" (
	"id" serial PRIMARY KEY NOT NULL,
	"dia_semana" smallint NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"capacidade" smallint NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	CONSTRAINT "janelas_dia_semana" CHECK ("janelas"."dia_semana" between 0 and 6),
	CONSTRAINT "janelas_hora" CHECK ("janelas"."hora_fim" > "janelas"."hora_inicio"),
	CONSTRAINT "janelas_capacidade" CHECK ("janelas"."capacidade" >= 0)
);
--> statement-breakpoint
CREATE TABLE "materiais" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"ordem" smallint NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mensagens_enviadas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"agendamento_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"texto" text NOT NULL,
	"enviado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portes_caminhao" (
	"codigo" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"imagem_url" text,
	"peso_vagas" smallint DEFAULT 1 NOT NULL,
	"ordem" smallint NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tentativas_publicas" (
	"ip_hash" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_janela_id_janelas_id_fk" FOREIGN KEY ("janela_id") REFERENCES "public"."janelas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_porte_codigo_portes_caminhao_codigo_fk" FOREIGN KEY ("porte_codigo") REFERENCES "public"."portes_caminhao"("codigo") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bloqueios" ADD CONSTRAINT "bloqueios_janela_id_janelas_id_fk" FOREIGN KEY ("janela_id") REFERENCES "public"."janelas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacidade_excecoes" ADD CONSTRAINT "capacidade_excecoes_janela_id_janelas_id_fk" FOREIGN KEY ("janela_id") REFERENCES "public"."janelas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "historico" ADD CONSTRAINT "historico_agendamento_id_agendamentos_id_fk" FOREIGN KEY ("agendamento_id") REFERENCES "public"."agendamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_enviadas" ADD CONSTRAINT "mensagens_enviadas_agendamento_id_agendamentos_id_fk" FOREIGN KEY ("agendamento_id") REFERENCES "public"."agendamentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agendamentos_data_janela_ativos_idx" ON "agendamentos" USING btree ("data","janela_id") WHERE "agendamentos"."status" in ('SOLICITADO','CONFIRMADO');--> statement-breakpoint
CREATE INDEX "agendamentos_status_idx" ON "agendamentos" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tentativas_publicas_ip_criado_idx" ON "tentativas_publicas" USING btree ("ip_hash","criado_em");