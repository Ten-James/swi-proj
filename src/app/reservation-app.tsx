"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader, { type SessionUser } from "@/components/app-header";

type ReservationStatus =
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  requiresApproval: boolean;
}

interface Reservation {
  id: string;
  status: ReservationStatus;
  startTime: string;
  endTime: string;
  note?: string | null;
  agent: { id: string; name: string; requiresApproval: boolean };
}

const statusColors: Record<ReservationStatus, string> = {
  PENDING_APPROVAL: "bg-amber-400 text-amber-950",
  CONFIRMED: "bg-emerald-600 text-white",
  CANCELLED: "bg-slate-400 text-white",
  REJECTED: "bg-rose-600 text-white",
  EXPIRED: "bg-violet-600 text-white",
};

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed with status ${response.status}`);
  return data as T;
}

function formatDate(value: string | number) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function ReservationApp({ user }: { user: SessionUser | null }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const reloadReservations = useCallback(async () => {
    const [globalData, mineData] = await Promise.all([
      requestJson<Reservation[]>("/api/reservations"),
      user ? requestJson<Reservation[]>("/api/reservations/mine") : Promise.resolve([]),
    ]);
    setReservations(globalData);
    setMyReservations(mineData);
  }, [user]);

  useEffect(() => {
    let ignore = false;
    async function load() {
      try {
        const [agentData, globalData, mineData] = await Promise.all([
          requestJson<Agent[]>("/api/agents"),
          requestJson<Reservation[]>("/api/reservations"),
          user ? requestJson<Reservation[]>("/api/reservations/mine") : Promise.resolve([]),
        ]);
        if (ignore) return;
        setAgents(agentData);
        setReservations(globalData);
        setMyReservations(mineData);
        setAgentId(agentData[0]?.id ?? "");
      } catch (caught) {
        if (!ignore) {
          setLoadError(caught instanceof Error ? caught.message : "Data se nepodařilo načíst");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [user]);

  const timeline = useMemo(() => {
    if (reservations.length === 0) return null;
    const starts = reservations.map((reservation) => new Date(reservation.startTime).getTime());
    const ends = reservations.map((reservation) => new Date(reservation.endTime).getTime());
    const min = Math.min(...starts);
    const max = Math.max(...ends);
    const span = Math.max(max - min, 60_000);
    const grouped = agents
      .map((agent) => ({
        agent,
        reservations: reservations.filter((reservation) => reservation.agent.id === agent.id),
      }))
      .filter((group) => group.reservations.length > 0);
    const ticks = Array.from({ length: 5 }, (_, index) => min + (span * index) / 4);
    return { min, span, grouped, ticks };
  }, [agents, reservations]);

  function resetFeedback() {
    setError(null);
    setResult(null);
  }

  function intervalAsIso() {
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Zadejte platný začátek a konec rezervace");
    }
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  async function checkAvailability() {
    resetFeedback();
    setAvailability(null);
    try {
      const query = new URLSearchParams({ agentId, ...intervalAsIso() });
      const data = await requestJson<{ availability: string }>(`/api/availability?${query}`);
      setAvailability(data.availability);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Dostupnost se nepodařilo ověřit");
    }
  }

  async function createReservation(event: React.FormEvent) {
    event.preventDefault();
    resetFeedback();
    setSubmitting(true);
    try {
      const data = await requestJson<{ id: string; status: ReservationStatus }>(
        "/api/reservations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, ...intervalAsIso(), note: note || undefined }),
        },
      );
      setResult(`Rezervace byla vytvořena ve stavu ${data.status}.`);
      setNote("");
      await reloadReservations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rezervaci se nepodařilo vytvořit");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelReservation(id: string) {
    resetFeedback();
    setActiveAction(id);
    try {
      const data = await requestJson<{ status: ReservationStatus }>(
        `/api/reservations/${id}/cancel`,
        { method: "PATCH" },
      );
      setResult(`Rezervace byla změněna na ${data.status}.`);
      await reloadReservations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rezervaci se nepodařilo zrušit");
      await reloadReservations();
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-5 pb-14">
      <AppHeader user={user} />

      <section className="py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Rezervace AI agentů</h1>
        <p className="mt-2 max-w-2xl text-gray-600 dark:text-gray-300">
          Vyberte agenta, ověřte jeho dostupnost a rezervujte si čas pro svou práci.
        </p>
      </section>

      {loadError && <p className="mb-8 rounded-lg bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Dostupní agenti</h2>
            <p className="text-sm text-gray-500">
              Každého agenta lze v jednom čase rezervovat pouze jednou.
            </p>
          </div>
          {loading && <span className="text-sm text-gray-500">Načítám…</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((agent) => (
            <article key={agent.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{agent.name}</h3>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${agent.requiresApproval ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                  {agent.requiresApproval ? "Vyžaduje schválení" : "Okamžité potvrzení"}
                </span>
              </div>
              {agent.description && <p className="mt-2 text-sm text-gray-500">{agent.description}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-4 text-xl font-semibold">Přehled rezervací</h2>
        {!timeline ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            Zatím nejsou vytvořené žádné rezervace.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="min-w-[760px]">
              <div className="ml-40 flex justify-between text-[11px] text-gray-500">
                {timeline.ticks.map((tick) => <span key={tick}>{formatDate(tick)}</span>)}
              </div>
              <div className="mt-2 grid gap-2">
                {timeline.grouped.map(({ agent, reservations: agentReservations }) => (
                  <div key={agent.id} className="grid grid-cols-[150px_1fr] gap-3">
                    <div className="pt-3 text-sm font-medium">{agent.name}</div>
                    <div className="relative rounded-md bg-gray-100 dark:bg-gray-900" style={{ height: Math.max(46, agentReservations.length * 30 + 12) }}>
                      {agentReservations.map((reservation, index) => {
                        const start = new Date(reservation.startTime).getTime();
                        const end = new Date(reservation.endTime).getTime();
                        const left = ((start - timeline.min) / timeline.span) * 100;
                        const width = Math.max(((end - start) / timeline.span) * 100, 2);
                        return (
                          <div
                            key={reservation.id}
                            className={`absolute h-6 overflow-hidden rounded px-2 py-1 text-[10px] font-semibold ${statusColors[reservation.status]}`}
                            style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, top: index * 30 + 8 }}
                            title={`${reservation.status}: ${formatDate(reservation.startTime)} – ${formatDate(reservation.endTime)}`}
                          >
                            {reservation.status}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {user ? (
        <section className="mt-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h2 className="mb-4 text-xl font-semibold">Nová rezervace</h2>
            <form onSubmit={createReservation} className="grid gap-4 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
              <label className="grid gap-1 text-sm font-medium">
                Agent
                <select required value={agentId} onChange={(event) => setAgentId(event.target.value)} className="field">
                  {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm font-medium">Začátek<input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="field" /></label>
                <label className="grid gap-1 text-sm font-medium">Konec<input required type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="field" /></label>
              </div>
              <label className="grid gap-1 text-sm font-medium">Poznámka (volitelné)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="field" /></label>
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={checkAvailability} className="button-secondary">Ověřit dostupnost</button>
                <button type="submit" disabled={submitting || !agentId} className="button-primary">{submitting ? "Vytvářím…" : "Vytvořit rezervaci"}</button>
              </div>
              {availability && <p className={`text-sm font-semibold ${availability === "AVAILABLE" ? "text-emerald-700" : "text-rose-700"}`}>Dostupnost: {availability === "AVAILABLE" ? "volná" : "obsazená"}</p>}
            </form>
          </div>

          <div>
            <h2 className="mb-4 text-xl font-semibold">Moje rezervace</h2>
            <div className="grid gap-3">
              {myReservations.length === 0 && <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-500">Nemáte žádné rezervace.</p>}
              {myReservations.map((reservation) => (
                <article key={reservation.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium">{reservation.agent.name}</h3>
                        <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusColors[reservation.status]}`}>{reservation.status}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-500">{formatDate(reservation.startTime)} – {formatDate(reservation.endTime)}</p>
                    </div>
                    {(reservation.status === "CONFIRMED" || reservation.status === "PENDING_APPROVAL") && (
                      <button type="button" onClick={() => cancelReservation(reservation.id)} disabled={activeAction !== null} className="button-secondary">Zrušit</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-10 rounded-2xl bg-gray-950 px-6 py-8 text-white dark:bg-gray-100 dark:text-gray-950">
          <h2 className="text-xl font-semibold">Chcete vytvořit rezervaci?</h2>
          <p className="mt-2 text-sm text-gray-300 dark:text-gray-600">
            Přihlaste se nebo si během chvíle vytvořte účet.
          </p>
          <Link href="/login" className="mt-5 inline-block rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-950 dark:bg-gray-950 dark:text-white">
            Přihlášení a registrace
          </Link>
        </section>
      )}

      {(result || error) && <section className={`mt-8 rounded-lg p-4 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>{error ?? result}</section>}
    </main>
  );
}
