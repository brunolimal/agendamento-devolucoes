import Link from "next/link";
import { getConfig } from "@/lib/config";

export default async function Home() {
  const { marca } = await getConfig();
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-10 text-center">
      {marca.logo_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={marca.logo_url} alt={marca.nome} className="mx-auto h-16 object-contain" />
      )}
      <h1 className="text-3xl font-bold text-primaria">{marca.nome}</h1>
      <p className="text-lg text-slate-700">{marca.texto_boas_vindas}</p>
      <Link
        href="/agendar"
        className="rounded-xl bg-primaria px-6 py-4 text-lg font-semibold text-white shadow active:opacity-90"
      >
        Agendar devolução
      </Link>
    </main>
  );
}
