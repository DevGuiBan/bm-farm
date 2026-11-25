import { Nav } from "@/components/nav";
import { requireStaff } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStaff();
  return (
    <div className="lg:flex">
      <Nav me={me} />
      <main className="mx-auto w-full max-w-7xl min-w-0 px-4 py-8 sm:px-8">{children}</main>
    </div>
  );
}
