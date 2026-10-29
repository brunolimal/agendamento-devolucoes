import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { getConfig } from "@/lib/config";
import "./globals.css";

// A marca vem do banco: nenhuma página é gerada estaticamente.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { marca } = await getConfig();
  return { title: marca.nome };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { marca } = await getConfig();
  return (
    <html lang="pt-BR">
      <body style={{ "--cor-primaria": marca.cor_primaria } as CSSProperties}>{children}</body>
    </html>
  );
}
