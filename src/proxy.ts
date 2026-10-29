import { NextResponse } from "next/server";

// Placeholder: proteção de /painel/* (exceto /painel/login) entra na etapa de auth.
// Next 16 renomeou middleware.ts para proxy.ts.
export function proxy() {
  return NextResponse.next();
}
