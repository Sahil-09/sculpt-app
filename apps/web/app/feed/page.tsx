"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { get, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface FeedItem {
  _id: string;
  name: string;
  startTime: string;
  endTime?: string | null;
  description?: string;
  exercises: Array<{ sets: Array<{ done?: boolean; kg?: number | null; reps?: number | null }> }>;
}

export default function FeedPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (user)
      get<{ items: FeedItem[]; nextCursor: string | null }>("/v1/workouts?scope=feed&limit=20")
        .then((d) => {
          setItems(d.items);
          setCursor(d.nextCursor);
        })
        .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, [ready, user, router]);

  async function more() {
    if (!cursor) return;
    try {
      const d = await get<{ items: FeedItem[]; nextCursor: string | null }>(
        `/v1/workouts?scope=feed&limit=20&cursor=${encodeURIComponent(cursor)}`
      );
      setItems((p) => [...p, ...d.items]);
      setCursor(d.nextCursor);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    }
  }

  if (!ready || !user) return <p className="muted">Loading…</p>;

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 style={{ marginTop: 0 }}>Community feed</h1>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {items.map((w) => {
          const sets = w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done !== false).length, 0);
          const vol = w.exercises.reduce(
            (t, e) => t + e.sets.reduce((s, x) => (x.done !== false && x.kg != null && x.reps != null ? s + x.kg * x.reps : s), 0),
            0
          );
          return (
            <div key={w._id} className="card">
              <h3>{w.name}</h3>
              <p className="muted">
                {new Date(w.startTime).toLocaleString()} · {w.exercises.length} lifts · {sets} sets ·{" "}
                {Math.round(vol).toLocaleString()} kg
              </p>
              {!!w.description && <p>{w.description}</p>}
            </div>
          );
        })}
      </div>
      {items.length === 0 && <p className="muted">No public workouts yet.</p>}
      {cursor && (
        <p style={{ marginTop: 12 }}>
          <button className="secondary" onClick={more}>
            Load more
          </button>
        </p>
      )}
      <p className="muted" style={{ marginTop: 24 }}>
        Want to save someone&apos;s session as your own routine? Open it in the <Link href="/routines">planner</Link>{" "}
        via the mobile app&apos;s Save-as-Routine.
      </p>
    </div>
  );
}
