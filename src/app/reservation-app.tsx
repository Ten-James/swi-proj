"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader, { type SessionUser } from "@/components/app-header";
import StatusBadge, { reservationStatuses, type ReservationStatus } from "@/components/status-badge";
import { formatDay, formatRange, formatTime } from "@/lib/format";

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

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `Request failed with status ${response.status}`);
  return data as T;
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
    // Group by the Reservation's own Agent: /api/agents lists only active Agents,
    // but the overview must also show Reservations of deactivated ones.
    const byAgent = new Map<string, { agent: Reservation["agent"]; reservations: Reservation[] }>();
    for (const reservation of reservations) {
      const group = byAgent.get(reservation.agent.id);
      if (group) group.reservations.push(reservation);
      else byAgent.set(reservation.agent.id, { agent: reservation.agent, reservations: [reservation] });
    }
    const grouped = [...byAgent.values()];
    const ticks = Array.from({ length: 5 }, (_, index) => min + (span * index) / 4);
    const singleDay = new Date(min).toDateString() === new Date(max).toDateString();
    return { min, span, grouped, ticks, singleDay };
  }, [reservations]);

  const summary = useMemo(
    () => ({
      confirmed: reservations.filter((reservation) => reservation.status === "CONFIRMED").length,
      pending: reservations.filter((reservation) => reservation.status === "PENDING_APPROVAL").length,
    }),
    [reservations],
  );

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
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl px-5 pb-20">
        <section className="grid gap-8 pt-14 pb-10 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-ink md:text-5xl">Rezervace AI agentů</h1>
            <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-muted">
              Vyberte agenta, ověřte jeho dostupnost a rezervujte si čas pro svou práci.
            </p>
          </div>
          <dl className="flex divide-x divide-line rounded-xl border border-line bg-surface">
            {[
              ["Agenti", agents.length],
              ["Potvrzené", summary.confirmed],
              ["Čekající", summary.pending],
            ].map(([label, value]) => (
              <div key={label} className="px-6 py-3">
                <dt className="text-xs text-ink-subtle">{label}</dt>
                <dd className="mt-0.5 font-mono text-2xl font-medium tabular-nums text-ink">{loading ? "-" : value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {loadError && <p className="notice notice-error mb-8">{loadError}</p>}

        <section>
          <div className="mb-4">
            <h2 className="text-lg font-semibold tracking-tight">Dostupní agenti</h2>
            <p className="mt-1 text-sm text-ink-muted">Každého agenta lze v jednom čase rezervovat pouze jednou.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {loading && [0, 1, 2, 3].map((index) => <div key={index} className="skeleton h-[92px]" />)}
            {agents.map((agent) => (
              <article key={agent.id} className="panel p-5 transition hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-medium text-ink">{agent.name}</h3>
                  <span className={`status font-sans text-xs tracking-normal ${agent.requiresApproval ? "status-PENDING_APPROVAL" : "status-CONFIRMED"}`}>
                    {agent.requiresApproval ? "Vyžaduje schválení" : "Okamžité potvrzení"}
                  </span>
                </div>
                {agent.description && <p className="mt-2 text-sm text-ink-muted">{agent.description}</p>}
              </article>
            ))}
          </div>
        </section>

        <section className="mt-14">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Přehled rezervací</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {timeline?.singleDay ? formatDay(timeline.min) : "Obsazenost agentů v čase."}
              </p>
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted">
              {reservationStatuses.map((status) => (
                <li key={status} className="flex items-center gap-1.5 font-mono">
                  <span className={`size-2.5 rounded-[3px] bar-${status}`} />
                  {status}
                </li>
              ))}
            </ul>
          </div>
          {loading ? (
            <div className="skeleton h-64" />
          ) : !timeline ? (
            <p className="rounded-xl border border-dashed border-line-strong p-10 text-center text-sm text-ink-muted">
              Zatím nejsou vytvořené žádné rezervace.
            </p>
          ) : (
            <div className="panel overflow-x-auto p-5">
              <div className="min-w-[760px]">
                <div className="relative ml-[168px] h-5 font-mono text-[11px] text-ink-subtle">
                  {timeline.ticks.map((tick, index) => (
                    <span
                      key={tick}
                      className="absolute top-0 -translate-x-1/2 whitespace-nowrap first:translate-x-0 last:-translate-x-full"
                      style={{ left: `${index * 25}%` }}
                    >
                      {timeline.singleDay ? formatTime(tick) : `${formatDay(tick)} ${formatTime(tick)}`}
                    </span>
                  ))}
                </div>
                <div className="mt-3 grid gap-2">
                  {timeline.grouped.map(({ agent, reservations: agentReservations }) => (
                    <div key={agent.id} className="grid grid-cols-[156px_1fr] items-start gap-3">
                      <div className="pt-3 text-sm font-medium text-ink">{agent.name}</div>
                      <div
                        className="relative rounded-lg bg-surface-2"
                        style={{ height: Math.max(48, agentReservations.length * 34 + 14) }}
                      >
                        {[25, 50, 75].map((position) => (
                          <span key={position} className="absolute inset-y-0 w-px bg-line" style={{ left: `${position}%` }} />
                        ))}
                        {agentReservations.map((reservation, index) => {
                          const start = new Date(reservation.startTime).getTime();
                          const end = new Date(reservation.endTime).getTime();
                          const left = ((start - timeline.min) / timeline.span) * 100;
                          const width = Math.max(((end - start) / timeline.span) * 100, 2);
                          return (
                            <div
                              key={reservation.id}
                              className={`absolute h-7 truncate rounded-md px-2.5 font-mono text-[11px] font-medium leading-7 shadow-sm bar-${reservation.status}`}
                              style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%`, top: index * 34 + 10 }}
                              title={`${reservation.status}: ${formatRange(reservation.startTime, reservation.endTime)}`}
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
          <section className="mt-14">
            {(result || error) && (
              <p role="status" className={`notice mb-6 ${error ? "notice-error" : "notice-success"}`}>
                {error ?? result}
              </p>
            )}
            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
              <form onSubmit={createReservation} className="panel grid gap-5 p-6">
                <h2 className="text-lg font-semibold tracking-tight">Nová rezervace</h2>
                <label className="field-label">
                  Agent
                  <select required value={agentId} onChange={(event) => setAgentId(event.target.value)} className="field">
                    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="field-label">Začátek<input required type="datetime-local" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="field" /></label>
                  <label className="field-label">Konec<input required type="datetime-local" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="field" /></label>
                </div>
                <label className="field-label">Poznámka (volitelné)<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="field resize-none" /></label>
                <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
                  <button type="button" onClick={checkAvailability} className="button-secondary">Ověřit dostupnost</button>
                  <button type="submit" disabled={submitting || !agentId} className="button-primary">{submitting ? "Vytvářím…" : "Vytvořit rezervaci"}</button>
                  {availability && (
                    <span className={`status ml-auto font-sans text-xs tracking-normal ${availability === "AVAILABLE" ? "status-CONFIRMED" : "status-REJECTED"}`}>
                      Dostupnost: {availability === "AVAILABLE" ? "volná" : "obsazená"}
                    </span>
                  )}
                </div>
              </form>

              <div className="panel flex flex-col">
                <div className="flex items-center justify-between border-b border-line px-6 py-5">
                  <h2 className="text-lg font-semibold tracking-tight">Moje rezervace</h2>
                  <span className="font-mono text-sm text-ink-subtle">{myReservations.length}</span>
                </div>
                {myReservations.length === 0 ? (
                  <p className="px-6 py-10 text-center text-sm text-ink-muted">Nemáte žádné rezervace.</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {myReservations.map((reservation) => (
                      <li key={reservation.id} className="flex items-center justify-between gap-4 px-6 py-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-medium text-ink">{reservation.agent.name}</h3>
                            <StatusBadge status={reservation.status} />
                          </div>
                          <p className="mt-1 text-sm tabular-nums text-ink-muted">{formatRange(reservation.startTime, reservation.endTime)}</p>
                        </div>
                        {(reservation.status === "CONFIRMED" || reservation.status === "PENDING_APPROVAL") && (
                          <button type="button" onClick={() => cancelReservation(reservation.id)} disabled={activeAction !== null} className="button-secondary h-9 px-3">Zrušit</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="panel mt-14 flex flex-wrap items-center justify-between gap-6 p-6">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Chcete vytvořit rezervaci?</h2>
              <p className="mt-1 text-sm text-ink-muted">Přihlaste se nebo si během chvíle vytvořte účet.</p>
            </div>
            <Link href="/login" className="button-primary">
              Přihlášení a registrace
            </Link>
          </section>
        )}
      </main>
    </>
  );
}
