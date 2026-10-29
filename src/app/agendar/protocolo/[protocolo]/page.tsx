import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { agendamentos } from "@/db/schema";
import { BotaoCopiar } from "@/components/publico/BotaoCopiar";
import { protocoloValido } from "@/lib/protocolo";

// SPEC §9: somente ícone de sucesso, protocolo, "Copiar" e o texto. Nada mais.
export default async function PaginaProtocolo({ params }: { params: Promise<{ protocolo: string }> }) {
  const { protocolo } = await params;
  if (!protocoloValido(protocolo)) notFound();
  const [linha] = await getDb()
    .select({ id: agendamentos.id })
    .from(agendamentos)
    .where(eq(agendamentos.protocolo, protocolo))
    .limit(1);
  if (!linha) notFound();

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-5 px-4 text-center">
      <svg viewBox="0 0 24 24" className="h-20 w-20 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M7.5 12.5l3 3 6-6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="text-4xl font-bold tracking-wide text-primaria">{protocolo}</p>
      <BotaoCopiar texto={protocolo} />
      <p className="text-lg text-slate-700">Recebemos sua solicitação. Nossa equipe vai confirmar pelo WhatsApp.</p>
    </main>
  );
}
