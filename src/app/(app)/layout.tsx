import { Nav } from "@/components/nav";
import { requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  let pending = 0;
  if (me.role === "admin") {
    const { count } = await (await createClient()).from("authorizations").select("id", { count: "exact", head: true }).eq("status", "pendente");
    pending = count ?? 0;
  }
  return (
    <div className="lg:flex">
      <Nav me={me} pending={pending} />
      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
