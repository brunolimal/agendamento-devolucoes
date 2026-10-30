// Schemas e tipos da configuração (SPEC §7). Sem banco: seguro para importar em componentes cliente.
import { z } from "zod";
import { variaveisDesconhecidas } from "./templates";

export const urlHttp = z
  .string()
  .trim()
  .refine((v) => {
    try {
      return ["http:", "https:"].includes(new URL(v).protocol);
    } catch {
      return false;
    }
  }, "Use um endereço completo, começando com http:// ou https://");

/** Marca (SPEC §13). Validada ao ler e ao salvar. */
export const marcaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(80, "Máximo de 80 caracteres"),
  logo_url: urlHttp.nullable(),
  cor_primaria: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use o formato #rrggbb"),
  whatsapp_empresa: z.string().regex(/^[0-9]{12,13}$/, "WhatsApp com DDI e DDD, só dígitos (12 ou 13 números)"),
  endereco_patio: z.string().trim().min(1, "Informe o endereço do pátio").max(200, "Máximo de 200 caracteres"),
  link_maps: z.union([z.literal(""), urlHttp]),
  texto_boas_vindas: z.string().trim().min(1, "Informe o texto de boas-vindas").max(500, "Máximo de 500 caracteres"),
  regras_aceite: z.string().trim().min(1, "Informe o texto de aceite").max(2000, "Máximo de 2000 caracteres"),
});

const dias = (max: number) => z.number({ error: "Informe um número" }).int("Use um número inteiro").min(0, "Não pode ser negativo").max(max, `Máximo de ${max}`);

/** Regras de negócio (SPEC §6). */
export const regrasSchema = z
  .object({
    antecedencia_min_dias: dias(365),
    antecedencia_max_dias: dias(730).min(1, "Mínimo de 1 dia"),
    prazo_cancel_dias: dias(60),
    sla_decisao_dias: dias(60),
    dias_lembrete: dias(14),
  })
  .refine((r) => r.antecedencia_min_dias <= r.antecedencia_max_dias, {
    message: "A antecedência mínima não pode ser maior que a máxima",
    path: ["antecedencia_min_dias"],
  });

export const TIPOS_TEMPLATE = [
  "confirmacao",
  "recusa",
  "alinhamento",
  "lembrete",
  "reagendamento",
  "cancelamento_empresa",
  "cancelamento_cliente_ok",
] as const;

const textoTemplate = z.string().min(1, "O texto não pode ficar vazio").max(4000, "Máximo de 4000 caracteres");

/** Templates de mensagem (SPEC §11). Variável desconhecida é erro: sairia literal na mensagem. */
export const templatesSchema = z
  .object({
    confirmacao: textoTemplate,
    recusa: textoTemplate,
    alinhamento: textoTemplate,
    lembrete: textoTemplate,
    reagendamento: textoTemplate,
    cancelamento_empresa: textoTemplate,
    cancelamento_cliente_ok: textoTemplate,
  })
  .superRefine((t, ctx) => {
    for (const chave of TIPOS_TEMPLATE) {
      const desconhecidas = variaveisDesconhecidas(t[chave]);
      if (desconhecidas.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: [chave],
          message: `Variável desconhecida: ${desconhecidas.map((v) => `{${v}}`).join(", ")}`,
        });
      }
    }
  });

/** A linha única de `configuracao` (id = 1). */
export const configuracaoSchema = z.object({ marca: marcaSchema, regras: regrasSchema, templates: templatesSchema });

export type Marca = z.infer<typeof marcaSchema>;
export type Regras = z.infer<typeof regrasSchema>;
export type Templates = z.infer<typeof templatesSchema>;
export interface Configuracao {
  marca: Marca;
  regras: Regras;
  templates: Templates;
}
