CREATE TABLE "imagens" (
	"tipo" text NOT NULL,
	"codigo" text NOT NULL,
	"tipo_mime" text NOT NULL,
	"dados" text NOT NULL,
	"tamanho" integer NOT NULL,
	"largura" smallint NOT NULL,
	"altura" smallint NOT NULL,
	"hash" text NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imagens_tipo_codigo_pk" PRIMARY KEY("tipo","codigo"),
	CONSTRAINT "imagens_tipo" CHECK ("imagens"."tipo" in ('porte','material')),
	CONSTRAINT "imagens_tipo_mime" CHECK ("imagens"."tipo_mime" in ('image/png','image/jpeg','image/webp'))
);
--> statement-breakpoint
ALTER TABLE "materiais" ADD COLUMN "imagem_url" text;