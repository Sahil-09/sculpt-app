"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { del, get, post, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

interface Routine {
  _id: string;
  name: string;
  folderId?: string | null;
  exercises: Array<{ exerciseId: string; sets: unknown[] }>;
}
interface Folder {
  _id: string;
  name: string;
}

export default function RoutinesPage() {
  const router = useRouter();
  const { ready, user } = useAuth();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [share, setShare] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, f] = await Promise.all([
        get<{ items: Routine[] }>("/v1/routines"),
        get<{ items: Folder[] }>("/v1/routine-folders")
      ]);
      setRoutines(r.items);
      setFolders(f.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (user) load();
  }, [ready, user, router, load]);

  async function createFolder() {
    const n = newFolder.trim();
    if (!n) return;
    try {
      const f = await post<Folder>("/v1/routine-folders", { name: n });
      setFolders((p) => [...p, f].sort((a, b) => a.name.localeCompare(b.name)));
      setNewFolder("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create folder");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this routine?")) return;
    try {
      await del(`/v1/routines/${id}`);
      setRoutines((p) => p.filter((r) => r._id !== id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function shareRoutine(id: string) {
    try {
      const r = await post<{ shareSlug: string }>(`/v1/routines/${id}/share`, {});
      setShare(`${window.location.origin}/shared/${r.shareSlug}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Share failed");
    }
  }

  if (!ready || !user) return <p className="muted">Loading…</p>;

  const visible = filter ? routines.filter((r) => r.folderId === filter) : routines;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1 style={{ margin: 0 }}>Routines</h1>
        <div className="row">
          <Link href="/workout" className="btn" style={{ padding: "8px 16px" }}>
            + Start empty workout
          </Link>
          <Link href="/library" className="btn secondary" style={{ padding: "8px 14px" }}>
            Browse library
          </Link>
          <Link href="/routines/new" className="btn secondary" style={{ padding: "8px 14px" }}>
            New routine
          </Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}
      {share && (
        <p className="card">
          Share link: <code>{share}</code>
        </p>
      )}
      <div className="row" style={{ margin: "12px 0" }}>
        <button className={`chip ${filter === null ? "on" : ""}`} onClick={() => setFilter(null)}>
          All ({routines.length})
        </button>
        {folders.map((f) => (
          <button
            key={f._id}
            className={`chip ${filter === f._id ? "on" : ""}`}
            onClick={() => setFilter(f._id)}
          >
            {f.name} ({routines.filter((r) => r.folderId === f._id).length})
          </button>
        ))}
        <input
          placeholder="New folder"
          value={newFolder}
          onChange={(e) => setNewFolder(e.target.value)}
          style={{ width: 140 }}
        />
        <button className="secondary" onClick={createFolder}>
          Add
        </button>
      </div>
      <div className="grid two">
        {visible.map((r) => (
          <div key={r._id} className="card">
            <h3>{r.name}</h3>
            <p className="muted">
              {r.exercises.length} lifts · {r.exercises.reduce((n, e) => n + e.sets.length, 0)} sets
              {r.folderId ? ` · ${folders.find((f) => f._id === r.folderId)?.name ?? ""}` : ""}
            </p>
            <div className="row">
              <Link href={`/workout?routineId=${r._id}`} className="btn" style={{ padding: "6px 14px", fontSize: 13 }}>
                Start
              </Link>
              <Link href={`/routines/${r._id}`} className="btn secondary" style={{ padding: "6px 12px", fontSize: 13 }}>
                Edit
              </Link>
              <button className="secondary" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => shareRoutine(r._id)}>
                Share
              </button>
              <button className="danger" style={{ padding: "6px 12px", fontSize: 13 }} onClick={() => remove(r._id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      {visible.length === 0 && <p className="muted">No routines here yet.</p>}
    </div>
  );
}
