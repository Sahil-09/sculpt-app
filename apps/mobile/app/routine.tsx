import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { get, post, patch, api, ApiError } from "../lib/api";
import { useTheme } from "../lib/ThemeContext";
import type { SetType } from "@sculpt/shared";
import { SET_TYPE_META } from "@sculpt/shared";
import { NUM, S, T } from "../lib/theme";
import { Btn, Card, EmptyState, ExerciseThumb, Field, IconBtn, Notice, Pill, useScreenStyle, SectionHeader } from "../lib/ui";

let seq = 1;
const nid = () => `red-${seq++}-${Date.now()}`;

interface EditSet {
  key: string;
  kg: string;
  reps: string;
  kind: SetType;
  rpe: number | null;
  durationSec: number | null;
  distanceM: number | null;
}
interface EditExercise {
  key: string;
  exerciseId: string;
  name: string;
  notes: string;
  restSec: string;
  supersetGroup: string | null;
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
  mediaUrl?: string | null;
}

const blankSet = (): EditSet => ({
  key: nid(),
  kg: "",
  reps: "",
  kind: "normal",
  rpe: null,
  durationSec: null,
  distanceM: null
});
const KIND_ORDER: SetType[] = ["normal", "warmup", "drop", "failure"];

export default function RoutineEditor() {
  const { routineId } = useLocalSearchParams<{ routineId?: string }>();
  const isNew = !routineId;
  const { theme } = useTheme();
  const screenStyle = useScreenStyle();
  const s = useStyles(theme);
  const [name, setName] = useState("New routine");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [exercises, setExercises] = useState<EditExercise[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const [f, t] = await Promise.all([
          get<{ items: Folder[] }>("/v1/routine-folders"),
          get<{ items: Template[] }>("/v1/exercise-templates?limit=2000")
        ]);
        setFolders(f.items);
        setTemplates(t.items);
        if (!isNew) {
          const r = await get<{
            name: string;
            folderId?: string | null;
            exercises: Array<{
              exerciseId: string;
              notes?: string | null;
              restSec?: number | null;
              supersetGroup?: string | null;
              sets: Array<{
                kg?: number | null;
                reps?: number | null;
                type?: string;
                rpe?: number | null;
                durationSec?: number | null;
                distanceM?: number | null;
              }>;
            }>;
          }>(`/v1/routines/${routineId}`);
          setName(r.name);
          setFolderId(r.folderId ?? null);
          const byId = new Map(t.items.map((x) => [x._id, x.name]));
          setExercises(
            r.exercises.map((e) => ({
              key: nid(),
              exerciseId: e.exerciseId,
              name: byId.get(e.exerciseId) ?? "Unknown lift",
              notes: e.notes ?? "",
              restSec: e.restSec != null ? String(e.restSec) : "",
              supersetGroup: e.supersetGroup ?? null,
              sets: e.sets.map((s) => ({
                key: nid(),
                kg: s.kg != null ? String(s.kg) : "",
                reps: s.reps != null ? String(s.reps) : "",
                kind: (KIND_ORDER as string[]).includes(s.type ?? "") ? (s.type as SetType) : "normal",
                rpe: s.rpe ?? null,
                durationSec: s.durationSec ?? null,
                distanceM: s.distanceM ?? null
              }))
            }))
          );
        }
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Failed to load");
      }
    })();
  }, [isNew, routineId]);

  const visibleTemplates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : templates;
  }, [templates, query]);

  function addExercise(t: Template) {
    setExercises((prev) => [
      ...prev,
      {
        key: nid(),
        exerciseId: t._id,
        name: t.name,
        notes: "",
        restSec: "",
        supersetGroup: null,
        sets: [blankSet(), blankSet(), blankSet()]
      }
    ]);
  }

  function move(key: string, dir: -1 | 1) {
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

  function patchSet(exKey: string, setKey: string, p: Partial<EditSet>) {
    setExercises((prev) =>
      prev.map((e) => (e.key === exKey ? { ...e, sets: e.sets.map((x) => (x.key === setKey ? { ...x, ...p } : x)) } : e))
    );
  }

  async function createFolder() {
    const n = newFolder.trim();
    if (!n) return;
    try {
      const f = await post<Folder>("/v1/routine-folders", { name: n });
      setFolders((prev) => [...prev, f].sort((a, b) => a.name.localeCompare(b.name)));
      setFolderId(f._id);
      setNewFolder("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create folder");
    }
  }

  const numOrNull = (s: string): number | null => {
    if (s.trim() === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  };

  async function save() {
    if (!name.trim()) {
      setError("Give the routine a name");
      return;
    }
    if (exercises.length === 0) {
      setError("Add at least one exercise");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: name.trim(),
        folderId,
        exercises: exercises.map((e) => ({
          exerciseId: e.exerciseId,
          notes: e.notes,
          restSec: numOrNull(e.restSec),
          supersetGroup: e.supersetGroup,
          sets: e.sets.map((x) => ({
            type: x.kind,
            kg: numOrNull(x.kg),
            reps: numOrNull(x.reps) != null ? Math.round(numOrNull(x.reps) as number) : null,
            rpe: x.rpe,
            durationSec: x.durationSec,
            distanceM: x.distanceM,
            done: false,
            pr: false
          }))
        }))
      };
      if (isNew) await post("/v1/routines", body);
      else await patch(`/v1/routines/${routineId}`, body);
      router.back();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    Alert.alert("Delete routine?", name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api(`/v1/routines/${routineId}`, { method: "DELETE" });
            router.back();
          } catch (e) {
            setError(e instanceof ApiError ? e.message : "Delete failed");
          }
        }
      }
    ]);
  }

  return (
    <View style={screenStyle}>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Field style={s.nameInput} value={name} onChangeText={setName} placeholder="Routine name" />
        {error && <Notice>{error}</Notice>}

        <Card style={s.folderCard}>
          <SectionHeader>Folder</SectionHeader>
          <View style={s.folderRow}>
            <Pill on={folderId === null} onPress={() => setFolderId(null)}>
              None
            </Pill>
            {folders.map((f) => (
              <Pill key={f._id} on={folderId === f._id} onPress={() => setFolderId(f._id)}>
                {f.name}
              </Pill>
            ))}
          </View>
          <View style={s.folderNew}>
            <Field
              inset
              style={s.folderInput}
              value={newFolder}
              onChangeText={setNewFolder}
              placeholder="New folder name"
            />
            <Btn label="Add" variant="secondary" size="sm" onPress={createFolder} />
          </View>
        </Card>

        {exercises.length === 0 ? (
          <EmptyState
            glyph="+"
            title="No exercises yet"
            body="Add the lifts you want to train, then set your working weights and reps."
          />
        ) : (
          exercises.map((e, ei) => (
            <Card key={e.key} style={s.card}>
              <View style={s.exHead}>
                <Text style={s.exName} numberOfLines={1}>
                  {ei + 1}. {e.name}
                </Text>
                <View style={s.exTools}>
                  <IconBtn glyph="↑" tone="accent" onPress={() => move(e.key, -1)} />
                  <IconBtn glyph="↓" tone="accent" onPress={() => move(e.key, 1)} />
                  <IconBtn
                    glyph="✕"
                    tone="danger"
                    onPress={() => setExercises((prev) => prev.filter((x) => x.key !== e.key))}
                  />
                </View>
              </View>
              <View style={s.restRow}>
                <Text style={s.colLabel}>Rest</Text>
                <Field
                  inset
                  style={[s.cell, s.restCell]}
                  value={e.restSec}
                  onChangeText={(v) =>
                    setExercises((prev) => prev.map((x) => (x.key === e.key ? { ...x, restSec: v } : x)))
                  }
                  keyboardType="number-pad"
                  placeholder="90"
                />
                <Text style={s.unit}>s</Text>
              </View>
              {e.sets.map((x, i) => (
                <View key={x.key} style={s.setRow}>
                  <Pill
                    style={[s.kindChip, { borderColor: SET_TYPE_META[x.kind].color }]}
                    onPress={() =>
                      patchSet(e.key, x.key, {
                        kind: KIND_ORDER[(KIND_ORDER.indexOf(x.kind) + 1) % KIND_ORDER.length]
                      })
                    }
                  >
                    <Text style={[s.kindText, { color: SET_TYPE_META[x.kind].color }]}>
                      {SET_TYPE_META[x.kind].short}
                    </Text>
                  </Pill>
                  <Text style={s.setNum}>{i + 1}</Text>
                  <Field
                    inset
                    style={s.cell}
                    value={x.kg}
                    onChangeText={(v) => patchSet(e.key, x.key, { kg: v })}
                    keyboardType="decimal-pad"
                    placeholder="kg"
                  />
                  <Field
                    inset
                    style={s.cell}
                    value={x.reps}
                    onChangeText={(v) => patchSet(e.key, x.key, { reps: v })}
                    keyboardType="number-pad"
                    placeholder="reps"
                  />
                  <IconBtn
                    glyph="✕"
                    onPress={() =>
                      setExercises((prev) =>
                        prev.map((ex) =>
                          ex.key === e.key ? { ...ex, sets: ex.sets.filter((y) => y.key !== x.key) } : ex
                        )
                      )
                    }
                  />
                </View>
              ))}
              <Btn
                label="+ Add set"
                variant="secondary"
                size="sm"
                style={s.addSet}
                onPress={() =>
                  setExercises((prev) =>
                    prev.map((ex) => (ex.key === e.key ? { ...ex, sets: [...ex.sets, blankSet()] } : ex))
                  )
                }
              />
            </Card>
          ))
        )}

        <Btn label="+ Add exercise" variant="secondary" onPress={() => setPickerOpen(true)} />
        <View style={{ height: S.lg }} />
        <Btn
          label={saving ? "Saving…" : isNew ? "Create routine" : "Save changes"}
          disabled={saving}
          onPress={save}
        />
        {!isNew && <Btn label="Delete routine" variant="danger" style={s.deleteBtn} onPress={remove} />}
      </ScrollView>

      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={s.modal}>
          <Text style={s.modalTitle}>Add exercise</Text>
          <Field
            style={[s.nameInput, s.searchInput]}
            placeholder="Search exercises…"
            value={query}
            onChangeText={setQuery}
            autoFocus
          />
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: S.lg }} showsVerticalScrollIndicator={false}>
            {visibleTemplates.length === 0 ? (
              <EmptyState
                glyph="+"
                title="No matches"
                body="Try a shorter or different term."
              />
            ) : (
              visibleTemplates.slice(0, 50).map((t) => (
                <TouchableOpacity
                  key={t._id}
                  style={s.result}
                  activeOpacity={0.6}
                  onPress={() => {
                    addExercise(t);
                    setPickerOpen(false);
                    setQuery("");
                  }}
                >
                  <ExerciseThumb
                    name={t.name}
                    primaryMuscle={t.primaryMuscle}
                    equipment={t.equipment}
                    mediaUrl={t.mediaUrl}
                  />
                  <View style={s.resultText}>
                    <Text style={s.resultName} numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text style={s.meta}>
                      {t.primaryMuscle}
                      {t.equipment ? ` · ${t.equipment}` : ""}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
          <Btn label="Close" variant="secondary" onPress={() => setPickerOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}

const useStyles = (theme: any) => StyleSheet.create({
  nameInput: { ...T.title, fontSize: 22, minHeight: 52, marginBottom: S.lg, color: theme.text },
  folderCard: { paddingVertical: S.lg },
  folderRow: { flexDirection: "row", flexWrap: "wrap", gap: S.sm },
  folderNew: { flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: S.md },
  folderInput: { flex: 1 },

  card: { paddingVertical: S.lg },
  exHead: { flexDirection: "row", alignItems: "center" },
  exName: { ...T.heading, color: theme.text, flex: 1 },
  exTools: { flexDirection: "row" },

  restRow: { flexDirection: "row", alignItems: "center", gap: S.sm, marginTop: S.md },
  restCell: { flex: 0, width: 84 },
  unit: { ...T.meta, color: theme.dim },
  colLabel: { ...T.micro, color: theme.dim, textTransform: "uppercase", width: 44 },

  setRow: { flexDirection: "row", alignItems: "center", gap: S.xs, marginTop: S.sm },
  setNum: { ...T.meta, width: 24, textAlign: "center", color: theme.dim, ...NUM },
  kindChip: { width: 34, minHeight: 34, paddingHorizontal: 0, backgroundColor: "transparent" },
  kindText: { fontSize: 12, fontWeight: "800" },
  cell: { flex: 1, textAlign: "center", ...NUM },
  addSet: { marginTop: S.md },

  deleteBtn: { marginTop: S.sm },

  modal: { flex: 1, backgroundColor: theme.bg, padding: S.lg, paddingTop: 56, gap: S.md },
  modalTitle: { ...T.title, fontSize: 22, color: theme.text },
  searchInput: { marginBottom: 0 },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.md,
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.border
  },
  resultText: { flex: 1 },
  resultName: { ...T.heading, fontSize: 15, color: theme.text },
  meta: { ...T.meta, color: theme.dim, marginTop: 2 }
});
