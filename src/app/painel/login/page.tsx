import { redirect } from "next/navigation";
import { FormLogin } from "@/components/painel/FormLogin";
import { modoDemo, temSessao } from "@/lib/auth";
import { getConfig } from "@/lib/config";

export default async function PaginaLogin() {
  if (await temSessao()) redirect("/painel");
  const { marca } = await getConfig();
  const senhaDemo = modoDemo() ? process.env.DEMO_ADMIN_PASSWORD : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-center text-2xl font-bold text-primaria">{marca.nome}</h1>
      <p className="text-center text-slate-600">Painel da logística</p>
      <FormLogin />
      {senhaDemo && (
        <p className="rounded-xl bg-yellow-50 p-3 text-center text-sm text-yellow-900 ring-1 ring-yellow-200">
          Ambiente de demonstração. Senha: <strong>{senhaDemo}</strong>
        </p>
      )}
    </main>
  );
}
