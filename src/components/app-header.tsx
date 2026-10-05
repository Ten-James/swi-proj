"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}

export default function AppHeader({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 py-5 dark:border-gray-800">
      <Link href="/" className="text-lg font-semibold tracking-tight">
        Agent Reservations
      </Link>
      <nav className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/" className="text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
          Přehled
        </Link>
        {user?.role === "ADMIN" && (
          <Link href="/admin" className="text-gray-600 hover:text-gray-950 dark:text-gray-300 dark:hover:text-white">
            Administrace
          </Link>
        )}
        {user ? (
          <>
            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {user.name}
            </span>
            <button type="button" onClick={logout} disabled={loggingOut} className="button-secondary">
              {loggingOut ? "Odhlašuji…" : "Odhlásit"}
            </button>
          </>
        ) : (
          <Link href="/login" className="button-primary">
            Přihlásit se
          </Link>
        )}
      </nav>
    </header>
  );
}
