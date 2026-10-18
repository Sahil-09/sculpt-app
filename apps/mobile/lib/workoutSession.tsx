// A workout in progress outlives the screen that started it.
//
// Previously all of it lived in app/live.tsx local state, so backing out of the workout
// route unmounted the component and silently threw away every set the user had logged.
// This module owns that draft instead: it survives tab and route navigation because the
// provider sits above the router, and it is mirrored to a JSON file so an OS kill does not
// lose a session either.
//
// Elapsed time is derived from `startedAt` (a wall-clock stamp), never accumulated by a
// timer, so it keeps counting while nothing is mounted.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { File, Paths } from "expo-file-system";
import type { SetType } from "@sculpt/shared";
import { useTheme } from "./ThemeContext";
import { S, T, type Theme } from "./theme";
import { Icon8, type Icon8Name } from "./ui";

export interface LiveSet {
  key: string;
  kg: string;
  reps: string;
  rpe: string;
  done: boolean;
  kind: SetType;
}

export interface LiveExercise {
  key: string;
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  equipment?: string | null;
  mediaUrl?: string | null;
  notes: string;
  restSec: number | null;
  supersetGroup: string | null;
  prev: string | null;
  prevSets: Array<{ kg: number; reps: number }>;
  sets: LiveSet[];
}

export interface WorkoutDraft {
  startedAt: number;
  name: string;
  exercises: LiveExercise[];
  /** Set while the clock is stopped. Elapsed excludes the time since this stamp. */
  pausedAt?: number | null;
  /** Milliseconds already spent paused, accumulated across pauses. */
  pausedMs?: number;
}

const FILE_NAME = "active-workout.json";

function draftFile(): File {
  return new File(Paths.document, FILE_NAME);
}

/** Reject anything that is not the shape we wrote, so a corrupt file cannot crash boot. */
function isDraft(v: unknown): v is WorkoutDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Partial<WorkoutDraft>;
  return (
    typeof d.startedAt === "number" &&
    Number.isFinite(d.startedAt) &&
    typeof d.name === "string" &&
    Array.isArray(d.exercises)
  );
}

type Updater = (prev: LiveExercise[]) => LiveExercise[];

interface SessionApi {
  draft: WorkoutDraft | null;
  elapsedSec: number;
  isPaused: boolean;
  /** Start a fresh session, replacing any existing one. */
  start: (name?: string, exercises?: LiveExercise[]) => void;
  setName: (name: string) => void;
  setExercises: (updater: Updater) => void;
  /** Stop or restart the clock. Paused time is added back as it resumes. */
  togglePause: () => void;
  /** Called after a successful save, or when the user explicitly discards. */
  clear: () => void;
}

/**
 * Elapsed wall time with paused spans removed. `now` is the shared heartbeat.
 * Returns { elapsedSec, isPaused } so callers never re-derive the arithmetic.
 */
export function elapsedFrom(draft: WorkoutDraft, now: number): { elapsedSec: number; isPaused: boolean } {
  const pausedAt = typeof draft.pausedAt === "number" ? draft.pausedAt : null;
  const currentPause = pausedAt == null ? 0 : Math.max(0, now - pausedAt);
  const total = now - draft.startedAt - (draft.pausedMs ?? 0) - currentPause;
  return { elapsedSec: Math.max(0, Math.floor(total / 1000)), isPaused: pausedAt != null };
}

const SessionContext = createContext<SessionApi | null>(null);

export function WorkoutSessionProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<WorkoutDraft | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore an interrupted session on cold start.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = draftFile();
        if (!f.exists) return;
        const parsed: unknown = JSON.parse(await f.text());
        if (!cancelled && isDraft(parsed)) setDraft(parsed);
      } catch {
        // A corrupt or unreadable draft must never block app start.
        try {
          draftFile().delete();
        } catch {
          /* nothing to do */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One shared heartbeat. Only runs while a session exists.
  useEffect(() => {
    if (!draft) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [draft !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  const persist = useCallback((next: WorkoutDraft | null) => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    // Debounced: the user types on every keystroke and we must not write the file that often.
    writeTimer.current = setTimeout(() => {
      try {
        const f = draftFile();
        if (next) {
          if (!f.exists) f.create();
          f.write(JSON.stringify(next));
        } else if (f.exists) {
          f.delete();
        }
      } catch {
        /* best effort — the in-memory session still works for this app run */
      }
    }, 400);
  }, []);

  const start = useCallback(
    (name = "Workout", exercises: LiveExercise[] = []) => {
      const next: WorkoutDraft = { startedAt: Date.now(), name, exercises };
      setDraft(next);
      persist(next);
    },
    [persist]
  );

  const setName = useCallback(
    (name: string) => {
      setDraft((cur) => {
        if (!cur) return cur;
        const next = { ...cur, name };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const setExercises = useCallback(
    (updater: Updater) => {
      setDraft((cur) => {
        if (!cur) return cur;
        const next = { ...cur, exercises: updater(cur.exercises) };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clear = useCallback(() => {
    setDraft(null);
    persist(null);
  }, [persist]);

  const togglePause = useCallback(() => {
    setDraft((cur) => {
      if (!cur) return cur;
      const at = Date.now();
      const next =
        typeof cur.pausedAt === "number"
          ? { ...cur, pausedMs: (cur.pausedMs ?? 0) + (at - cur.pausedAt), pausedAt: null }
          : { ...cur, pausedAt: at };
      persist(next);
      return next;
    });
  }, [persist]);

  useEffect(() => () => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
  }, []);

  const value = useMemo<SessionApi>(() => {
    const { elapsedSec, isPaused } = draft
      ? elapsedFrom(draft, now)
      : { elapsedSec: 0, isPaused: false };
    return { draft, elapsedSec, isPaused, start, setName, setExercises, togglePause, clear };
  }, [draft, now, start, setName, setExercises, togglePause, clear]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useWorkoutSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useWorkoutSession must be used inside WorkoutSessionProvider");
  return ctx;
}

const hhmm = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/* Icons come from the app's existing Icon8 component so the sticky bar matches the tab bar. */
function CircleButton({
  icon,
  onPress,
  bg,
  label
}: {
  icon: Icon8Name;
  onPress: () => void;
  bg: string;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        {
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: bg
        },
        pressed && { opacity: 0.7 }
      ]}
    >
      <Icon8 name={icon} size={16} />
    </Pressable>
  );
}

/**
 * Sticky "workout in progress" bar. Mounted once in the (tabs) layout so it stays visible on
 * every tab, and hidden on Profile where the full-screen settings view owns the space.
 * Controls are icon-only; each carries an accessibilityLabel because there is no visible text.
 */
export function ActiveWorkoutBanner({ onOpen, hidden }: { onOpen: () => void; hidden?: boolean }) {
  const { draft, elapsedSec, isPaused, togglePause, setExercises, clear } = useWorkoutSession();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const s = useMemo(() => bannerStyles(theme), [theme]);
  if (!draft || hidden) return null;
  const doneSets = draft.exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0);
  const lifts = draft.exercises.length;

  return (
    <View style={{ paddingTop: insets.top, backgroundColor: theme.bg }}>
      <View style={s.banner}>
      <Pressable style={s.left} onPress={onOpen} accessibilityRole="button" accessibilityLabel="Open workout">
        <View style={[s.dot, isPaused && s.dotPaused]} />
        <View style={s.textCol}>
          <Text style={s.title} numberOfLines={1}>
            {isPaused ? "Paused · " : "In progress · "}
            {hhmm(elapsedSec)}
          </Text>
          <Text style={s.sub} numberOfLines={1}>
            {draft.name} · {lifts} lift{lifts === 1 ? "" : "s"} · {doneSets} set
            {doneSets === 1 ? "" : "s"}
          </Text>
        </View>
      </Pressable>

      <View style={s.actions}>
        {/* Only the timer toggle and discard live here. Opening the workout is done by
            tapping the bar body — a separate play button read as a duplicate once the
            timer toggle itself turned into a play icon while paused. */}
        <CircleButton
          icon={isPaused ? "play" : "pause"}
          label={isPaused ? "Resume timer" : "Pause timer"}
          onPress={togglePause}
          bg={isPaused ? theme.accent : theme.surface2}
        />
        <CircleButton
          icon="close"
          label="Discard workout"
          onPress={() => {
            setExercises(() => []);
            clear();
          }}
          bg={theme.surface2}
        />
      </View>
    </View>
    </View>
  );
}

function bannerStyles(theme: Theme) {
  return StyleSheet.create({
    banner: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.sm,
      paddingHorizontal: S.md,
      paddingVertical: S.sm,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      backgroundColor: theme.card
    },
    left: { flex: 1, flexDirection: "row", alignItems: "center", gap: S.sm },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent },
    dotPaused: { backgroundColor: theme.dim },
    textCol: { flex: 1 },
    chevron: { ...T.heading, color: theme.faint },
    title: { ...T.meta, color: theme.text, fontWeight: "700" },
    sub: { ...T.micro, color: theme.dim },
    actions: { flexDirection: "row", alignItems: "center", gap: S.sm }
  });
}