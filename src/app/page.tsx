"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  capacity: number;
  isActive: boolean;
  requiresApproval: boolean;
}

interface Reservation {
  id: string;
  status: ReservationStatus;
  startTime: string;
  endTime: string;
  agent: {
    id: string;
    name: string;
    requiresApproval: boolean;
  };
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
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed with status ${response.status}`);
  }
  return data as T;
}

function formatDate(value: string | number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("Demo User");
  const [email, setEmail] = useState("demo@agents.local");
  const [adminEmail, setAdminEmail] = useState("admin@agents.local");
  const [agentId, setAgentId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [availability, setAvailability] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const loadReservations = useCallback(async () => {
    const data = await requestJson<Reservation[]>("/api/reservations");
    setReservations(data);
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadInitialData() {
      try {
        const [agentData, reservationData] = await Promise.all([
          requestJson<Agent[]>("/api/agents"),
          requestJson<Reservation[]>("/api/reservations"),
        ]);
        if (ignore) return;
        setAgents(agentData);
        setReservations(reservationData);
        setAgentId(agentData[0]?.id ?? "");
      } catch (caught) {
        if (!ignore) {
          setLoadError(caught instanceof Error ? caught.message : "Failed to load data");
        }
      } finally {
        if (!ignore) setLoading(false);
      }
    }

    void loadInitialData();
    return () => {
      ignore = true;
    };
  }, []);

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
      throw new Error("Enter a valid start and end time");
    }
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }

  async function checkAvailability() {
    resetFeedback();
    setAvailability(null);
    try {
      const interval = intervalAsIso();
      const query = new URLSearchParams({ agentId, ...interval });
      const data = await requestJson<{ availability: string }>(`/api/availability?${query}`);
      setAvailability(data.availability);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Availability check failed");
    }
  }

  async function createReservation(event: React.FormEvent) {
    event.preventDefault();
    resetFeedback();
    setSubmitting(true);
    try {
      const interval = intervalAsIso();
      const data = await requestJson<{ id: string; status: ReservationStatus }>(
        "/api/reservations",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, agentId, ...interval, note: note || undefined }),
        },
      );
      setResult(`Reservation ${data.id} created as ${data.status}.`);
      setNote("");
      await loadReservations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Reservation failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelReservation(id: string) {
    resetFeedback();
    setActiveAction(`${id}:cancel`);
    try {
      const data = await requestJson<{ status: ReservationStatus }>(
        `/api/reservations/${id}/cancel`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        },
      );
      setResult(`Reservation changed to ${data.status}.`);
      await loadReservations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Cancellation failed");
      await loadReservations();
    } finally {
      setActiveAction(null);
    }
  }

  async function decideReservation(id: string, decision: "APPROVE" | "REJECT") {
    resetFeedback();
    setActiveAction(`${id}:${decision}`);
    try {
      const data = await requestJson<{ status: ReservationStatus }>(
        `/api/reservations/${id}/decision`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adminEmail, decision }),
        },
      );
      setResult(`Reservation changed to ${data.status}.`);
      await loadReservations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision failed");
      await loadReservations();
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-5 py-10">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          C02 executable specification
        </p>
        <h1 className="mt-2 text-3xl font-semibold">AI Agent Reservations</h1>
        <p className="mt-2 max-w-3xl text-sm text-gray-600 dark:text-gray-300">
          Immediate validation, exclusive time slots, optional Admin approval and a global
          read-only schedule. No intermediate draft state is used.
        </p>
      </header>

      {loadError && <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{loadError}</p>}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Agents</h2>
            <p className="text-sm text-gray-500">Every Agent is an exclusive Resource.</p>
          </div>
          {loading && <span className="text-sm text-gray-500">Loading…</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {agents.map((agent) => (
            <article key={agent.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{agent.name}</h3>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    agent.requiresApproval
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
                  }`}
                >
                  {agent.requiresApproval ? "Admin approval" : "Immediate confirm"}
                </span>
              </div>
              {agent.description && <p className="mt-2 text-sm text-gray-500">{agent.description}</p>}
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <h2 className="mb-4 text-xl font-semibold">Create Reservation</h2>
          <form onSubmit={createReservation} className="grid gap-4 rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Your name
                <input required value={name} onChange={(event) => setName(event.target.value)} className="field" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                Your email
                <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="field" />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Agent
              <select required value={agentId} onChange={(event) => setAgentId(event.target.value)} className="field">
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">
                Start time
                <input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="field" />
              </label>
              <label className="grid gap-1 text-sm font-medium">
                End time
                <input required type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="field" />
              </label>
            </div>
            <label className="grid gap-1 text-sm font-medium">
              Note (optional)
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="field" />
            </label>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={checkAvailability} className="button-secondary">
                Check Availability
              </button>
              <button type="submit" disabled={submitting || !agentId} className="button-primary">
                {submitting ? "Creating…" : "Create Reservation"}
              </button>
            </div>
            {availability && (
              <p className={`text-sm font-semibold ${availability === "AVAILABLE" ? "text-emerald-700" : "text-rose-700"}`}>
                Availability: {availability}
              </p>
            )}
          </form>
        </div>

        <aside>
          <h2 className="mb-4 text-xl font-semibold">Admin decision</h2>
          <div className="rounded-xl border border-gray-200 p-5 dark:border-gray-800">
            <label className="grid gap-1 text-sm font-medium">
              Authorized Admin email
              <input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="field" />
            </label>
            <p className="mt-3 text-xs text-gray-500">
              Seeded demonstration Admin: admin@agents.local
            </p>
          </div>
        </aside>
      </section>

      {(result || error) && (
        <section className={`rounded-lg p-4 text-sm ${error ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
          {error ?? result}
        </section>
      )}

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Global Reservation Gantt</h2>
          <p className="text-sm text-gray-500">
            All Reservation intervals are visible; owner identity is not exposed.
          </p>
        </div>
        {!timeline ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            No Reservations yet.
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
                    <div
                      className="relative rounded-md bg-gray-100 dark:bg-gray-900"
                      style={{ height: Math.max(46, agentReservations.length * 30 + 12) }}
                    >
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

      <section>
        <h2 className="mb-4 text-xl font-semibold">Reservation operations</h2>
        <div className="grid gap-3">
          {reservations.map((reservation) => (
            <article key={reservation.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-800">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{reservation.agent.name}</h3>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusColors[reservation.status]}`}>
                      {reservation.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    {formatDate(reservation.startTime)} – {formatDate(reservation.endTime)}
                  </p>
                  <p className="mt-1 font-mono text-xs text-gray-400">{reservation.id}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(reservation.status === "CONFIRMED" || reservation.status === "PENDING_APPROVAL") && (
                    <button
                      type="button"
                      onClick={() => cancelReservation(reservation.id)}
                      disabled={activeAction !== null}
                      className="button-secondary"
                    >
                      Cancel as User
                    </button>
                  )}
                  {reservation.status === "PENDING_APPROVAL" && (
                    <>
                      <button
                        type="button"
                        onClick={() => decideReservation(reservation.id, "APPROVE")}
                        disabled={activeAction !== null}
                        className="button-primary"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => decideReservation(reservation.id, "REJECT")}
                        disabled={activeAction !== null}
                        className="button-danger"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
