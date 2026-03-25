import { redirect } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { env } from "@/env";
import { getServerSession } from "@/server/auth/session";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  if (env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true") {
    return <WorkspaceShell queryScopeKey="static-demo">{children}</WorkspaceShell>;
  }
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }
  return (
    <WorkspaceShell queryScopeKey={session.userId}>
      {children}
    </WorkspaceShell>
  );
}
