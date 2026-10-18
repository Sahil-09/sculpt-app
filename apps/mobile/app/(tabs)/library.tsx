import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { get, resolveMediaUrl, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useTheme } from "../../lib/ThemeContext";
import { NUM, R, S, T } from "../../lib/theme";
import {
  AppHeader,
  Badge,
  Btn,
  Card,
  EmptyState,
  ExerciseThumb,
  Field,
  Icon8,
  IconBtn,
  Notice,
  Pill,
  SectionHeader,
  useScreenStyle
} from "../../lib/ui";

interface InstructionEntry {
  text?: string;
  steps?: string[];
}

interface Template {
  _id: string;
  datasetId?: string | null;
  name: string;
  primaryMuscle: string;
  secondaryMuscles?: string[];
  category?: string | null;
  equipment?: string | null;
  mediaUrl?: string | null;
  gifUrl?: string | null;
  instructions?: Record<string, InstructionEntry>;
  isCustom?: boolean;
}

interface RoutineItem {
  _id: string;
  name: string;
  folderId?: string | null;
  exercises: Array<{ exerciseId: string; sets: unknown[] }>;
}

const MAX_ROWS = 120;
const label = (v?: string | null) => (v ? v.replace(/_/g, " ").toUpperCase() : "");

const PRIMARY_MUSCLES = [
  "all",
  "back",
  "legs",
  "shoulders",
  "chest",
  "arms",
  "core"
];

export default function Library() {
  const { ready, user } = useAuth();
  const { theme, A } = useTheme();
  const screenStyle = useScreenStyle();
  const s = useStyles(theme, A);
  const [activeTab, setActiveTab] = useState<"library" | "routines">("library");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equip, setEquip] = useState<string | null>(null);
  const [prOnly, setPrOnly] = useState(false);
  const [prIds, setPrIds] = useState<Set<string>>(new Set());
  const [sheet, setSheet] = useState<"muscle" | "equip" | null>(null);
  const [detailFor, setDetailFor] = useState<Template | null>(null);
  const [detailLang, setDetailLang] = useState<string>("en");
  const [detailGifErr, setDetailGifErr] = useState(false);

  const openDetail = useCallback(async (tpl: Template) => {
    setDetailGifErr(false);
    setDetailFor(tpl);
    if (!tpl.instructions && !tpl.isCustom) {
      try {
        const full = await get<Template>(`/v1/exercise-templates/${encodeURIComponent(tpl.datasetId || tpl._id)}`);
        setDetailFor((cur) => (cur && cur._id === tpl._id ? { ...tpl, ...full, _id: tpl._id } : cur));
      } catch {
        // Keep partial template info
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (ready && !user) router.replace("/login");
    }, [ready, user])
  );

  useEffect(() => {
    if (!user) return;
    let live = true;
    setLoading(true);
    setError(null);
    Promise.allSettled([
      get<{ items: Template[] }>("/v1/exercise-templates?limit=2000"),
      get<{ items: RoutineItem[] }>("/v1/routines")
    ]).then(([tplRes, routRes]) => {
      if (!live) return;
      if (tplRes.status === "fulfilled") setTemplates(tplRes.value.items ?? []);
      if (routRes.status === "fulfilled") setRoutines(routRes.value.items ?? []);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [user]);

  const togglePr = useCallback(async () => {
    if (prOnly) {
      setPrOnly(false);
      return;
    }
    setPrOnly(true);
    try {
      const d = await get<{ items: Array<{ exerciseId: string }> }>("/v1/stats/exercises?days=365");
      setPrIds(new Set(d.items.map((i) => i.exerciseId)));
    } catch {
      setPrIds(new Set());
      setPrOnly(false);
    }
  }, [prOnly]);

  const muscleOptions = useMemo(
    () => [...new Set(templates.map((t) => t.primaryMuscle))].sort(),
    [templates]
  );
  const equipOptions = useMemo(
    () => [...new Set(templates.map((t) => t.equipment).filter((e): e is string => !!e))].sort(),
    [templates]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return templates.filter((t) => {
      if (muscle && muscle !== "all") {
        if (!t.primaryMuscle.toLowerCase().includes(muscle.toLowerCase())) return false;
      }
      if (equip && t.equipment !== equip) return false;
      if (prOnly && !prIds.has(t._id)) return false;
      if (q && !t.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, muscle, equip, prOnly, prIds, query]);

  if (!ready || !user) return <View style={screenStyle} />;

  const choose = (v: string) => {
    if (sheet === "muscle") setMuscle(v === "all" ? null : v);
    else setEquip(v);
    setSheet(null);
  };
  const current = sheet === "muscle" ? muscle : equip;
  const options = sheet === "muscle" ? ["all", ...muscleOptions] : equipOptions;

  return (
    <View style={screenStyle}>
      <AppHeader title="ROUTINES" />

      {/* Top Bauhaus 2-Tab Switch */}
      <View style={s.topTabSwitch}>
        <Pressable
          style={[
            s.topTabBtn,
            activeTab === "library" ? s.topTabBtnActive : s.topTabBtnInactive
          ]}
          onPress={() => setActiveTab("library")}
        >
          <Icon8
            name="book"
            size={15}
            color={activeTab === "library" ? (theme.isDark ? theme.accent : "#ffffff") : theme.dim}
          />
          <Text style={[s.topTabLabel, activeTab === "library" && s.topTabLabelActive]}>
            EXERCISE LIBRARY
          </Text>
        </Pressable>

        <Pressable
          style={[
            s.topTabBtn,
            activeTab === "routines" ? s.topTabBtnActive : s.topTabBtnInactive
          ]}
          onPress={() => setActiveTab("routines")}
        >
          <Icon8
            name="folder"
            size={15}
            color={activeTab === "routines" ? (theme.isDark ? theme.accent : "#ffffff") : theme.dim}
          />
          <Text style={[s.topTabLabel, activeTab === "routines" && s.topTabLabelActive]}>
            MY ROUTINES ({routines.length})
          </Text>
        </Pressable>
      </View>

      {error && <Notice>{error}</Notice>}

      {activeTab === "library" ? (
        <FlatList
          data={visible.slice(0, MAX_ROWS)}
          keyExtractor={(t) => t._id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={s.libraryHeader}>
              {/* Minimalist Search Bar */}
              <View style={s.searchBarContainer}>
                <Icon8 name="search" size={15} color={theme.dim} style={s.searchIcon} />
                <Field
                  style={s.searchInput}
                  placeholder={`SEARCH ${templates.length || "180+"} MOVEMENTS...`}
                  placeholderTextColor={theme.dim}
                  value={query}
                  onChangeText={setQuery}
                  autoCorrect={false}
                  returnKeyType="search"
                />
                {!!query && (
                  <Pressable onPress={() => setQuery("")} hitSlop={8} style={s.searchClearBtn}>
                    <Text style={s.searchClearText}>✕</Text>
                  </Pressable>
                )}
              </View>

              {/* Secondary Filter Chips Bar */}
              <View style={s.secondaryFilterBar}>
                <Pressable
                  style={[s.filterTriggerBtn, !!muscle && s.filterTriggerActive]}
                  onPress={() => setSheet("muscle")}
                >
                  <Text style={s.filterTriggerText} numberOfLines={1}>
                    {muscle ? label(muscle) : "ALL MUSCLES"}
                  </Text>
                  <Text style={s.filterTriggerChevron}>▾</Text>
                </Pressable>

                <Pressable
                  style={[s.filterTriggerBtn, !!equip && s.filterTriggerActive]}
                  onPress={() => setSheet("equip")}
                >
                  <Text style={s.filterTriggerText} numberOfLines={1}>
                    {equip ? label(equip) : "EQUIPMENT"}
                  </Text>
                  <Icon8 name="settings" size={13} color={theme.dim} />
                </Pressable>

                <Pressable
                  style={[s.prsToggleBtn, prOnly && s.prsToggleActive]}
                  onPress={togglePr}
                >
                  <Icon8
                    name="trophy"
                    size={13}
                    color={prOnly ? theme.onAccent : theme.accent}
                  />
                  <Text style={[s.prsText, prOnly && s.prsTextActive]}>PRS</Text>
                </Pressable>
              </View>

              {/* Horizontal Scrollable Muscle Pills */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.muscleScroll}
                contentContainerStyle={s.muscleScrollInner}
              >
                {PRIMARY_MUSCLES.map((m) => {
                  const isActive = (m === "all" && !muscle) || muscle === m;
                  return (
                    <Pressable
                      key={m}
                      style={[
                        s.musclePill,
                        isActive ? s.musclePillActive : s.musclePillInactive
                      ]}
                      onPress={() => setMuscle(m === "all" ? null : m)}
                    >
                      <Text
                        style={[
                          s.musclePillText,
                          isActive ? s.musclePillTextActive : s.musclePillTextInactive
                        ]}
                      >
                        {m.toUpperCase()}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Bauhaus Metric Progression Banner */}
              <View style={s.progressionBanner}>
                <View style={s.progressionLeft}>
                  <Icon8 name="bolt" size={16} color={theme.onAccent} />
                  <Text style={s.progressionTitle}>HEAVY PROGRESSION BLOCK</Text>
                </View>
                <Text style={s.progressionSub}>MESO 03 · W12</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            loading ? null : (
              <EmptyState
                glyph="+"
                title="Nothing matches"
                body="No movement fits this combination — try another muscle or search query."
              />
            )
          }
          renderItem={({ item }) => {
            const isPr = prIds.has(item._id);
            return (
              <Card style={s.exerciseCard}>
                <View style={s.exerciseCardContent}>
                  {/* Left Column: Badges, Title, Telemetry */}
                  <View style={s.exerciseMainCol}>
                    <View style={s.exerciseTagsRow}>
                      <View style={s.tagBadgePrimary}>
                        <Text style={s.tagBadgePrimaryText}>{label(item.primaryMuscle)}</Text>
                      </View>
                      {item.equipment && (
                        <View style={s.tagBadgeSecondary}>
                          <Text style={s.tagBadgeSecondaryText}>{label(item.equipment)}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={s.exerciseName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={s.exerciseMetaRow}>
                      <View style={s.prBadge}>
                        <Icon8 name="trophy" size={13} color={isPr ? theme.accent : theme.dim} />
                        <Text style={[s.prBadgeText, isPr && s.prBadgeTextActive]}>
                          {isPr ? "PR: 210 KG · 1RM" : "EST. 1RM"}
                        </Text>
                      </View>
                      <Text style={s.rpeText}>· RPE 9.5</Text>
                      <Pressable
                        style={s.infoMetaBtn}
                        onPress={() => openDetail(item)}
                        hitSlop={8}
                        accessibilityLabel={`Info about ${item.name}`}
                      >
                        <Icon8 name="info" size={13} color={theme.accent} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Right Column: 56x56 Square Thumbnail + "+ ADD" button */}
                  <View style={s.exerciseRightCol}>
                    <View style={s.thumbBox}>
                      <ExerciseThumb
                        name={item.name}
                        primaryMuscle={item.primaryMuscle}
                        equipment={item.equipment}
                        mediaUrl={item.mediaUrl}
                        size={56}
                        shape="square"
                      />
                    </View>

                    <Pressable
                      style={s.addRoutineBtn}
                      onPress={() => router.push(`/live?mode=empty&exerciseId=${item._id}`)}
                      hitSlop={6}
                    >
                      <Icon8 name="add" size={12} color={theme.text} />
                      <Text style={s.addRoutineText}>ADD</Text>
                    </Pressable>
                  </View>
                </View>
              </Card>
            );
          }}
          ListFooterComponent={
            <View style={s.libraryFooter}>
              {visible.length > MAX_ROWS && (
                <Text style={s.cappedText}>
                  Showing {MAX_ROWS} of {visible.length.toLocaleString()} movements
                </Text>
              )}
              <Pressable
                style={s.newExerciseBtn}
                onPress={() => router.push("/live?mode=empty")}
              >
                <Text style={s.newExerciseText}>＋ NEW EXERCISE</Text>
              </Pressable>
            </View>
          }
        />
      ) : (
        /* My Routines View */
        <FlatList
          data={routines}
          keyExtractor={(r) => r._id}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={s.routinesHeadContainer}>
              <View style={s.routinesHeadRow}>
                <View>
                  <Text style={s.sectionEyebrow}>TEMPLATES</Text>
                  <Text style={s.sectionTitle}>MY ROUTINES ({routines.length})</Text>
                </View>
                <Pill onPress={() => router.push("/routine")}>
                  + New Routine
                </Pill>
              </View>
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              glyph="+"
              title="No routines yet"
              body="Build your custom routine or choose from starter workouts."
              action={
                <Btn
                  label="+ Create Routine"
                  onPress={() => router.push("/routine")}
                  style={{ marginTop: S.sm }}
                />
              }
            />
          }
          renderItem={({ item }) => (
            <Card style={s.routineCard}>
              <View style={s.routineCardHead}>
                <View style={{ flex: 1 }}>
                  <Text style={s.routineCardTitle}>{item.name}</Text>
                  <Text style={s.routineCardMeta}>
                    {item.exercises.length} lifts ·{" "}
                    {item.exercises.reduce((n, e) => n + e.sets.length, 0)} sets
                  </Text>
                </View>
                <Badge label={item.folderId ? "Folder" : "Active"} tone="accent" />
              </View>
              <View style={s.routineBtnRow}>
                <Pressable
                  style={s.routineStartBtn}
                  onPress={() => router.push(`/live?mode=routine&routineId=${item._id}`)}
                >
                  <Text style={s.routineStartText}>START ROUTINE</Text>
                  <Text style={s.routineStartArrow}>→</Text>
                </Pressable>
                <Pressable
                  style={s.routineEditBtn}
                  onPress={() => router.push(`/routine?routineId=${item._id}`)}
                >
                  <Text style={s.routineEditText}>Edit</Text>
                </Pressable>
              </View>
            </Card>
          )}
        />
      )}

      {/* Filter Bottom Sheet Modal */}
      {sheet && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setSheet(null)}>
          <Pressable style={s.modalScrim} onPress={() => setSheet(null)}>
            <Card style={s.modalSheet}>
              <SectionHeader
                action={
                  <Btn label="Done" variant="ghost" size="sm" onPress={() => setSheet(null)} />
                }
              >
                {sheet === "muscle" ? "FILTER BY MUSCLE" : "FILTER BY EQUIPMENT"}
              </SectionHeader>
              <ScrollView style={s.modalList} showsVerticalScrollIndicator={false}>
                {options.map((opt) => {
                  const sel = (sheet === "muscle" && opt === "all" && !muscle) || current === opt;
                  return (
                    <Pressable
                      key={opt}
                      style={[s.modalItem, sel && s.modalItemActive]}
                      onPress={() => choose(opt)}
                    >
                      <Text style={[s.modalItemText, sel && s.modalItemTextActive]}>
                        {opt === "all" ? "ALL MUSCLES" : label(opt)}
                      </Text>
                      {sel && <Text style={s.modalItemCheck}>✓</Text>}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Card>
          </Pressable>
        </Modal>
      )}

      {/* Execution Blueprint / Form Cue Modal */}
      {detailFor && (
        <Modal visible animationType="slide" onRequestClose={() => setDetailFor(null)}>
          <View style={s.detailModal}>
            <View style={s.detailModalHead}>
              <View style={s.blueprintBadge}>
                <Text style={s.blueprintBadgeText}>EXECUTION BLUEPRINT</Text>
              </View>
              <Pressable onPress={() => setDetailFor(null)} hitSlop={8} style={s.modalCloseBtn}>
                <Icon8 name="close" size={18} color={theme.text} />
              </Pressable>
            </View>

            <Text style={s.detailModalTitle} numberOfLines={2}>
              {detailFor.name.toUpperCase()}
            </Text>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {/* Banner with Kinetic Cue Badge */}
              <View style={s.detailBannerBox}>
                {(() => {
                  const gifUri = resolveMediaUrl(detailFor.gifUrl ?? detailFor.mediaUrl);
                  return gifUri && !detailGifErr ? (
                    <Image
                      source={{ uri: gifUri }}
                      style={s.detailBannerImg}
                      resizeMode="contain"
                      onError={() => setDetailGifErr(true)}
                    />
                  ) : (
                    <ExerciseThumb
                      name={detailFor.name}
                      primaryMuscle={detailFor.primaryMuscle}
                      equipment={detailFor.equipment}
                      mediaUrl={detailFor.mediaUrl}
                      size={80}
                    />
                  );
                })()}
                <View style={s.kineticCueChip}>
                  <Text style={s.kineticCueChipText}>KINETIC CUE</Text>
                </View>
              </View>

              {/* Target Meta */}
              <View style={s.detailMetaCard}>
                <Text style={s.detailMetaText}>
                  TARGET: <Text style={{ color: theme.text, fontWeight: "700" }}>{detailFor.primaryMuscle.toUpperCase()}</Text>
                  {detailFor.equipment ? ` · EQUIPMENT: ${detailFor.equipment.toUpperCase()}` : ""}
                  {detailFor.category ? ` · CATEGORY: ${detailFor.category.toUpperCase()}` : ""}
                </Text>
                {detailFor.secondaryMuscles && detailFor.secondaryMuscles.length > 0 && (
                  <Text style={[s.detailMetaText, { marginTop: 4 }]}>
                    SECONDARY: {detailFor.secondaryMuscles.join(", ").toUpperCase()}
                  </Text>
                )}
              </View>

              {/* Multilingual instructions */}
              {detailFor.instructions && (
                <View style={{ marginTop: 12 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                    {(["en", "es", "fr", "it", "tr", "ru", "zh", "hi", "pl", "ko"] as const).map((lang) => (
                      <Pill
                        key={lang}
                        on={detailLang === lang}
                        onPress={() => setDetailLang(lang)}
                        style={{ marginRight: 6 }}
                      >
                        {lang.toUpperCase()}
                      </Pill>
                    ))}
                  </ScrollView>

                  <Card style={{ padding: 14 }}>
                    <SectionHeader>Instructions ({detailLang.toUpperCase()})</SectionHeader>
                    {(detailFor.instructions[detailLang]?.steps ?? detailFor.instructions.en?.steps ?? []).map(
                      (step, idx) => (
                        <View key={idx} style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                          <Text style={{ ...T.micro, color: theme.accent, width: 22, fontSize: 12 }}>{idx + 1}.</Text>
                          <Text style={{ ...T.bodySm, color: theme.text, flex: 1, lineHeight: 19 }}>
                            {step}
                          </Text>
                        </View>
                      )
                    )}
                    {!(detailFor.instructions[detailLang]?.steps?.length) &&
                      detailFor.instructions[detailLang]?.text && (
                        <Text style={{ ...T.bodySm, color: theme.text, marginTop: 8, lineHeight: 19 }}>
                          {detailFor.instructions[detailLang]?.text}
                        </Text>
                      )}
                  </Card>
                </View>
              )}

              {/* Dismiss Button */}
              <Pressable
                style={s.gotItBtn}
                onPress={() => setDetailFor(null)}
              >
                <Text style={s.gotItBtnText}>GOT IT, LOCK IN</Text>
              </Pressable>
            </ScrollView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const useStyles = (theme: any, A: any) =>
  StyleSheet.create({
    topTabSwitch: {
      flexDirection: "row",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      padding: 4,
      borderRadius: theme.radius.md,
      marginBottom: 16
    },
    topTabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: theme.radius.sm
    },
    topTabBtnActive: {
      backgroundColor: theme.isDark ? theme.surface3 : "#1a1a1a",
      borderColor: theme.isDark ? theme.borderStrong : "#1a1a1a",
      borderWidth: 1
    },
    topTabBtnInactive: {
      backgroundColor: "transparent"
    },
    topTabIcon: {
      fontSize: 14
    },
    topTabIconActive: {
      color: theme.accent
    },
    topTabLabel: {
      ...T.label,
      fontSize: 11,
      color: theme.dim
    },
    topTabLabelActive: {
      color: "#ffffff",
      fontWeight: "800"
    },

    libraryHeader: {
      paddingBottom: 4
    },
    searchBarContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 12,
      minHeight: 44,
      marginBottom: 10
    },
    searchIcon: {
      fontSize: 15,
      color: theme.dim,
      marginRight: 8
    },
    searchInput: {
      flex: 1,
      backgroundColor: "transparent",
      borderWidth: 0,
      minHeight: 44,
      ...T.label,
      fontSize: 11.5,
      color: theme.text,
      paddingHorizontal: 0
    },
    searchClearBtn: {
      padding: 6
    },
    searchClearText: {
      fontSize: 13,
      color: theme.dim,
      fontWeight: "700"
    },

    secondaryFilterBar: {
      flexDirection: "row",
      gap: 8,
      marginBottom: 10
    },
    filterTriggerBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 10,
      paddingVertical: 8
    },
    filterTriggerActive: {
      borderColor: theme.accent
    },
    filterTriggerText: {
      ...T.micro,
      fontSize: 10,
      color: theme.text,
      fontWeight: "700"
    },
    filterTriggerChevron: {
      fontSize: 11,
      color: theme.dim
    },
    prsToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 12,
      paddingVertical: 8
    },
    prsToggleActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent
    },
    prsStar: {
      fontSize: 13,
      color: theme.dim
    },
    prsStarActive: {
      color: theme.onAccent
    },
    prsText: {
      ...T.micro,
      fontSize: 10,
      color: theme.text,
      fontWeight: "700"
    },
    prsTextActive: {
      color: theme.onAccent
    },

    muscleScroll: {
      marginBottom: 12
    },
    muscleScrollInner: {
      flexDirection: "row",
      gap: 6,
      paddingVertical: 2
    },
    musclePill: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: theme.radius.sm,
      borderWidth: 1
    },
    musclePillActive: {
      backgroundColor: theme.accent,
      borderColor: theme.accent
    },
    musclePillInactive: {
      backgroundColor: theme.surface2,
      borderColor: theme.border
    },
    musclePillText: {
      ...T.micro,
      fontSize: 10.5,
      letterSpacing: 0.8
    },
    musclePillTextActive: {
      color: theme.onAccent,
      fontWeight: "800"
    },
    musclePillTextInactive: {
      color: theme.dim,
      fontWeight: "600"
    },

    progressionBanner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: theme.accent,
      borderRadius: theme.radius.sm,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 16
    },
    progressionLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6
    },
    progressionBolt: {
      fontSize: 16
    },
    progressionTitle: {
      ...T.label,
      fontSize: 11.5,
      color: theme.onAccent,
      fontWeight: "800"
    },
    progressionSub: {
      ...T.micro,
      fontSize: 10,
      color: theme.onAccent,
      fontWeight: "700"
    },

    exerciseCard: {
      padding: 14,
      borderRadius: theme.radius.md,
      marginBottom: 10,
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1
    },
    exerciseCardContent: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12
    },
    exerciseMainCol: {
      flex: 1,
      minWidth: 0
    },
    exerciseTagsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 6
    },
    tagBadgePrimary: {
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: theme.radius.xs,
      backgroundColor: theme.isDark ? theme.surface3 : "#1a1a1a"
    },
    tagBadgePrimaryText: {
      ...T.micro,
      fontSize: 9.5,
      fontWeight: "800",
      color: "#ffffff",
      letterSpacing: 0.8
    },
    tagBadgeSecondary: {
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: theme.radius.xs,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1
    },
    tagBadgeSecondaryText: {
      ...T.micro,
      fontSize: 9.5,
      fontWeight: "700",
      color: theme.dim,
      letterSpacing: 0.8
    },
    exerciseName: {
      ...T.heading,
      fontSize: 15,
      color: theme.text,
      letterSpacing: -0.2,
      marginBottom: 6
    },
    exerciseMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5
    },
    prBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4
    },
    prBadgeText: {
      ...T.micro,
      fontSize: 10,
      color: theme.dim,
      fontWeight: "700",
      letterSpacing: 0.6
    },
    prBadgeTextActive: {
      color: theme.accent
    },
    rpeText: {
      ...T.micro,
      fontSize: 10,
      color: theme.dim,
      opacity: 0.7
    },
    infoMetaBtn: {
      width: 20,
      height: 20,
      borderRadius: theme.radius.xs,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 4
    },
    exerciseRightCol: {
      alignItems: "flex-end",
      gap: 8,
      flexShrink: 0
    },
    thumbBox: {
      width: 56,
      height: 56,
      borderRadius: theme.radius.sm,
      overflow: "hidden",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1
    },
    addRoutineBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: theme.radius.xs,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1
    },
    addRoutineText: {
      ...T.micro,
      fontSize: 9.5,
      color: theme.text,
      fontWeight: "800",
      letterSpacing: 0.8
    },

    // Execution Blueprint Modal
    detailModal: {
      flex: 1,
      backgroundColor: theme.bg,
      padding: 20,
      paddingTop: 54
    },
    detailModalHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 12
    },
    blueprintBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: theme.radius.xs,
      backgroundColor: theme.isDark ? theme.surface3 : "#1a1a1a"
    },
    blueprintBadgeText: {
      ...T.micro,
      fontSize: 10,
      color: "#ffffff",
      fontWeight: "800",
      letterSpacing: 1.2
    },
    modalCloseBtn: {
      padding: 6
    },
    detailModalTitle: {
      ...T.heading,
      fontSize: 20,
      color: theme.text,
      letterSpacing: -0.4,
      marginBottom: 14
    },
    detailBannerBox: {
      height: 140,
      borderRadius: theme.radius.md,
      overflow: "hidden",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      marginBottom: 14
    },
    detailBannerImg: {
      width: "100%",
      height: "100%"
    },
    kineticCueChip: {
      position: "absolute",
      bottom: 8,
      left: 8,
      backgroundColor: "rgba(0,0,0,0.75)",
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: theme.radius.xs
    },
    kineticCueChipText: {
      ...T.micro,
      fontSize: 9,
      color: theme.accent,
      fontWeight: "800",
      letterSpacing: 1
    },
    detailMetaCard: {
      padding: 12,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      marginBottom: 12
    },
    detailMetaText: {
      ...T.micro,
      fontSize: 10.5,
      color: theme.dim,
      letterSpacing: 0.6
    },
    gotItBtn: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.accent,
      paddingVertical: 14,
      borderRadius: theme.radius.sm,
      marginTop: 18
    },
    gotItBtnText: {
      ...T.label,
      fontSize: 12,
      color: theme.onAccent,
      fontWeight: "800",
      letterSpacing: 1
    },

    libraryFooter: {
      paddingVertical: S.lg,
      alignItems: "center",
      gap: S.sm
    },
    cappedText: {
      ...T.meta,
      color: theme.dim,
      fontSize: 11
    },
    newExerciseBtn: {
      width: "100%",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.isDark ? theme.surface3 : "#1a1a1a",
      borderRadius: theme.radius.sm,
      paddingVertical: S.md
    },
    newExerciseText: {
      ...T.label,
      color: "#ffffff",
      fontSize: 12
    },

    // Routines View Styles
    routinesHeadContainer: {
      marginBottom: S.sm
    },
    routinesHeadRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between"
    },
    sectionEyebrow: {
      ...T.micro,
      color: theme.dim,
      fontSize: 10
    },
    sectionTitle: {
      ...T.heading,
      color: theme.text,
      fontSize: 14,
      marginTop: 2
    },
    routineCard: {
      padding: S.md,
      borderRadius: theme.radius.md,
      marginBottom: S.md
    },
    routineCardHead: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between"
    },
    routineCardTitle: {
      ...T.heading,
      fontSize: 15,
      color: theme.text
    },
    routineCardMeta: {
      ...T.meta,
      color: theme.dim,
      marginTop: 3,
      ...NUM
    },
    routineBtnRow: {
      flexDirection: "row",
      gap: S.sm,
      marginTop: S.md
    },
    routineStartBtn: {
      flex: 3,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: theme.accent,
      borderRadius: theme.radius.sm,
      paddingVertical: S.sm
    },
    routineStartText: {
      ...T.label,
      color: theme.onAccent,
      fontSize: 11.5
    },
    routineStartArrow: {
      fontSize: 13,
      fontWeight: "800",
      color: theme.onAccent
    },
    routineEditBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface2,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.sm,
      paddingVertical: S.sm
    },
    routineEditText: {
      ...T.meta,
      color: theme.text,
      fontWeight: "600"
    },

    // Modal
    modalScrim: {
      flex: 1,
      backgroundColor: A.scrim,
      justifyContent: "flex-end"
    },
    modalSheet: {
      maxHeight: "65%",
      borderBottomLeftRadius: 0,
      borderBottomRightRadius: 0,
      borderTopLeftRadius: R.lg,
      borderTopRightRadius: R.lg,
      padding: S.lg
    },
    modalList: {
      marginTop: S.sm
    },
    modalItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: S.md,
      borderBottomWidth: 1,
      borderBottomColor: theme.surface2
    },
    modalItemActive: {
      backgroundColor: theme.surface2
    },
    modalItemText: {
      ...T.body,
      color: theme.text,
      fontWeight: "600"
    },
    modalItemTextActive: {
      color: theme.accent,
      fontWeight: "800"
    },
    modalItemCheck: {
      fontSize: 16,
      color: theme.accent,
      fontWeight: "800"
    }
  });
