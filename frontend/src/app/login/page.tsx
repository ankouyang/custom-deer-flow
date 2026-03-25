import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { getServerSession } from "@/server/auth/session";

export default async function LoginPage() {
  const session = await getServerSession();
  if (session) {
    redirect("/workspace");
  }
  return <LoginForm />;
}
