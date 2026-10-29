"use client";

import { useActionState } from "react";
import { entrar, type EstadoLogin } from "@/app/painel/login/actions";

export function FormLogin() {
  const [estado, acao, pendente] = useActionState<EstadoLogin, FormData>(entrar, {});

  return (
    <form action={acao} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Senha</span>
        <input
          type="password"
          name="senha"
          autoComplete="current-password"
          autoFocus
          required
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-primaria focus:ring-2 focus:ring-primaria/30"
        />
      </label>
      {estado.erro && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-800 ring-1 ring-red-200">
          {estado.erro}
        </p>
      )}
      <button
        type="submit"
        disabled={pendente}
        className="w-full rounded-xl bg-primaria px-5 py-4 text-lg font-semibold text-white disabled:opacity-50"
      >
        {pendente ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
