"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader, { type SessionUser } from "@/components/app-header";
import StatusBadge, { type ReservationStatus } from "@/components/status-badge";
import { formatRange } from "@/lib/format";

interface AdminReservation {
  id: string;
  status: ReservationStatus;
  startTime: string;
  endTime: string;
  note: string | null;
  user: { id: string; name: string; email: string };
  agent: { id: string; name: string; requiresApproval: boolean };
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

  const pendingCount = reservations.filter((reservation) => reservation.status === "PENDING_APPROVAL").length;

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

  const tab = (value: "PENDING" | "ALL", label: string, count?: number) => (
    <button
      type="button"
      onClick={() => setFilter(value)}
      aria-pressed={filter === value}
      className={`flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition ${filter === value ? "bg-surface text-ink shadow-sm" : "text-ink-muted hover:text-ink"}`}
    >
      {label}
      {count !== undefined && <span className="font-mono text-xs text-ink-subtle">{count}</span>}
    </button>
  );

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20">
        <section className="flex flex-wrap items-end justify-between gap-6 pt-14 pb-8">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-ink md:text-5xl">Administrace rezervací</h1>
            <p className="mt-3 text-base text-ink-muted">Schvalování žádostí a přehled všech rezervací.</p>
          </div>
          <div className="flex rounded-xl border border-line bg-surface-2 p-1">
            {tab("PENDING", "Čekající", pendingCount)}
            {tab("ALL", "Všechny", reservations.length)}
          </div>
        </section>

        {feedback && (
          <p role="status" className={`notice mb-6 ${feedback.type === "error" ? "notice-error" : "notice-success"}`}>
            {feedback.text}
          </p>
        )}
        {loading ? (
          <div className="grid gap-3">
            {[0, 1, 2].map((index) => <div key={index} className="skeleton h-28" />)}
          </div>
        ) : displayed.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-ink-muted">
            Žádné odpovídající rezervace.
          </p>
        ) : (
          <div className="panel divide-y divide-line">
            {displayed.map((reservation) => (
              <article key={reservation.id} className="grid gap-4 p-6 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-ink">{reservation.agent.name}</h2>
                    <StatusBadge status={reservation.status} />
                  </div>
                  <p className="mt-2 text-sm font-medium tabular-nums text-ink">{formatRange(reservation.startTime, reservation.endTime)}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {reservation.user.name} <span className="text-ink-subtle">{reservation.user.email}</span>
                  </p>
                  {reservation.note && (
                    <p className="mt-3 border-l-2 border-line-strong pl-3 text-sm text-ink-muted">{reservation.note}</p>
                  )}
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
              </article>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
