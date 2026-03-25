"use client";

import { useState, useTransition } from "react";
import { ArrowRight, LockKeyhole, Mail, UserRound } from "lucide-react";
import { IBM_Plex_Mono, Playfair_Display } from "next/font/google";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const displayFont = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-login-display",
});

const monoFont = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-login-mono",
});

type Mode = "login" | "register";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const response = await fetch(
        mode === "login" ? "/api/login" : "/api/register",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        detail?: string;
      };

      if (!response.ok) {
        console.warn("auth request failed", {
          mode,
          status: response.status,
          result,
        });
        toast.error(
          result.detail
            ? `${result.error ?? "Authentication failed."} (${response.status}: ${result.detail})`
            : `${result.error ?? "Authentication failed."} (${response.status})`,
        );
        return;
      }

      toast.success(mode === "login" ? "Signed in." : "Workspace created.");
      router.push("/workspace");
      router.refresh();
    });
  }

  return (
    <div
      className={`${displayFont.variable} ${monoFont.variable} grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]`}
    >
      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(244,180,0,0.28),_transparent_32%),linear-gradient(160deg,_#120f0c_0%,_#1f1712_45%,_#2f2219_100%)] px-6 py-10 text-[#f8f1e7] sm:px-10 lg:px-16">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] opacity-30" />
        <div className="relative flex h-full flex-col justify-between">
          <div className="max-w-xl">
            <div className="mb-10 inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/8 px-4 py-2 text-xs tracking-[0.3em] uppercase backdrop-blur">
              DeerFlow
              <span className="h-1.5 w-1.5 rounded-full bg-[#f0b429]" />
              Multi-User
            </div>
            <h1 className="font-[var(--font-login-display)] text-5xl leading-none sm:text-6xl">
              A private agent workspace for every user.
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-7 text-[#f6e6d1]/78 sm:text-base">
              Login is now tied to a dedicated workspace namespace. Threads,
              uploads, outputs, memory, and agent files are isolated under each
              user&apos;s own DeerFlow virtual directory.
            </p>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-3">
            {[
              ["Scoped Workspace", "Each account gets an isolated workspace key."],
              ["Gateway Guarded", "Gateway and LangGraph only trust signed proxy traffic."],
              ["Postgres Backed", "Users are stored in Prisma-managed PostgreSQL tables."],
            ].map(([title, copy]) => (
              <div
                key={title}
                className="rounded-3xl border border-white/12 bg-black/18 p-5 backdrop-blur"
              >
                <p className="font-[var(--font-login-mono)] text-[11px] uppercase tracking-[0.28em] text-[#f0b429]">
                  {title}
                </p>
                <p className="mt-3 text-sm leading-6 text-[#f6e6d1]/72">
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative flex items-center justify-center bg-[#f5efe6] px-6 py-10 sm:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(173,96,44,0.14),_transparent_36%),linear-gradient(180deg,_transparent,_rgba(44,24,17,0.05))]" />
        <div className="relative w-full max-w-md rounded-[2rem] border border-[#41281b]/10 bg-white/80 p-8 shadow-[0_40px_120px_-56px_rgba(52,31,20,0.9)] backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-[var(--font-login-mono)] text-[11px] uppercase tracking-[0.28em] text-[#8a4b28]">
                Access
              </p>
              <h2 className="mt-2 font-[var(--font-login-display)] text-4xl text-[#23140c]">
                {mode === "login" ? "Sign In" : "Create User"}
              </h2>
            </div>
            <div className="rounded-full border border-[#41281b]/10 bg-[#f5efe6] px-1 py-1">
              <button
                className={`rounded-full px-3 py-2 text-xs transition ${mode === "login" ? "bg-[#23140c] text-white" : "text-[#6d4d39]"}`}
                onClick={() => setMode("login")}
                type="button"
              >
                Login
              </button>
              <button
                className={`rounded-full px-3 py-2 text-xs transition ${mode === "register" ? "bg-[#23140c] text-white" : "text-[#6d4d39]"}`}
                onClick={() => setMode("register")}
                type="button"
              >
                Register
              </button>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            {mode === "register" && (
              <label className="block">
                <span className="mb-2 flex items-center gap-2 text-sm text-[#5c4030]">
                  <UserRound className="h-4 w-4" />
                  Name
                </span>
                <Input
                  className="h-12 rounded-2xl border-[#41281b]/12 bg-white/70"
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  value={name}
                />
              </label>
            )}

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-[#5c4030]">
                <Mail className="h-4 w-4" />
                Email
              </span>
              <Input
                className="h-12 rounded-2xl border-[#41281b]/12 bg-white/70"
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                type="email"
                value={email}
              />
            </label>

            <label className="block">
              <span className="mb-2 flex items-center gap-2 text-sm text-[#5c4030]">
                <LockKeyhole className="h-4 w-4" />
                Password
              </span>
              <Input
                className="h-12 rounded-2xl border-[#41281b]/12 bg-white/70"
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                type="password"
                value={password}
              />
            </label>

            <Button
              className="mt-4 h-12 w-full rounded-2xl bg-[#23140c] text-white hover:bg-[#3b2418]"
              disabled={isPending}
              onClick={submit}
              type="button"
            >
              {isPending
                ? "Processing..."
                : mode === "login"
                  ? "Enter Workspace"
                  : "Create Workspace"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="mt-6 font-[var(--font-login-mono)] text-[11px] leading-5 tracking-[0.18em] text-[#8a6b57] uppercase">
            Workspace folders are mapped to backend <code>.deer-flow/workspaces/&lt;workspace&gt;</code>.
          </p>
        </div>
      </section>
    </div>
  );
}
