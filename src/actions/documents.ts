"use server";
import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/auth";
import { friendly } from "@/lib/errors";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DOC_LABEL, type Result } from "@/lib/types";

const TYPES: Record<string, { ext: string; magic: number[] }> = {
  "application/pdf": { ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46] },
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
};
const MAX = 10 * 1024 * 1024;
const NO_ACCESS: Result = { error: "Sem acesso a este cliente." };

/** RLS decide se a pessoa enxerga o cliente. */
async function accessTo(client: string) {
  const me = await requireStaff();
  const { data } = await (await createClient()).from("clients").select("id").eq("id", client).maybeSingle();
  return data ? me : null;
}

export async function prepareUpload(client: string, mime: string, size: number): Promise<{ error?: string; path?: string; url?: string }> {
  if (!(await accessTo(client))) return NO_ACCESS;
  if (!Object.hasOwn(TYPES, mime)) return { error: "Envie um arquivo PDF, JPG ou PNG." };
  if (size > MAX) return { error: "O arquivo passa de 10 MB." };
  const path = `${client}/${randomUUID()}.${TYPES[mime].ext}`;
  const { data, error } = await adminClient().storage.from("documentos").createSignedUploadUrl(path);
  return error ? { error: "Não foi possível preparar o envio." } : { path, url: data.signedUrl };
}

export async function finishUpload(client: string, path: string, kind: string, name: string): Promise<Result> {
  const me = await accessTo(client);
  if (!me) return NO_ACCESS;
  const file = path.startsWith(`${client}/`) ? path.slice(client.length + 1) : "";
  if (!Object.hasOwn(DOC_LABEL, kind) || !/^[0-9a-f-]{36}\.(pdf|jpg|png)$/.test(file)) return { error: "Envio inválido." };
  const db = adminClient();
  // Já registrado: nunca reprocessar (nem remover) um original.
  const { data: known } = await db.from("documents").select("id").eq("storage_path", path).limit(1);
  if (known?.length) return { error: "Este arquivo já foi anexado." };
  const bucket = db.storage.from("documentos");
  const { data } = await bucket.download(path);
  if (!data) return { error: "O arquivo não chegou. Envie de novo." };
  const buf = Buffer.from(await data.arrayBuffer());
  const [mime, type] = Object.entries(TYPES).find(([, t]) => path.endsWith(`.${t.ext}`))!;
  if (buf.length > MAX || !type.magic.every((b, i) => buf[i] === b)) {
    await bucket.remove([path]);
    return { error: "O conteúdo não corresponde a um PDF, JPG ou PNG válido." };
  }
  const { error } = await db.rpc("add_document", {
    p_actor: me.id, p_client: client, p_kind: kind, p_path: path, p_name: name.slice(0, 160), p_mime: mime, p_size: buf.length,
    p_sha256: createHash("sha256").update(buf).digest("hex"),
  });
  if (error) {
    await bucket.remove([path]);
    return { error: friendly(error) };
  }
  revalidatePath("/", "layout");
  return { ok: "Documento anexado." };
}
