import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import NetInfo from "@react-native-community/netinfo";
import * as SQLite from "expo-sqlite";
import { post, ApiError } from "./api";
import type { WorkoutPayload } from "./workoutPayload";

let db: SQLite.SQLiteDatabase | null = null;
function getDb(): SQLite.SQLiteDatabase | null {
  if (db) return db;
  try {
    db = SQLite.openDatabaseSync("sculpt.db");
    db.execSync(
      "CREATE TABLE IF NOT EXISTS workout_outbox (id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);"
    );
    return db;
  } catch {
    return null;
  }
}

const uid = () => `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;

export async function queueWorkout(payload: WorkoutPayload): Promise<string> {
  const d = getDb();
  const id = uid();
  if (!d) throw new Error("Local database unavailable");
  await d.runAsync("INSERT INTO workout_outbox (id, payload, created_at) VALUES (?, ?, ?);", [
    id,
    JSON.stringify(payload),
    Date.now()
  ]);
  return id;
}

export async function pendingCount(): Promise<number> {
  const d = getDb();
  if (!d) return 0;
  const row = await d.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM workout_outbox;");
  return row?.n ?? 0;
}

/** Push queued workouts oldest-first. Stops at first network failure. */
export async function syncOutbox(): Promise<{ synced: number; remaining: number }> {
  const d = getDb();
  if (!d) return { synced: 0, remaining: 0 };
  let synced = 0;
  for (;;) {
    const row = await d.getFirstAsync<{ id: string; payload: string; attempts: number }>(
      "SELECT id, payload, attempts FROM workout_outbox ORDER BY created_at ASC LIMIT 1;"
    );
    if (!row) break;
    try {
      await post("/v1/workouts", JSON.parse(row.payload));
      await d.runAsync("DELETE FROM workout_outbox WHERE id = ?;", [row.id]);
      synced += 1;
    } catch (err) {
      const isClientError = err instanceof ApiError && err.status >= 400 && err.status < 500;
      if (isClientError || row.attempts >= 5) {
        console.warn(`Dropping unprocessable outbox workout ${row.id}:`, err);
        await d.runAsync("DELETE FROM workout_outbox WHERE id = ?;", [row.id]);
        continue;
      }
      await d.runAsync("UPDATE workout_outbox SET attempts = attempts + 1 WHERE id = ?;", [row.id]);
      break;
    }
  }
  return { synced, remaining: await pendingCount() };
}

interface OfflineState {
  online: boolean;
  pending: number;
  syncing: boolean;
  refresh: () => Promise<void>;
  syncNow: () => Promise<{ synced: number; remaining: number }>;
}

const Ctx = createContext<OfflineState>({
  online: true,
  pending: 0,
  syncing: false,
  refresh: async () => {},
  syncNow: async () => ({ synced: 0, remaining: 0 })
});

export function OfflineProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await pendingCount());
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await syncOutbox();
      setPending(r.remaining);
      return r;
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = NetInfo.addEventListener((state) => {
      const up = state.isConnected !== false;
      setOnline(up);
      if (up) syncNow();
    });
    return unsub;
  }, [refresh, syncNow]);

  const value = useMemo(
    () => ({ online, pending, syncing, refresh, syncNow }),
    [online, pending, syncing, refresh, syncNow]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useOffline = () => useContext(Ctx);
