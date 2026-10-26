"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
}

const markColors = ["#059669", "#fbbf24", "#059669", "#a1a1aa", "#059669", "#e11d48"];

export function BrandMark() {
  return (
    <span aria-hidden className="grid grid-cols-3 gap-[3px]">
      {markColors.map((color, index) => (
        <span key={index} className="size-[7px] rounded-[2px]" style={{ background: color }} />
      ))}
    </span>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function AppHeader({ user }: { user: SessionUser | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const navLink = (href: string, label: string) => (
    <Link
      href={href}
      aria-current={pathname === href ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 transition ${pathname === href ? "bg-surface-2 text-ink" : "text-ink-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="flex items-center gap-3 text-[15px] font-semibold tracking-tight">
          <BrandMark />
          Agent Reservations
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {navLink("/", "Přehled")}
          {user?.role === "ADMIN" && navLink("/admin", "Administrace")}
          {user ? (
            <>
              <span className="ml-3 flex items-center gap-2 text-ink">
                <span className="grid size-7 place-items-center rounded-full bg-ink font-mono text-[11px] font-medium text-canvas">
                  {initials(user.name)}
                </span>
                <span className="hidden sm:inline">{user.name}</span>
              </span>
              <button type="button" onClick={logout} disabled={loggingOut} className="button-secondary ml-3 h-9">
                {loggingOut ? "Odhlašuji…" : "Odhlásit"}
              </button>
            </>
          ) : (
            <Link href="/login" className="button-primary ml-3 h-9">
              Přihlásit se
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
