"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { get, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { estimate1RM } from "@sculpt/shared";

interface Muscles {
  days: number;
  muscles: Record<string, { sets: number; volume: number }>;
}
interface Consistency {
  totalWorkouts: number;
  totalSets: number;
  totalVolume: number;
  streakDays: number;
  perDay: Record<string, number>;
}
interface TopExercise {
  exerciseId: string;
  name: string;
  sessions: number;
}
interface HistSet {
  kg?: number | null;
  reps?: number | null;
}
interface History {
  recent: Array<{ startTime: string; sets?: HistSet[] }>;
  bests: {
    heaviest: number | null;
    mostReps: number | null;
    best1rm: number | null;
    bestSetVolume: number | null;
  } | null;
}

function LineChart({ points }: { points: Array<{ x: string; y: number }> }) {
  const W = 680;
  const H = 220;
  const PAD = 32;
  if (points.length === 0) return <p className="muted">No data points yet.</p>;
  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const span = max - min || 1;
  const px = (i: number) => PAD + (i / Math.max(1, points.length - 1)) * (W - PAD * 2);
  const py = (y: number) => H - PAD - ((y - min) / span) * (H - PAD * 2);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", background: "var(--bg)", borderRadius: 8 }}>
      <text x={4} y={PAD - 12} fill="var(--dim)" fontSize="11">
        {max}
      </text>
      <text x={4} y={H - 8} fill="var(--dim)" fontSize="11">
        {min}
      </text>
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {points.map((p, i) => (
        <circle key={i} cx={px(i)} cy={py(p.y)} r="3" fill="var(--accent)">
          <title>{`${p.x}: ${p.y}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [muscles, setMuscles] = useState<Muscles | null>(null);
  const [con, setCon] = useState<Consistency | null>(null);
  const [top, setTop] = useState<TopExercise[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [hist, setHist] = useState<History | null>(null);
  const [weights, setWeights] = useState<Array<{ x: string; y: number }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [m, c, e, b] = await Promise.all([
        get<Muscles>("/v1/stats/muscles?days=90"),
        get<Consistency>("/v1/stats/consistency?days=90"),
        get<{ items: TopExercise[] }>("/v1/stats/exercises?days=365"),
        get<{ items: Array<{ date: string; weightKg?: number | null }> }>("/v1/body-measurements?limit=90")
      ]);
      setMuscles(m);
      setCon(c);
      setTop(e.items);
      setWeights(
        b.items
          .filter((x) => x.weightKg != null)
          .slice()
          .reverse()
          .map((x) => ({ x: new Date(x.date).toLocaleDateString(), y: Math.round((x.weightKg as number) * 10) / 10 }))
      );
      if (e.items.length && !selected) setSelected(e.items[0].exerciseId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (user) load();
  }, [ready, user, router, load]);

  useEffect(() => {
    if (!selected) return;
    get<History>(`/v1/workouts/exercise/${selected}/history?limit=50`)
      .then(setHist)
      .catch(() => setHist(null));
  }, [selected]);

  const e1rm = useMemo(() => {
    if (!hist) return [];
    return hist.recent
      .slice()
      .reverse()
      .map((w) => {
        let best: number | null = null;
        for (const s of w.sets ?? []) {
          const v = estimate1RM(s.kg ?? null, s.reps ?? null);
          if (v != null && (best == null || v > best)) best = v;
        }
        return best == null ? null : { x: new Date(w.startTime).toLocaleDateString(), y: Math.round(best * 10) / 10 };
      })
      .filter((p): p is { x: string; y: number } => p !== null);
  }, [hist]);

  if (!ready || !user) return <p className="muted">Loading…</p>;

  const rows = muscles ? Object.entries(muscles.muscles).sort((a, b) => b[1].sets - a[1].sets) : [];
  const max = rows.length ? rows[0][1].sets : 1;
  const days: string[] = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Analytics</h1>
      {error && <p className="error">{error}</p>}
      {con && (
        <div className="card">
          <h3>Last 90 days</h3>
          <p>
            {con.totalWorkouts} workouts · {con.totalSets} sets ·{" "}
            {Math.round(con.totalVolume).toLocaleString()} kg · {con.streakDays}d streak
          </p>
          <div className="heat">
            {days.map((d) => (
              <div
                key={d}
                title={`${d}: ${con.perDay[d] ?? 0}`}
                style={{ background: con.perDay[d] ? "var(--accent)" : undefined, opacity: con.perDay[d] ? Math.min(1, 0.35 + con.perDay[d] * 0.3) : undefined }}
              />
            ))}
          </div>
        </div>
      )}
      <div className="grid two" style={{ marginTop: 12 }}>
        <div className="card">
          <h3>Muscle distribution (sets)</h3>
          {rows.map(([m, v]) => (
            <div key={m} className="bar">
              <span className="label">{m}</span>
              <div className="track">
                <div className="fill" style={{ width: `${Math.max(3, (v.sets / max) * 100)}%` }} />
              </div>
              <span className="n">{v.sets}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="muted">No training in range.</p>}
        </div>
        <div className="card">
          <h3>Exercise progress (est. 1RM)</h3>
          <select value={selected} onChange={(e) => setSelected(e.target.value)} style={{ marginBottom: 8 }}>
            {top.map((t) => (
              <option key={t.exerciseId} value={t.exerciseId}>
                {t.name} ({t.sessions})
              </option>
            ))}
          </select>
          {hist?.bests && (
            <p className="muted">
              Heaviest {hist.bests.heaviest ?? "–"} · Best 1RM {hist.bests.best1rm ?? "–"} · Most reps{" "}
              {hist.bests.mostReps ?? "–"}
            </p>
          )}
          <LineChart points={e1rm} />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>Body weight (kg)</h3>
        <LineChart points={weights} />
      </div>
    </div>
  );
}
