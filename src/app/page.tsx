"use client";

import { useEffect, useState } from "react";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  capacity: number;
  isActive: boolean;
}

export default function Home() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [agentId, setAgentId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ id: string } | null>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load agents");
        return res.json();
      })
      .then((data: Agent[]) => {
        setAgents(data);
        if (data.length > 0) setAgentId(data[0].id);
      })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoadingAgents(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setSubmitResult(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          agentId,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          note: note || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Reservation failed");
      }

      setSubmitResult(data);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <header>
        <h1 className="text-2xl font-semibold">AI Agent Reservations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse available agents and reserve a time slot for exclusive compute
          access.
        </p>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-medium">Available agents</h2>
        {loadingAgents && <p className="text-sm text-gray-500">Loading agents…</p>}
        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!loadingAgents && !loadError && agents.length === 0 && (
          <p className="text-sm text-gray-500">No agents available.</p>
        )}
        <ul className="flex flex-col gap-3">
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="rounded-lg border border-gray-200 p-4 dark:border-gray-800"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{agent.name}</span>
                <span className="text-xs text-gray-500">
                  capacity: {agent.capacity}
                </span>
              </div>
              {agent.description && (
                <p className="mt-1 text-sm text-gray-500">{agent.description}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium">Reserve an agent</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm font-medium">
              Your name
            </label>
            <input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm font-medium">
              Your email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="agent" className="text-sm font-medium">
              Agent
            </label>
            <select
              id="agent"
              required
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            >
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="startTime" className="text-sm font-medium">
                Start time
              </label>
              <input
                id="startTime"
                type="datetime-local"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <label htmlFor="endTime" className="text-sm font-medium">
                End time
              </label>
              <input
                id="endTime"
                type="datetime-local"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="note" className="text-sm font-medium">
              Note (optional)
            </label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={submitting || agents.length === 0}
            className="w-fit rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitting ? "Reserving…" : "Reserve"}
          </button>

          {submitError && <p className="text-sm text-red-600">{submitError}</p>}
          {submitResult && (
            <p className="text-sm text-green-600">
              Reservation confirmed. Id: {submitResult.id}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
