export type Role = "admin" | "operador";
export type Profile = { id: string; full_name: string; email: string; role: Role; active: boolean; monthly_goal: number };

export const FLOW = ["documentos", "site", "meta", "verificacao"] as const;
export type FlowStage = (typeof FLOW)[number];
export type Stage = FlowStage | "concluido" | "cancelado";
export const STAGE_LABEL: Record<Stage, string> = {
  documentos: "Documentos", site: "Site", meta: "Meta",
  verificacao: "Verificação", concluido: "Criada", cancelado: "Cancelada",
};
export const PORTFOLIO_LABEL = { novo: "Novo, produzido pelo operador", existente: "Já existia" } as const;
export type Portfolio = keyof typeof PORTFOLIO_LABEL;
export const PRIORITY_LABEL: Record<number, string> = { 1: "Alta", 2: "Normal", 3: "Baixa" };

export type ClientRow = {
  id: string; cnpj: string; legal_name: string; trade_name: string | null; stage: Stage; stage_entered_at: string;
  priority: number; created_at: string; completed_at: string | null; assigned_to: string | null; assigned_name: string | null;
  hours_in_stage: number; portfolio: Portfolio;
};
export type Registry = {
  situacao?: string; cnae?: string; endereco?: string; municipio?: string; uf?: string; cep?: string; email?: string; telefone?: string; inicio?: string;
};
export type Client = {
  id: string; cnpj: string; legal_name: string; trade_name: string | null; registry: Registry; partners: string[];
  contact_name: string; contact_phone: string | null; domain: string | null; public_phone: string | null;
  priority: number; stage: Stage; assigned_to: string | null; portfolio: Portfolio;
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
export type SiteStatus = "rascunho" | "em_aprovacao" | "aprovado" | "ajustes";
export type SiteContent = { headline: string; about: string; services: string[]; hours: string; email: string; metaTag: string };
export type Site = { content: Partial<SiteContent>; status: SiteStatus; client_note: string | null; approved_at: string | null };
export type ChecklistItem = { key: string; stage: Stage; position: number; label: string; done_at: string | null };

export type Metric = {
  operator_id: string; full_name: string; role: Role; active: boolean; monthly_goal: number; completed: number; completed_month: number;
  advances: number; rework: number; avg_hours: number | null; open_now: number;
  actions: number; active_days: number; last_action: string | null;
};
export type Activity = {
  id: number; client_id: string | null; actor_id: string | null; action: string; meta: Record<string, string | number | boolean | null>;
  created_at: string; actor_name: string | null; legal_name: string | null;
};
export type Result = { ok?: string; error?: string; link?: string; ask?: { text: string; value: string } };

export const ACTION_LABEL: Record<string, string> = {
  cliente_criado: "cadastrou a BM", etapa_avanco: "avançou a etapa", etapa_retorno: "devolveu a etapa",
  etapa_cancelamento: "cancelou o processo", etapa_reabertura: "reabriu o processo", responsavel_alterado: "trocou o responsável",
  clientes_transferidos: "transferiu BMs",
  cliente_atualizado: "atualizou os dados", checklist_feito: "concluiu um item", checklist_desfeito: "desmarcou um item",
  anotacao: "fez uma anotação", documento_aprovado: "aprovou um documento",
  documento_recusado: "recusou um documento", documento_enviado: "anexou um documento", documento_visto: "abriu um documento",
  site_rascunho: "salvou o rascunho do site", site_enviado: "marcou o site como enviado ao cliente", site_aprovado: "registrou a aprovação do site",
  site_ajustes: "registrou ajustes pedidos no site", site_baixado: "baixou o site",
  cnpj_reutilizado: "confirmou o uso de um CNPJ repetido", portfolio_alterado: "mudou o tipo de portfólio", membro_atualizado: "alterou um membro da equipe",
  membro_convidado: "convidou um membro", prazo_atualizado: "alterou um prazo", relatorio_exportado: "exportou o relatório",
};
