"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-5 py-10">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-950 dark:hover:text-white">
        ← Zpět na přehled
      </Link>
      <section className="mt-10 rounded-2xl border border-gray-200 p-6 shadow-sm dark:border-gray-800">
        <h1 className="text-2xl font-semibold">{mode === "login" ? "Přihlášení" : "Vytvoření účtu"}</h1>
        <p className="mt-2 text-sm text-gray-500">
          {mode === "login" ? "Přihlaste se ke svým rezervacím." : "Zaregistrujte se pro vytváření rezervací."}
        </p>

        <div className="mt-6 grid grid-cols-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
          <button type="button" onClick={() => setMode("login")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "login" ? "bg-white shadow-sm dark:bg-gray-800" : "text-gray-500"}`}>Přihlášení</button>
          <button type="button" onClick={() => setMode("register")} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === "register" ? "bg-white shadow-sm dark:bg-gray-800" : "text-gray-500"}`}>Registrace</button>
        </div>

        <form onSubmit={submit} className="mt-6 grid gap-4">
          {mode === "register" && (
            <label className="grid gap-1 text-sm font-medium">
              Jméno
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={100} className="field" autoComplete="name" />
            </label>
          )}
          <label className="grid gap-1 text-sm font-medium">
            E-mail
            <input value={email} onChange={(event) => setEmail(event.target.value)} required type="email" className="field" autoComplete="email" />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            Heslo
            <input value={password} onChange={(event) => setPassword(event.target.value)} required type="password" minLength={8} className="field" autoComplete={mode === "login" ? "current-password" : "new-password"} />
            {mode === "register" && <span className="text-xs font-normal text-gray-500">Minimálně 8 znaků, jedno písmeno a jedna číslice.</span>}
          </label>
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={submitting} className="button-primary">
            {submitting ? "Zpracovávám…" : mode === "login" ? "Přihlásit se" : "Vytvořit účet"}
          </button>
        </form>

        <div className="mt-6 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
          Demo administrátor: <strong>admin@agents.local</strong> / <strong>Admin123!</strong>
        </div>
      </section>
    </main>
  );
}
