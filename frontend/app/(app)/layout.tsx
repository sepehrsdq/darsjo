import { redirect } from "next/navigation";

import { AppShell } from "@/components/AppShell";
import { ToastProvider } from "@/components/Toast";
import { getSession } from "@/lib/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.mustChangePassword) redirect("/change-password");

  return (
    <ToastProvider>
      <AppShell user={session.user}>{children}</AppShell>
    </ToastProvider>
  );
}
