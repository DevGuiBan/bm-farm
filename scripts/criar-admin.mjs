// Cria o primeiro administrador: npm run criar-admin -- "Nome Completo" email@empresa.com
import { createClient } from "@supabase/supabase-js";

const [name, rawEmail] = process.argv.slice(2);
if (!name || !rawEmail) {
  console.error('Uso: npm run criar-admin -- "Nome Completo" email@empresa.com');
  process.exit(1);
}
const email = rawEmail.toLowerCase();
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

const { data, error } = await db.auth.admin.generateLink({ type: "invite", email });
if (error) { console.error("Erro:", error.message); process.exit(1); }
const { error: e2 } = await db.from("profiles").insert({ id: data.user.id, full_name: name, email, role: "admin" });
if (e2) { console.error("Erro:", e2.message); process.exit(1); }
console.log("Abra este link para definir a senha:");
console.log(`${process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")}/auth/confirmar?t=${data.properties.hashed_token}&tipo=invite`);
