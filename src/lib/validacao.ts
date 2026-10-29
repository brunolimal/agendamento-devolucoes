import { z } from "zod";
import { volumeCarga } from "@/db/schema";
import { normalizarTelefone } from "./telefone";

const texto = (max: number) => z.string().trim().min(1, "Obrigatório").max(max, `Máximo de ${max} caracteres`);
const opcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

export const whatsappSchema = z
  .string()
  .refine((v) => normalizarTelefone(v) !== null, "WhatsApp inválido (use DDD + número)")
  .transform((v) => normalizarTelefone(v) as string);

/** Campos comuns ao envio público e ao agendamento manual do painel. */
export const novoAgendamentoSchema = z.object({
  data: z.iso.date("Data inválida"),
  janelaId: z.number().int().positive(),
  nome: texto(120),
  empresa: texto(120),
  whatsapp: whatsappSchema,
  contrato: texto(60),
  materiais: z.array(z.string().min(1).max(40)).min(1, "Escolha ao menos um material").max(20),
  materiaisOutros: opcional(200),
  volume: z.enum(volumeCarga.enumValues),
  porteCodigo: z.string().min(1).max(40),
  placa: opcional(12),
  motorista: opcional(120),
  observacoes: opcional(500),
});

export const envioPublicoSchema = novoAgendamentoSchema.extend({
  aceite: z.literal(true, "É preciso aceitar as regras"),
  website: z.string().optional(), // honeypot: precisa vir vazio
  inicio: z.string(),
});

export type NovoAgendamento = z.infer<typeof novoAgendamentoSchema>;

export const idSchema = z.uuid();

export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = String(issue.path[0] ?? "_");
    campos[campo] ??= issue.message;
  }
  return campos;
}
