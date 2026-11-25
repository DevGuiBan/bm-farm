import { getProfile } from "@/lib/auth";
import { renderSite } from "@/lib/site-template";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** O download exige conteúdo aprovado pelo cliente. A prévia abre isolada e sem baixar. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me) return new Response("Sem acesso", { status: 401 });
  const { id } = await params;
  const db = await createClient();
  const [{ data: c }, { data: s }] = await Promise.all([
    db.from("clients").select("*").eq("id", id).maybeSingle(),
    db.from("sites").select("*").eq("client_id", id).maybeSingle(),
  ]);
  if (!c || !s) return new Response("Não encontrado", { status: 404 });
  const preview = new URL(request.url).searchParams.has("previa");
  if (!preview && s.status !== "aprovado") return new Response("Falta a aprovação do conteúdo pelo cliente", { status: 403 });
  const address = [c.registry.endereco, c.registry.municipio, c.registry.uf].filter(Boolean).join(", ");
  const html = renderSite({ ...c, address }, s.content);
  if (preview) return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" },
  });
  const { error } = await adminClient().from("activity_log").insert({ actor_id: me.id, client_id: id, action: "site_baixado" });
  if (error) return new Response("Não foi possível registrar o acesso", { status: 500 });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "content-disposition": 'attachment; filename="index.html"' },
  });
}
