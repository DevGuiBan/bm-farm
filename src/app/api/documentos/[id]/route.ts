import { getProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** RLS decide se a pessoa vê o documento; o acesso é registrado antes da URL curta. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getProfile();
  if (!me) return new Response("Sem acesso", { status: 401 });
  const { id } = await params;
  const { data: d } = await (await createClient()).from("documents").select("*").eq("id", id).maybeSingle();
  if (!d) return new Response("Não encontrado", { status: 404 });
  const admin = adminClient();
  const { error } = await admin.from("activity_log").insert({
    actor_id: me.id, client_id: d.client_id, action: "documento_visto", meta: { arquivo: d.file_name },
  });
  if (error) return new Response("Não foi possível registrar o acesso", { status: 500 });
  const { data } = await admin.storage.from("documentos").createSignedUrl(d.storage_path, 60);
  return data ? Response.redirect(data.signedUrl, 302) : new Response("Arquivo indisponível", { status: 404 });
}
