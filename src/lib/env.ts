function need(name: string, value: string | undefined) {
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}
export const env = {
  get url() { return need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL); },
  get key() { return need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); },
  get secret() { return need("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY); },
  get site() { return need("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, ""); },
};
