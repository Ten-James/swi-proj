"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader, { type SessionUser } from "@/components/app-header";

type ReservationStatus = "PENDING_APPROVAL" | "CONFIRMED" | "CANCELLED" | "REJECTED" | "EXPIRED";

interface AdminReservation {
  id: string;
  status: ReservationStatus;
  startTime: string;
  endTime: string;
  note: string | null;
  user: { id: string; name: string; email: string };
  agent: { id: string; name: string; requiresApproval: boolean };
}

const statusColors: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "bg-amber-100 text-amber-900",
  CONFIRMED: "bg-emerald-100 text-emerald-900",
  CANCELLED: "bg-slate-200 text-slate-800",
  REJECTED: "bg-rose-100 text-rose-900",
  EXPIRED: "bg-violet-100 text-violet-900",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export default function AdminPanel({ user }: { user: SessionUser }) {
  const [reservations, setReservations] = useState<AdminReservation[]>([]);
  const [filter, setFilter] = useState<"PENDING" | "ALL">("PENDING");
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/reservations");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Administraci se nepodařilo načíst");
    setReservations(data);
  }, []);

  useEffect(() => {
    let ignore = false;
    async function loadInitialData() {
      try {
        await load();
      } catch (caught) {
        if (!ignore) {
          setFeedback({
            type: "error",
            text: caught instanceof Error ? caught.message : "Administraci se nepodařilo načíst",
          });
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadInitialData();
    return () => {
      ignore = true;
    };
  }, [load]);

  const displayed = useMemo(
    () => filter === "PENDING" ? reservations.filter((reservation) => reservation.status === "PENDING_APPROVAL") : reservations,
    [filter, reservations],
  );

  async function action(id: string, kind: "APPROVE" | "REJECT" | "CANCEL") {
    setActiveAction(`${id}:${kind}`);
    setFeedback(null);
    try {
      const response = await fetch(
        kind === "CANCEL" ? `/api/reservations/${id}/cancel` : `/api/reservations/${id}/decision`,
        kind === "CANCEL"
          ? { method: "PATCH" }
          : { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: kind }) },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Operace se nezdařila");
      setFeedback({ type: "success", text: `Rezervace byla změněna na ${data.status}.` });
      await load();
    } catch (caught) {
      setFeedback({ type: "error", text: caught instanceof Error ? caught.message : "Operace se nezdařila" });
      await load();
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-14">
      <AppHeader user={user} />
      <section className="flex flex-wrap items-end justify-between gap-4 py-10">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Administrace rezervací</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-300">Schvalování žádostí a přehled všech rezervací.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setFilter("PENDING")} className={filter === "PENDING" ? "button-primary" : "button-secondary"}>Čekající ({reservations.filter((item) => item.status === "PENDING_APPROVAL").length})</button>
          <button type="button" onClick={() => setFilter("ALL")} className={filter === "ALL" ? "button-primary" : "button-secondary"}>Všechny</button>
        </div>
      </section>

      {feedback && <p className={`mb-6 rounded-lg p-4 text-sm ${feedback.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{feedback.text}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Načítám…</p>
      ) : displayed.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">Žádné odpovídající rezervace.</p>
      ) : (
        <div className="grid gap-3">
          {displayed.map((reservation) => (
            <article key={reservation.id} className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{reservation.agent.name}</h2>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusColors[reservation.status]}`}>{reservation.status}</span>
                  </div>
                  <p className="mt-2 text-sm">{formatDate(reservation.startTime)} – {formatDate(reservation.endTime)}</p>
                  <p className="mt-1 text-sm text-gray-500">{reservation.user.name} · {reservation.user.email}</p>
                  {reservation.note && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{reservation.note}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {reservation.status === "PENDING_APPROVAL" && (
                    <>
                      <button type="button" onClick={() => action(reservation.id, "APPROVE")} disabled={activeAction !== null} className="button-primary">Schválit</button>
                      <button type="button" onClick={() => action(reservation.id, "REJECT")} disabled={activeAction !== null} className="button-danger">Zamítnout</button>
                    </>
                  )}
                  {(reservation.status === "CONFIRMED" || reservation.status === "PENDING_APPROVAL") && (
                    <button type="button" onClick={() => action(reservation.id, "CANCEL")} disabled={activeAction !== null} className="button-secondary">Zrušit</button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
