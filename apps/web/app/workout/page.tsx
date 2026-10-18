"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { get, post, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { PersonalRecord } from "@sculpt/shared";

interface WorkoutSet {
  kg: string;
  reps: string;
  rpe: string;
  done: boolean;
}

interface WorkoutExerciseItem {
  key: number;
  exerciseId: string;
  name: string;
  sets: WorkoutSet[];
}

interface Template {
  _id: string;
  name: string;
  primaryMuscle: string;
  equipment?: string | null;
}

let seq = 1;

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function WorkoutView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const routineId = searchParams.get("routineId");
  const { ready, user } = useAuth();

  const [name, setName] = useState("Workout");
  const [exercises, setExercises] = useState<WorkoutExerciseItem[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [results, setResults] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    name: string;
    volume: number;
    sets: number;
    duration: number;
    prs: PersonalRecord[];
  } | null>(null);

  const startRef = useRef(Date.now());

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // Fetched once and filtered client-side: the API caps a page at 2000 and searching it
        // per keystroke issued a request on every character.
        const t = await get<{ items: Template[] }>("/v1/exercise-templates?limit=2000");
        setTemplates(t.items);
        const byId = new Map(t.items.map((x) => [x._id, x.name]));

        if (routineId) {
          const r = await get<{
            name: string;
            exercises: Array<{
              exerciseId: string;
              sets: Array<{ kg?: number | null; reps?: number | null }>;
            }>;
          }>(`/v1/routines/${routineId}`);

          setName(r.name);
          setExercises(
            r.exercises.map((e) => ({
              key: seq++,
              exerciseId: e.exerciseId,
              name: byId.get(e.exerciseId) ?? "Unknown lift",
              sets: e.sets.map((s) => ({
                kg: s.kg != null ? String(s.kg) : "",
                reps: s.reps != null ? String(s.reps) : "",
                rpe: "",
                done: false
              }))
            }))
          );
        } else {
          setName(`Workout ${new Date().toLocaleDateString()}`);
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load workout details");
      }
    })();
  }, [user, routineId]);

  const search = useCallback((q: string) => {
    setQuery(q);
    const needle = q.trim().toLowerCase();
    setResults(
      needle ? templates.filter((t) => t.name.toLowerCase().includes(needle)).slice(0, 20) : []
    );
  }, [templates]);

  function addExercise(t: Template) {
    setExercises((prev) => [
      ...prev,
      {
        key: seq++,
        exerciseId: t._id,
        name: t.name,
        sets: [{ kg: "", reps: "", rpe: "", done: false }]
      }
    ]);
    setQuery("");
    setResults([]);
  }

  function addSet(exKey: number) {
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        const last = e.sets[e.sets.length - 1];
        return {
          ...e,
          sets: [
            ...e.sets,
            { kg: last ? last.kg : "", reps: last ? last.reps : "", rpe: "", done: false }
          ]
        };
      })
    );
  }

  function updateSet(exKey: number, setIdx: number, patch: Partial<WorkoutSet>) {
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        const nextSets = [...e.sets];
        nextSets[setIdx] = { ...nextSets[setIdx], ...patch };
        return { ...e, sets: nextSets };
      })
    );
  }

  function removeSet(exKey: number, setIdx: number) {
    setExercises((prev) =>
      prev.map((e) => {
        if (e.key !== exKey) return e;
        return { ...e, sets: e.sets.filter((_, i) => i !== setIdx) };
      })
    );
  }

  function removeExercise(exKey: number) {
    setExercises((prev) => prev.filter((e) => e.key !== exKey));
  }

  async function finish() {
    if (exercises.length === 0) {
      setError("Add at least one exercise before finishing.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const end = new Date();
      const payload = {
        name: name.trim() || "Workout",
        startTime: new Date(startRef.current).toISOString(),
        endTime: end.toISOString(),
        description: "",
        isPrivate: false,
        exercises: exercises
          .filter((e) => e.sets.length > 0)
          .map((e) => ({
            exerciseId: e.exerciseId,
            notes: "",
            restSec: 90,
            supersetGroup: null,
            sets: e.sets.map((x) => ({
              type: "normal",
              kg: x.kg.trim() !== "" ? Number(x.kg) : null,
              reps: x.reps.trim() !== "" ? Math.round(Number(x.reps)) : null,
              rpe: x.rpe.trim() !== "" ? Number(x.rpe) : null,
              durationSec: null,
              distanceM: null,
              done: x.done,
              pr: false
            }))
          }))
      };

      const res = await post<{ workout: { name: string }; prs: PersonalRecord[] }>(
        "/v1/workouts",
        payload
      );

      const totalVol = exercises.reduce(
        (t, e) =>
          t +
          e.sets.reduce((s, x) => {
            const kg = Number(x.kg);
            const reps = Number(x.reps);
            return x.done && Number.isFinite(kg) && Number.isFinite(reps) ? s + kg * reps : s;
          }, 0),
        0
      );
      const doneSets = exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);

      setSummary({
        name: res.workout.name,
        volume: totalVol,
        sets: doneSets,
        duration: Math.floor((end.getTime() - startRef.current) / 1000),
        prs: res.prs ?? []
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save workout");
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !user) return <p className="muted">Loading…</p>;

  if (summary) {
    return (
      <div style={{ maxWidth: 600 }}>
        <h1>Workout Saved!</h1>
        <div className="card grid">
          <h2>{summary.name}</h2>
          <p className="muted">
            {fmtTime(summary.duration)} · {summary.sets} sets · {Math.round(summary.volume).toLocaleString()} kg
          </p>
          {summary.prs.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <strong>New Personal Records ({summary.prs.length})</strong>
              <ul>
                {summary.prs.map((p, i) => (
                  <li key={i}>
                    {p.kind.replace(/_/g, " ")}: {p.value} {p.unit}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            <Link href="/analytics" className="btn">
              View analytics
            </Link>
            <Link href="/routines" className="btn secondary">
              Back to routines
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontSize: 22, fontWeight: 700, width: "100%", maxWidth: 360 }}
            placeholder="Workout name"
          />
          <p className="muted" style={{ margin: "4px 0 0" }}>
            Duration: <strong>{fmtTime(elapsed)}</strong>
          </p>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => router.push("/routines")}>
            Cancel
          </button>
          <button onClick={finish} disabled={saving}>
            {saving ? "Saving…" : "Finish Workout"}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div style={{ margin: "20px 0" }}>
        <input
          placeholder="Search exercises to add…"
          value={query}
          onChange={(e) => search(e.target.value)}
          style={{ width: "100%" }}
        />
        {results.length > 0 && (
          <div className="card" style={{ marginTop: 8, maxHeight: 240, overflowY: "auto" }}>
            {results.map((t) => (
              <div
                key={t._id}
                className="row"
                style={{
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer"
                }}
                onClick={() => addExercise(t)}
              >
                <span>
                  <strong>{t.name}</strong>{" "}
                  <span className="muted">({t.primaryMuscle})</span>
                </span>
                <span className="btn" style={{ padding: "3px 8px", fontSize: 12 }}>
                  + Add
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid">
        {exercises.map((e, ei) => (
          <div key={e.key} className="card">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                {ei + 1}. {e.name}
              </h3>
              <button
                className="danger"
                style={{ padding: "4px 8px", fontSize: 12 }}
                onClick={() => removeExercise(e.key)}
              >
                Remove
              </button>
            </div>
            <table className="sets">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>Set</th>
                  <th>kg</th>
                  <th>Reps</th>
                  <th>RPE</th>
                  <th style={{ width: 60, textAlign: "center" }}>Done</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {e.sets.map((s, si) => (
                  <tr key={si}>
                    <td style={{ fontWeight: 600 }}>{si + 1}</td>
                    <td>
                      <input
                        className="small"
                        type="number"
                        placeholder="kg"
                        value={s.kg}
                        onChange={(ev) => updateSet(e.key, si, { kg: ev.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="small"
                        type="number"
                        placeholder="reps"
                        value={s.reps}
                        onChange={(ev) => updateSet(e.key, si, { reps: ev.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="small"
                        type="number"
                        placeholder="RPE"
                        value={s.rpe}
                        onChange={(ev) => updateSet(e.key, si, { rpe: ev.target.value })}
                      />
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={s.done}
                        onChange={(ev) => updateSet(e.key, si, { done: ev.target.checked })}
                      />
                    </td>
                    <td>
                      <button
                        className="danger"
                        style={{ padding: "2px 6px", fontSize: 11 }}
                        onClick={() => removeSet(e.key, si)}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="secondary"
              style={{ marginTop: 10, padding: "4px 10px", fontSize: 13 }}
              onClick={() => addSet(e.key)}
            >
              + Add Set
            </button>
          </div>
        ))}
      </div>

      {exercises.length === 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 32 }}>
          Search and add an exercise above to begin logging.
        </p>
      )}
    </div>
  );
}

export default function WorkoutPage() {
  return (
    <Suspense fallback={<p className="muted">Loading workout…</p>}>
      <WorkoutView />
    </Suspense>
  );
}
