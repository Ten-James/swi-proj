"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "@/components/app-header";

type Mode = "login" | "register";

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "register" ? { name, email, password } : { email, password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Přihlášení se nezdařilo");
      router.push(data.user.role === "ADMIN" ? "/admin" : "/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Požadavek se nezdařil");
    } finally {
      setSubmitting(false);
    }
  }

  const modeButton = (value: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`h-9 rounded-lg px-3 text-sm font-medium transition ${mode === value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
    >
      {label}
    </button>
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 py-10">
      <Link href="/" className="text-sm text-ink-muted transition hover:text-ink">
        ← Zpět na přehled
      </Link>
      <div className="mt-16 flex items-center gap-3 text-[15px] font-semibold tracking-tight">
        <BrandMark />
        Agent Reservations
      </div>
      <section className="panel mt-6 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{mode === "login" ? "Přihlášení" : "Vytvoření účtu"}</h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          {mode === "login" ? "Přihlaste se ke svým rezervacím." : "Zaregistrujte se pro vytváření rezervací."}
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-xl border border-line bg-surface-2 p-1">
          {modeButton("login", "Přihlášení")}
          {modeButton("register", "Registrace")}
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-4">
          {mode === "register" && (
            <label className="field-label">
              Jméno
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} className="field" autoComplete="name" />
            </label>
          )}
          <label className="field-label">
            E-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" className="field" autoComplete="email" />
          </label>
          <label className="field-label">
            Heslo
            <input value={password} onChange={(event) => setPassword(event.target.value)} required type="password" minLength={8} className="field" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {mode === "register" && <span className="text-xs font-normal text-ink-muted">Minimálně 8 znaků, jedno písmeno a jedna číslice.</span>}
          </label>
          {error && <p className="notice notice-error">{error}</p>}
          <button type="submit" disabled={submitting} className="button-primary mt-1 w-full">
            {submitting ? "Zpracovávám…" : mode === "login" ? "Přihlásit se" : "Vytvořit účet"}
          </button>
        </form>
      </section>

      <p className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-xs text-ink-muted">
        Demo administrátor: <span className="font-mono text-ink">admin@agents.local</span> / <span className="font-mono text-ink">Admin123!</span>
      </p>
    </main>
  );
}
