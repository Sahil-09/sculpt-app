"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { get, patch, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import type { WorkoutSettings } from "@sculpt/shared";

export default function SettingsPage() {
  const router = useRouter();
  const { ready, user, refreshUser } = useAuth();
  const [s, setS] = useState<WorkoutSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
    else if (user)
      get<{ settings: WorkoutSettings }>("/v1/users/me/settings")
        .then((d) => setS(d.settings))
        .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load"));
  }, [ready, user, router]);

  async function update(p: Partial<WorkoutSettings>) {
    if (!s) return;
    const prev = s;
    setS({ ...s, ...p });
    try {
      const d = await patch<{ settings: WorkoutSettings }>("/v1/users/me/settings", p);
      setS(d.settings);
      refreshUser();
    } catch {
      setS(prev);
    }
  }

  if (!ready || !user) return <p className="muted">Loading…</p>;

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      {error && <p className="error">{error}</p>}
      <div className="card grid">
        <p>
          <strong>{user.name}</strong>
          <br />
          <span className="muted">{user.email}</span>
        </p>
        {s && (
          <>
            <label className="row">
              <span style={{ width: 180 }}>Units</span>
              <select value={s.units} onChange={(e) => update({ units: e.target.value as "kg" | "lbs" })}>
                <option value="kg">kg</option>
                <option value="lbs">lbs</option>
              </select>
            </label>
            <label className="row">
              <span style={{ width: 180 }}>Default rest (s)</span>
              <input
                className="small"
                type="number"
                value={s.defaultRestSec}
                onChange={(e) => update({ defaultRestSec: Math.max(0, Number(e.target.value) || 0) })}
              />
            </label>
            {(
              [
                ["rpeTracking", "RPE tracking"],
                ["plateCalculator", "Plate calculator"],
                ["warmupCalculator", "Warm-up calculator"]
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="row">
                <span style={{ width: 180 }}>{label}</span>
                <input type="checkbox" checked={s[k]} onChange={(e) => update({ [k]: e.target.checked })} />
              </label>
            ))}
            <label className="row">
              <span style={{ width: 180 }}>Previous values</span>
              <select value={s.previousValues} onChange={(e) => update({ previousValues: e.target.value as "last" | "best" })}>
                <option value="last">Last session</option>
                <option value="best">Personal best</option>
              </select>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
