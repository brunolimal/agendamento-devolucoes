"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** SPEC §10: atualiza a caixa de entrada a cada 60 s e mostra o contador no título da aba. */
export function AtualizaAuto({ pendentes }: { pendentes: number }) {
  const router = useRouter();

  useEffect(() => {
    document.title = pendentes > 0 ? `(${pendentes}) Painel` : "Painel";
  }, [pendentes]);

  useEffect(() => {
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [router]);

  return null;
}
