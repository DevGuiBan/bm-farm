export type Role = "admin" | "operador";
export type Profile = { id: string; full_name: string; email: string; role: Role; active: boolean; monthly_goal: number };

export const FLOW = ["autorizacao", "documentos", "site", "meta", "verificacao"] as const;
export type FlowStage = (typeof FLOW)[number];
export type Stage = FlowStage | "concluido" | "cancelado";
export const STAGE_LABEL: Record<Stage, string> = {
  autorizacao: "Autorização", documentos: "Documentos", site: "Site", meta: "Meta",
  verificacao: "Verificação", concluido: "Concluído", cancelado: "Cancelado",
};
export const PRIORITY_LABEL: Record<number, string> = { 1: "Alta", 2: "Normal", 3: "Baixa" };

export type ClientRow = {
  id: string; cnpj: string; legal_name: string; trade_name: string | null; stage: Stage; stage_entered_at: string;
  priority: number; created_at: string; completed_at: string | null; assigned_to: string | null; assigned_name: string | null;
  sla_hours: number | null; counts_for_operator: boolean | null; hours_in_stage: number; late: boolean;
};
export type Registry = {
  situacao?: string; cnae?: string; endereco?: string; municipio?: string; uf?: string; cep?: string; email?: string; telefone?: string; inicio?: string;
};
export type Client = {
  id: string; cnpj: string; legal_name: string; trade_name: string | null; registry: Registry; partners: string[];
  contact_name: string; contact_email: string; contact_phone: string | null; domain: string | null; public_phone: string | null;
  priority: number; stage: Stage; assigned_to: string | null;
};

export const DOC_LABEL = {
  contrato_social: "Contrato social", comprovante_endereco: "Comprovante de endereço",
  documento_signatario: "Documento do signatário", procuracao: "Procuração",
  aprovacao_site: "Print da aprovação do site", outro: "Outro",
} as const;
export type DocKind = keyof typeof DOC_LABEL;
export type ReviewStatus = "pendente" | "aprovado" | "recusado" | "revogado";
export type Doc = {
  id: string; client_id: string; kind: DocKind; file_name: string; size_bytes: number; sha256: string; uploaded_by: string; uploaded_at: string;
  status: ReviewStatus; review_note: string | null; storage_path: string; mime: string;
};
export type Authorization = {
  id: string; signer_name: string; signer_role: string; signed_at: string; status: ReviewStatus; signer_in_registry: boolean;
  review_note: string | null; terms_version: string; domain: string; public_phone: string;
};
export type SiteStatus = "rascunho" | "em_aprovacao" | "aprovado" | "ajustes";
export type SiteContent = { headline: string; about: string; services: string[]; hours: string; email: string; metaTag: string };
export type Site = { content: Partial<SiteContent>; status: SiteStatus; client_note: string | null; approved_at: string | null };
export type ChecklistItem = { key: string; stage: Stage; position: number; label: string; done_at: string | null };

export type Metric = {
  operator_id: string; full_name: string; role: Role; active: boolean; monthly_goal: number; completed: number; completed_month: number;
  advances: number; rework: number; sla_ok: number; sla_total: number; avg_hours: number | null; open_now: number; late_now: number;
  actions: number; active_days: number; last_action: string | null;
};
export type QueueRow = {
  id: string; client_id: string; legal_name: string; cnpj: string; partners: string[]; signer_name: string; signer_role: string;
  signer_email: string; domain: string; public_phone: string; ip: string | null; signed_at: string; signer_in_registry: boolean;
  has_power_of_attorney: boolean; same_email: number; same_ip: number; same_domain: number; same_phone: number;
  assigned_name: string | null; is_mine: boolean; registry_email: string | null; registry_phone: string | null;
};
export type Activity = {
  id: number; client_id: string | null; actor_id: string | null; action: string; meta: Record<string, string | number | boolean | null>;
  created_at: string; actor_name: string | null; legal_name: string | null;
};
export type Result = { ok?: string; error?: string; link?: string };

export const ACTION_LABEL: Record<string, string> = {
  cliente_criado: "cadastrou o cliente", etapa_avanco: "avançou a etapa", etapa_retorno: "devolveu a etapa",
  etapa_cancelamento: "cancelou o processo", etapa_reabertura: "reabriu o processo", responsavel_alterado: "trocou o responsável",
  clientes_transferidos: "transferiu clientes",
  cliente_atualizado: "atualizou os dados", checklist_feito: "concluiu um item", checklist_desfeito: "desmarcou um item",
  anotacao: "fez uma anotação", convite_gerado: "gerou o link de assinatura", documento_aprovado: "aprovou um documento",
  documento_recusado: "recusou um documento", documento_enviado: "anexou um documento", documento_visto: "abriu um documento",
  site_rascunho: "salvou o rascunho do site", site_enviado: "marcou o site como enviado ao cliente", site_aprovado: "registrou a aprovação do site",
  site_ajustes: "registrou ajustes pedidos no site", site_baixado: "baixou o site", autorizacao_assinada: "assinou a autorização",
  autorizacao_aprovada: "aprovou a autorização", autorizacao_recusada: "recusou a autorização",
  autorizacao_revogada: "revogou a autorização", membro_atualizado: "alterou um membro da equipe",
  membro_convidado: "convidou um membro", prazo_atualizado: "alterou um prazo", relatorio_exportado: "exportou o relatório",
};
