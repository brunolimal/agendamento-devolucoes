import { asc, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { z } from "zod";
import { getDb } from "@/db";
import { bloqueios, capacidadeExcecoes, janelas, materiais, portesCaminhao } from "@/db/schema";
import { EditorJanelas, type LinhaJanela } from "@/components/painel/config/EditorJanelas";
import { EditorTemplates } from "@/components/painel/config/EditorTemplates";
import { Bloqueios, ExcecoesCapacidade } from "@/components/painel/config/ExcecoesBloqueios";
import { FormMarca, FormRegras } from "@/components/painel/config/FormMarcaRegras";
import { EditorMateriais, EditorPortes } from "@/components/painel/config/PortesMateriais";
import { exigirSessao } from "@/lib/auth";
import { appUrl, getConfig } from "@/lib/config";
import { hojeSP } from "@/lib/datas";
import { normalizarHora } from "@/lib/janelas";

const ABAS = [
  { chave: "marca", rotulo: "Marca" },
  { chave: "regras", rotulo: "Regras" },
  { chave: "janelas", rotulo: "Janelas" },
  { chave: "excecoes", rotulo: "Exceções de capacidade" },
  { chave: "bloqueios", rotulo: "Bloqueios" },
  { chave: "portes", rotulo: "Portes" },
  { chave: "materiais", rotulo: "Materiais" },
  { chave: "mensagens", rotulo: "Mensagens" },
] as const;

const abaSchema = z.enum(ABAS.map((a) => a.chave) as [string, ...string[]]).catch("marca");

export default async function Configuracoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirSessao();
  const bruto = (await searchParams).aba;
  const aba = abaSchema.parse(typeof bruto === "string" ? bruto : undefined);
  const hoje = hojeSP();

  return (
    <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <h1 className="text-2xl font-bold">Configurações</h1>
      <nav className="flex flex-wrap gap-2" aria-label="Abas de configuração">
        {ABAS.map((a) => (
          <Link
            key={a.chave}
            href={`/painel/config?aba=${a.chave}`}
            aria-current={aba === a.chave ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              aba === a.chave ? "bg-primaria text-white" : "border border-slate-300 bg-white text-slate-700"
            }`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      <section className="space-y-4">
        {await conteudo(aba, hoje)}
      </section>
    </main>
  );
}

async function conteudo(aba: string, hoje: string) {
  const db = getDb();

  if (aba === "marca") return <FormMarca marca={(await getConfig()).marca} />;
  if (aba === "regras") return <FormRegras regras={(await getConfig()).regras} />;

  if (aba === "janelas") {
    const todas = await db.select().from(janelas).orderBy(asc(janelas.diaSemana), asc(janelas.horaInicio));
    const porDia: Record<number, LinhaJanela[]> = {};
    for (const j of todas) {
      (porDia[j.diaSemana] ??= []).push({
        id: j.id,
        horaInicio: normalizarHora(j.horaInicio),
        horaFim: normalizarHora(j.horaFim),
        capacidade: j.capacidade,
        ativo: j.ativo,
      });
    }
    return <EditorJanelas porDia={porDia} />;
  }

  if (aba === "excecoes" || aba === "bloqueios") {
    const ativas = await db.select().from(janelas).where(eq(janelas.ativo, true)).orderBy(asc(janelas.diaSemana), asc(janelas.horaInicio));
    const opcoes = ativas.map((j) => ({
      id: j.id,
      diaSemana: j.diaSemana,
      horaInicio: j.horaInicio,
      horaFim: j.horaFim,
      capacidade: j.capacidade,
    }));

    if (aba === "excecoes") {
      const linhas = await db
        .select({ e: capacidadeExcecoes, j: janelas })
        .from(capacidadeExcecoes)
        .innerJoin(janelas, eq(janelas.id, capacidadeExcecoes.janelaId))
        .where(gte(capacidadeExcecoes.data, hoje))
        .orderBy(asc(capacidadeExcecoes.data), asc(janelas.horaInicio));
      return (
        <ExcecoesCapacidade
          hoje={hoje}
          janelas={opcoes}
          excecoes={linhas.map(({ e, j }) => ({
            data: e.data,
            janelaId: e.janelaId,
            capacidade: e.capacidade,
            horaInicio: j.horaInicio,
            horaFim: j.horaFim,
            capacidadePadrao: j.capacidade,
          }))}
        />
      );
    }

    const linhas = await db
      .select({ b: bloqueios, j: janelas })
      .from(bloqueios)
      .leftJoin(janelas, eq(janelas.id, bloqueios.janelaId))
      .where(gte(bloqueios.data, hoje))
      .orderBy(asc(bloqueios.data));
    return (
      <Bloqueios
        hoje={hoje}
        janelas={opcoes}
        bloqueios={linhas.map(({ b, j }) => ({
          id: b.id,
          data: b.data,
          janelaId: b.janelaId,
          motivo: b.motivo,
          horaInicio: j?.horaInicio ?? null,
          horaFim: j?.horaFim ?? null,
        }))}
      />
    );
  }

  if (aba === "portes") {
    const lista = await db.select().from(portesCaminhao).orderBy(asc(portesCaminhao.ordem));
    return (
      <EditorPortes
        portes={lista.map((p) => ({
          codigo: p.codigo,
          nome: p.nome,
          descricao: p.descricao,
          imagemUrl: p.imagemUrl,
          pesoVagas: p.pesoVagas,
          ordem: p.ordem,
          ativo: p.ativo,
        }))}
      />
    );
  }

  if (aba === "materiais") {
    const lista = await db.select().from(materiais).orderBy(asc(materiais.ordem));
    return <EditorMateriais materiais={lista} />;
  }

  const { templates, marca, regras } = await getConfig();
  return <EditorTemplates templates={templates} marca={marca} regras={regras} hoje={hoje} appUrl={appUrl() || "https://seu-dominio.com"} />;
}
