"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, del, get, patch, post, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface EditSet {
  kg: string;
  reps: string;
  kind: string;
}
interface EditExercise {
  key: number;
  exerciseId: string;
  name: string;
  restSec: string;
  sets: EditSet[];
}
interface Folder {
  _id: string;
  name: string;
}
interface Template {
  _id: string;
  name: string;
  primaryMuscle: string;
  equipment?: string | null;
}

let seq = 1;

export default function RoutineEditor({ routineId }: { routineId?: string }) {
  const router = useRouter();
  const { ready, user } = useAuth();
  const isNew = !routineId;
  const [name, setName] = useState("New routine");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [exercises, setExercises] = useState<EditExercise[]>([]);
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [results, setResults] = useState<Template[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const f = await get<{ items: Folder[] }>("/v1/routine-folders");
        setFolders(f.items);
        // Loaded for new routines too, so the picker is usable before anything is saved.
        const t = await get<{ items: Template[] }>("/v1/exercise-templates?limit=2000");
        setTemplates(t.items);
        if (!isNew) {
          const r = await get<{
            name: string;
            folderId?: string | null;
            exercises: Array<{
              exerciseId: string;
              restSec?: number | null;
              sets: Array<{ kg?: number | null; reps?: number | null; type?: string }>;
            }>;
          }>(`/v1/routines/${routineId}`);
          setName(r.name);
          setFolderId(r.folderId ?? null);
          const byId = new Map(t.items.map((x) => [x._id, x.name]));
          setExercises(
            r.exercises.map((e) => ({
              key: seq++,
              exerciseId: e.exerciseId,
              name: byId.get(e.exerciseId) ?? "Unknown lift",
              restSec: e.restSec != null ? String(e.restSec) : "",
              sets: e.sets.map((s) => ({
                kg: s.kg != null ? String(s.kg) : "",
                reps: s.reps != null ? String(s.reps) : "",
                kind: s.type ?? "normal"
              }))
            }))
          );
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load");
      }
    })();
  }, [user, isNew, routineId]);

  const search = useCallback((q: string) => {
    setQuery(q);
    const needle = q.trim().toLowerCase();
    setResults(
      needle ? templates.filter((t) => t.name.toLowerCase().includes(needle)).slice(0, 20) : []
    );
  }, [templates]);

  const numOrNull = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  async function save() {
    if (!name.trim()) return setError("Give the routine a name");
    if (exercises.length === 0) return setError("Add at least one exercise");
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        folderId,
        exercises: exercises.map((e) => ({
          exerciseId: e.exerciseId,
          notes: "",
          restSec: numOrNull(e.restSec),
          supersetGroup: null,
          sets: e.sets.map((x) => ({
            type: x.kind,
            kg: numOrNull(x.kg),
            reps: numOrNull(x.reps) != null ? Math.round(numOrNull(x.reps) as number) : null,
            rpe: null,
            durationSec: null,
            distanceM: null,
            done: false,
            pr: false
          }))
        }))
      };
      if (isNew) await post("/v1/routines", body);
      else await patch(`/v1/routines/${routineId}`, body);
      router.push("/routines");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await del(`/v1/routines/${routineId}`);
      router.push("/routines");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  function move(key: number, dir: -1 | 1) {
    setExercises((prev) => {
      const i = prev.findIndex((e) => e.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(i, 1);
      next.splice(j, 0, item);
      return next;
    });
  }

  if (!ready || !user) return <p className="muted">Loading…</p>;

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ marginTop: 0 }}>{isNew ? "New routine" : "Edit routine"}</h1>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Routine name" />
        <div className="row">
          <span className="muted">Folder:</span>
          <button className={`chip ${folderId === null ? "on" : ""}`} onClick={() => setFolderId(null)}>
            None
          </button>
          {folders.map((f) => (
            <button key={f._id} className={`chip ${folderId === f._id ? "on" : ""}`} onClick={() => setFolderId(f._id)}>
              {f.name}
            </button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 16 }} className="grid">
        {exercises.map((e, ei) => (
          <div key={e.key} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>
                {ei + 1}. {e.name}
              </strong>
              <div className="row">
                <button className="secondary" onClick={() => move(e.key, -1)}>↑</button>
                <button className="secondary" onClick={() => move(e.key, 1)}>↓</button>
                <button className="danger" onClick={() => setExercises((p) => p.filter((x) => x.key !== e.key))}>
                  Remove
                </button>
              </div>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="muted">Rest (s)</span>
              <input
                className="small"
                value={e.restSec}
                onChange={(ev) =>
                  setExercises((p) => p.map((x) => (x.key === e.key ? { ...x, restSec: ev.target.value } : x)))
                }
                placeholder="90"
              />
            </div>
            <table className="sets">
              <thead>
                <tr>
                  <th>Set</th>
                  <th>Type</th>
                  <th>kg</th>
                  <th>Reps</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {e.sets.map((x, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <select
                        value={x.kind}
                        onChange={(ev) =>
                          setExercises((p) =>
                            p.map((ex) =>
                              ex.key === e.key
                                ? { ...ex, sets: ex.sets.map((s, si) => (si === i ? { ...s, kind: ev.target.value } : s)) }
                                : ex
                            )
                          )
                        }
                      >
                        <option value="normal">N</option>
                        <option value="warmup">W</option>
                        <option value="drop">D</option>
                        <option value="failure">F</option>
                      </select>
                    </td>
                    <td>
                      <input
                        className="small"
                        value={x.kg}
                        onChange={(ev) =>
                          setExercises((p) =>
                            p.map((ex) =>
                              ex.key === e.key
                                ? { ...ex, sets: ex.sets.map((s, si) => (si === i ? { ...s, kg: ev.target.value } : s)) }
                                : ex
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        className="small"
                        value={x.reps}
                        onChange={(ev) =>
                          setExercises((p) =>
                            p.map((ex) =>
                              ex.key === e.key
                                ? { ...ex, sets: ex.sets.map((s, si) => (si === i ? { ...s, reps: ev.target.value } : s)) }
                                : ex
                            )
                          )
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="secondary"
                        onClick={() =>
                          setExercises((p) =>
                            p.map((ex) =>
                              ex.key === e.key ? { ...ex, sets: ex.sets.filter((_, si) => si !== i) } : ex
                            )
                          )
                        }
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="secondary"
                onClick={() =>
                  setExercises((p) =>
                    p.map((ex) => (ex.key === e.key ? { ...ex, sets: [...ex.sets, { kg: "", reps: "", kind: "normal" }] } : ex))
                  )
                }
              >
                + Add set
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <h3>Add exercise</h3>
        <input placeholder="Search exercises…" value={query} onChange={(e) => search(e.target.value)} />
        {results.map((t) => (
          <div key={t._id} className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
            <span>
              {t.name} <span className="muted">· {t.primaryMuscle}</span>
            </span>
            <button
              className="secondary"
              onClick={() => {
                setExercises((p) => [
                  ...p,
                  {
                    key: seq++,
                    exerciseId: t._id,
                    name: t.name,
                    restSec: "",
                    sets: [
                      { kg: "", reps: "", kind: "normal" },
                      { kg: "", reps: "", kind: "normal" },
                      { kg: "", reps: "", kind: "normal" }
                    ]
                  }
                ]);
                setQuery("");
                setResults([]);
              }}
            >
              Add
            </button>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <button onClick={save} disabled={saving}>
          {saving ? "Saving…" : isNew ? "Create routine" : "Save changes"}
        </button>
        {!isNew && (
          <button className="danger" onClick={remove}>
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
