import { memo, useMemo, useState, type ReactElement, type ReactNode } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { resolveMediaUrl } from "./api";
import { useTheme } from "./ThemeContext";
import { R, S, T, NUM } from "./theme";

/** Every screen's outer container: app background plus consistent gutters and safe area. */
export function useScreenStyle(): ViewStyle {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  return {
    flex: 1,
    backgroundColor: theme.bg,
    paddingHorizontal: 20,
    paddingTop: insets.top
  };
}

export const ICONS8_MAP = {
  dumbbell: "87748",
  dumbbell_filled: "87777",
  calendar: "84997",
  heart: "86291",
  trophy: "85613",
  trophy_filled: "85620",
  timer: "85465",
  hourglass: "116452",
  check: "82766",
  bolt: "86554",
  lightbulb: "85929",
  search: "82712",
  settings: "82701",
  book: "85767",
  folder: "82790",
  folder_filled: "83172",
  user: "82751",
  user_filled: "83190",
  home: "83326",
  home_filled: "86527",
  fastForward: "87488",
  add: "85479",
  note: "86843",
  verified: "85086",
  scale: "101181",
  sun: "82718",
  moon: "88848",
  trendingUp: "87702",
  info: "82742",
  play: "398",
  pause: "403",
  close: "46"
} as const;

export type Icon8Name = keyof typeof ICONS8_MAP;

/** Genuine Icons8 icon rendered via image with dynamic theme tinting and optional filled variant. */
export function Icon8({
  name,
  filled = false,
  size = 18,
  color,
  style
}: {
  name: Icon8Name;
  filled?: boolean;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { theme } = useTheme();
  const tint = color ?? theme.text;
  const targetKey = (filled && `${name}_filled` in ICONS8_MAP
    ? `${name}_filled`
    : name) as Icon8Name;
  const id = ICONS8_MAP[targetKey];
  const hex = typeof tint === "string" && tint.startsWith("#") ? tint.slice(1) : undefined;
  const uri = hex
    ? `https://img.icons8.com/?id=${id}&format=png&size=48&color=${hex}`
    : `https://img.icons8.com/?id=${id}&format=png&size=48`;

  return (
    <Image
      source={{ uri }}
      style={[
        {
          width: size,
          height: size,
          tintColor: tint
        },
        style as any
      ]}
      resizeMode="contain"
    />
  );
}

/** Top App Header matching Stitch across all screens. */
export function AppHeader({
  title,
  rightAction
}: {
  title: string;
  rightAction?: ReactNode;
}) {
  const { theme } = useTheme();
  const s = useStyles(theme);
  return (
    <View style={s.appHeader}>
      <Pressable
        style={s.appHeaderLogo}
        onPress={() => router.navigate("/(tabs)")}
        hitSlop={8}
      >
        <View style={s.logoIcon}>
          <View style={[s.logoBar, { height: 13, backgroundColor: theme.accent }]} />
          <View style={[s.logoBar, { height: 19, backgroundColor: theme.text }]} />
          <View style={[s.logoBar, { height: 10, backgroundColor: theme.accent }]} />
        </View>
        <Text style={s.appHeaderBrand}>SCULPT</Text>
      </Pressable>
      <View style={s.appHeaderCenter}>
        <Text style={s.appHeaderTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={s.appHeaderRight}>
        {rightAction !== undefined ? (
          rightAction
        ) : (
          <Pressable
            style={s.avatarBtn}
            onPress={() => router.navigate("/(tabs)/profile")}
            hitSlop={8}
            accessibilityLabel="Open profile"
          >
            <View style={s.avatarRing}>
              <Text style={s.avatarRingText}>MV</Text>
            </View>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Pulsing status indicator dot. */
export function PulseDot({ color }: { color?: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: color ?? theme.accent,
        marginRight: 4
      }}
    />
  );
}

/** High-contrast Badge chip. */
export function Badge({
  label,
  tone = "default",
  style
}: {
  label: string;
  tone?: "default" | "accent" | "danger" | "blue" | "dark";
  style?: StyleProp<ViewStyle>;
}) {
  const { theme, A } = useTheme();
  const s = useStyles(theme, A);
  const fill = (s as any)[`badge_${tone}`];
  const text = (s as any)[`badgeText_${tone}`];
  return (
    <View style={[s.badge, fill, style]}>
      <Text style={[s.badgeText, text]}>{label}</Text>
    </View>
  );
}

/** Layered surface — hairline border, crisp corners. */
export function Card({
  tone = "plain",
  style,
  children
}: {
  tone?: "plain" | "accent" | "good" | "danger";
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const s = useStyles(theme);
  return (
    <View style={[s.card, tone !== "plain" && { borderColor: theme[tone as keyof typeof theme] as string }, style]}>
      {children}
    </View>
  );
}

/** Tracked-out uppercase label, optionally with a trailing control. */
export function SectionHeader({
  action,
  style,
  children
}: {
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const s = useStyles(theme);
  return (
    <View style={[s.sectionHead, style]}>
      <Text style={s.sectionLabel}>{children}</Text>
      {action}
    </View>
  );
}

/** Selectable chip. `on` fills with the accent and flips the label to `onAccent`. */
export function Pill({
  on = false,
  disabled,
  style,
  onPress,
  children
}: {
  on?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
  children: ReactNode;
}) {
  const { theme } = useTheme();
  const s = useStyles(theme);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => [
        s.pill,
        on && s.pillOn,
        pressed && !disabled && s.pressed,
        disabled && s.disabled,
        style
      ]}
    >
      <Text style={[s.pillText, on && s.pillTextOn]}>{children}</Text>
    </Pressable>
  );
}

export function Btn({
  label,
  variant = "primary",
  size = "md",
  disabled,
  style,
  onPress
}: {
  label: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm";
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const { theme, A } = useTheme();
  const s = useStyles(theme, A);
  const fill = (s as any)[`btn_${variant}`];
  const text = (s as any)[`btnLabel_${variant}`];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        size === "sm" && s.btnSm,
        fill,
        pressed && !disabled && s.btnPressed,
        disabled && s.disabled,
        style
      ]}
    >
      <Text style={[s.btnLabel, text]}>{label}</Text>
    </Pressable>
  );
}

/** 44pt square glyph button — row actions, set toggles, remove. */
export function IconBtn({
  glyph,
  tone = "dim",
  on,
  style,
  onPress
}: {
  glyph: string;
  tone?: "dim" | "accent" | "danger" | "good";
  on?: boolean;
  style?: StyleProp<ViewStyle>;
  onPress: () => void;
}) {
  const { theme, A } = useTheme();
  const s = useStyles(theme, A);
  const label = on ? (s as any)[`iconOn_${tone}`] : (s as any)[`icon_${tone}`];
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [s.iconBtn, on && s.iconOnFill, pressed && s.pressed, style]}
    >
      <Text style={[s.icon, label]}>{glyph}</Text>
    </Pressable>
  );
}

/** Single-line text input. `inset` recesses it inside an existing surface. */
export function Field({ inset, style, ...rest }: TextInputProps & { inset?: boolean }) {
  const { theme } = useTheme();
  const s = useStyles(theme);
  return (
    <TextInput
      placeholderTextColor={theme.faint}
      {...rest}
      style={[s.field, inset && s.fieldInset, rest.multiline && s.fieldMulti, style]}
    />
  );
}

/** Lettered circle. */
export function Avatar({ letter, size = 40 }: { letter: string; size?: number }) {
  const { theme } = useTheme();
  const s = useStyles(theme);
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.avatarText, { fontSize: size * 0.4 }]}>{letter.slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

/** Never leave a list or panel blank. */
export function EmptyState({
  glyph,
  title,
  body,
  action,
  style
}: {
  glyph?: string;
  title: string;
  body?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { theme } = useTheme();
  const s = useStyles(theme);
  return (
    <View style={[s.empty, style]}>
      {glyph ? (
        <View style={s.emptyGlyph}>
          <Text style={s.emptyGlyphText}>{glyph}</Text>
        </View>
      ) : null}
      <Text style={s.emptyTitle}>{title}</Text>
      {body ? <Text style={s.emptyBody}>{body}</Text> : null}
      {action}
    </View>
  );
}

/** The one place errors and offline state are shown. */
export function Notice({
  tone = "error",
  action,
  style,
  children
}: {
  tone?: "error" | "info";
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const { theme, A } = useTheme();
  const s = useStyles(theme, A);
  const error = tone === "error";
  return (
    <View style={[s.notice, error ? s.noticeError : s.noticeInfo, style]}>
      <Text style={[s.noticeText, error ? s.noticeTextError : s.noticeTextInfo]}>{children}</Text>
      {action}
    </View>
  );
}

/** Six colour families drawn only from theme tokens. */
type MuscleFamily = "push" | "pull" | "legs" | "core" | "full" | "other";

const MUSCLE_FAMILY: Record<string, MuscleFamily> = {
  chest: "push", shoulders: "push", triceps: "push",
  back: "pull", lats: "pull", upper_back: "pull", lower_back: "pull", traps: "pull", biceps: "pull", forearms: "pull",
  quadriceps: "legs", hip_flexors: "legs", hamstrings: "legs", glutes: "legs", calves: "legs", ankles: "legs", adductors: "legs", abductors: "legs",
  abdominals: "core", core: "core", obliques: "core", neck: "core",
  full_body: "full", cardio: "full", other: "other"
};

function ExerciseThumbImpl({
  name,
  primaryMuscle,
  equipment,
  mediaUrl,
  size = 44,
  shape = "square"
}: {
  name: string;
  primaryMuscle: string;
  equipment?: string | null;
  mediaUrl?: string | null;
  size?: number;
  shape?: "square" | "circle";
}): ReactElement {
  const { theme } = useTheme();
  const [imgFailed, setImgFailed] = useState(false);
  const family = MUSCLE_FAMILY[primaryMuscle] ?? "other";
  const resolvedUri = resolveMediaUrl(mediaUrl);
  
  // Stitch's dark palette is warm-monochrome, so these are tonal steps within that family
  // rather than the old neon set. `pull` keeps the brand yellow; the rest step down from it
  // so no two families collide the way accent-yellow and pale-yellow did.
  const FAMILY: Record<MuscleFamily, string> = {
    push: theme.isDark ? "#ffb3ad" : "#a40217",
    pull: theme.accent,
    legs: theme.isDark ? "#d1c6ab" : "#8a6d1f",
    core: theme.isDark ? "#f4f4f5" : "#2b2b2b",
    full: theme.isDark ? "#9a9078" : "#6b6559",
    other: theme.faint
  };

  const alpha = (hex: string, a: number) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  const TONES: Record<MuscleFamily, ViewStyle> = {
    push: { backgroundColor: alpha(theme.red, 0.16), borderColor: alpha(theme.red, 0.38) },
    pull: { backgroundColor: alpha(theme.accent, 0.16), borderColor: alpha(theme.accent, 0.38) },
    legs: { backgroundColor: alpha(theme.green, 0.16), borderColor: alpha(theme.green, 0.38) },
    core: { backgroundColor: alpha(theme.text, 0.16), borderColor: alpha(theme.text, 0.38) },
    full: { backgroundColor: alpha(theme.dim, 0.16), borderColor: alpha(theme.dim, 0.38) },
    other: { backgroundColor: alpha(theme.faint, 0.16), borderColor: alpha(theme.faint, 0.38) }
  };

  const draw = (equipment ? GLYPH[equipment] : undefined) ?? GLYPH.other;
  const innerSize = Math.max(size - 2, 16);
  const rad = shape === "circle" ? size / 2 : theme.radius.sm;
  const innerRad = shape === "circle" ? innerSize / 2 : Math.max(0, theme.radius.sm - 1);

  return (
    <View
      style={[
        s_static.thumb,
        TONES[family],
        { width: size, height: size, borderRadius: rad, overflow: "hidden" }
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {resolvedUri && !imgFailed ? (
        <Image
          source={{ uri: resolvedUri }}
          style={{ width: innerSize, height: innerSize, borderRadius: innerRad, backgroundColor: "#fff" }}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        draw(FAMILY[family])
      )}
    </View>
  );
}

export const ExerciseThumb = memo(ExerciseThumbImpl);

function useStyles(theme: any, A?: any) {
  return useMemo(() => StyleSheet.create({
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderWidth: 1,
      borderRadius: theme.radius.md,
      padding: S.lg,
      marginBottom: S.md
    },
    sectionHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: S.sm,
      marginBottom: S.sm
    },
    sectionLabel: { ...T.micro, color: theme.dim, textTransform: "uppercase", flexShrink: 1 },
    pill: {
      minHeight: 32,
      justifyContent: "center",
      borderRadius: theme.radius.pill,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.surface2,
      paddingHorizontal: S.md,
      paddingVertical: S.xs
    },
    pillOn: { borderColor: theme.accent, backgroundColor: theme.accent },
    pillText: { ...T.meta, fontSize: 12, fontWeight: "600", color: theme.dim },
    pillTextOn: { color: theme.onAccent, fontWeight: "700" },
    pressed: { backgroundColor: theme.surface3 },
    disabled: { opacity: 0.4 },
    btn: {
      minHeight: 48,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: S.lg
    },
    btnSm: { minHeight: 40, borderRadius: theme.radius.sm, paddingHorizontal: S.md },
    btnPressed: { opacity: 0.82 },
    btn_primary: { backgroundColor: theme.accent },
    btn_secondary: { backgroundColor: theme.surface2, borderColor: theme.border },
    btn_ghost: { backgroundColor: "transparent" },
    btn_danger: { backgroundColor: A?.danger, borderColor: "transparent" },
    btnLabel: { ...T.body, fontWeight: "700" },
    btnLabel_primary: { color: theme.onAccent },
    btnLabel_secondary: { color: theme.text },
    btnLabel_ghost: { color: theme.accent },
    btnLabel_danger: { color: theme.red },
    iconBtn: {
      width: 44,
      height: 44,
      borderRadius: theme.radius.sm,
      alignItems: "center",
      justifyContent: "center"
    },
    iconOnFill: { backgroundColor: A?.accent },
    icon: { fontSize: 16, lineHeight: 20, fontWeight: "600" },
    icon_dim: { color: theme.dim },
    icon_accent: { color: theme.accent },
    icon_danger: { color: theme.red },
    icon_good: { color: theme.green },
    iconOn_dim: { color: theme.text },
    iconOn_accent: { color: theme.accent },
    iconOn_danger: { color: theme.red },
    iconOn_good: { color: theme.green },
    field: {
      minHeight: 48,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      borderColor: theme.border,
      backgroundColor: theme.card,
      color: theme.text,
      paddingHorizontal: S.md,
      fontSize: 15
    },
    fieldInset: { backgroundColor: theme.bg, minHeight: 42 },
    fieldMulti: { minHeight: 34, paddingVertical: S.sm, textAlignVertical: "top" },
    avatar: {
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface2,
      borderRadius: R.pill
    },
    avatarText: { ...T.heading, color: theme.dim },
    empty: {
      alignItems: "center",
      gap: S.sm,
      paddingVertical: S.xl,
      paddingHorizontal: S.lg
    },
    emptyGlyph: {
      width: 52,
      height: 52,
      borderRadius: R.pill,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.surface2,
      borderWidth: 1,
      borderColor: theme.border,
      marginBottom: S.xs
    },
    emptyGlyphText: { ...T.heading, fontSize: 22, color: theme.faint },
    emptyTitle: { ...T.body, fontWeight: "700", color: theme.text, textAlign: "center" },
    emptyBody: { ...T.meta, color: theme.dim, textAlign: "center", maxWidth: 280 },
    notice: {
      flexDirection: "row",
      alignItems: "center",
      gap: S.md,
      borderRadius: R.md,
      borderWidth: 1,
      paddingVertical: S.md,
      paddingHorizontal: S.md,
      marginBottom: S.md
    },
    noticeError: { backgroundColor: A?.danger, borderColor: "transparent" },
    noticeInfo: { backgroundColor: A?.accent, borderColor: "transparent" },
    noticeText: { ...T.meta, flex: 1 },
    noticeTextError: { color: theme.red, fontWeight: "600" },
    noticeTextInfo: { color: theme.accent, fontWeight: "600" },

    // Top App Header
    appHeader: {
      height: 44,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 8
    },
    appHeaderLogo: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minWidth: 80
    },
    logoIcon: {
      flexDirection: "row",
      alignItems: "flex-end",
      gap: 3
    },
    logoBar: {
      width: 4,
      borderRadius: 1
    },
    appHeaderBrand: {
      ...T.label,
      color: theme.dim,
      letterSpacing: 2,
      fontSize: 12
    },
    appHeaderCenter: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center"
    },
    appHeaderTitle: {
      ...T.heading,
      color: theme.text,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      fontSize: 16
    },
    appHeaderRight: {
      minWidth: 80,
      alignItems: "flex-end",
      justifyContent: "center"
    },
    avatarBtn: {
      padding: 2
    },
    avatarRing: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: theme.surface2,
      borderWidth: 1.5,
      borderColor: theme.accent,
      alignItems: "center",
      justifyContent: "center"
    },
    avatarRingText: {
      ...T.micro,
      color: theme.text,
      fontSize: 11,
      fontWeight: "800"
    },

    // Badges
    badge: {
      paddingHorizontal: S.sm,
      paddingVertical: 3,
      borderRadius: R.xs,
      borderWidth: 1,
      alignSelf: "flex-start"
    },
    badge_default: { backgroundColor: theme.surface2, borderColor: theme.border },
    badge_accent: { backgroundColor: theme.accent, borderColor: theme.accent },
    badge_danger: { backgroundColor: A?.danger ?? "rgba(239,68,68,0.15)", borderColor: theme.red },
    badge_blue: { backgroundColor: A?.blue ?? "rgba(56,189,248,0.15)", borderColor: theme.blue },
    badge_dark: { backgroundColor: theme.isDark ? theme.surface3 : "#1a1a1a", borderColor: theme.border },
    badgeText: { ...T.micro, fontSize: 10, letterSpacing: 0.8 },
    badgeText_default: { color: theme.dim },
    badgeText_accent: { color: theme.onAccent, fontWeight: "700" },
    badgeText_danger: { color: theme.red, fontWeight: "700" },
    badgeText_blue: { color: theme.blue, fontWeight: "700" },
    badgeText_dark: { color: "#ffffff", fontWeight: "700" }
  }), [theme, A]);
}

const GLYPH: Record<string, (c: string) => ReactElement> = {
  barbell: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.barLong, { backgroundColor: c }]} />
      <View style={[s_static.plateThin, s_static.atLeft, { backgroundColor: c }]} />
      <View style={[s_static.plateThin, s_static.atRight, { backgroundColor: c }]} />
    </View>
  ),
  dumbbell: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.barShort, { backgroundColor: c }]} />
      <View style={[s_static.plateThick, s_static.atLeft, { backgroundColor: c }]} />
      <View style={[s_static.plateThick, s_static.atRight, { backgroundColor: c }]} />
    </View>
  ),
  kettlebell: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.kbHandle, { borderColor: c }]} />
      <View style={[s_static.kbBell, { backgroundColor: c }]} />
    </View>
  ),
  machine: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.mPad, { backgroundColor: c }]} />
      <View style={[s_static.mPost, s_static.mPostL, { backgroundColor: c }]} />
      <View style={[s_static.mPost, s_static.mPostR, { backgroundColor: c }]} />
    </View>
  ),
  cable: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.cableTop, { backgroundColor: c }]} />
      <View style={[s_static.cableLine, { backgroundColor: c }]} />
      <View style={[s_static.cableWeight, { backgroundColor: c }]} />
    </View>
  ),
  plate: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.disc, { borderColor: c }]} />
      <View style={[s_static.hub, { backgroundColor: c }]} />
    </View>
  ),
  band: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.loop, { borderColor: c }]} />
      <View style={[s_static.dot, { backgroundColor: c }]} />
    </View>
  ),
  suspension: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.strap, s_static.strapL, { backgroundColor: c }]} />
      <View style={[s_static.strap, s_static.strapR, { backgroundColor: c }]} />
      <View style={[s_static.handle, s_static.handleL, { backgroundColor: c }]} />
      <View style={[s_static.handle, s_static.handleR, { backgroundColor: c }]} />
    </View>
  ),
  bodyweight: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.bwHead, { borderColor: c }]} />
      <View style={[s_static.bwBody, { backgroundColor: c }]} />
    </View>
  ),
  stability_ball: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.disc, { borderColor: c }]} />
    </View>
  ),
  medicine_ball: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.disc, { borderColor: c }]} />
      <View style={[s_static.dot, { backgroundColor: c }]} />
    </View>
  ),
  rope: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.strap, s_static.strapL, { backgroundColor: c }]} />
      <View style={[s_static.strap, s_static.strapR, { backgroundColor: c }]} />
    </View>
  ),
  assisted: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.mPad, { backgroundColor: c }]} />
      <View style={[s_static.mPost, s_static.mPostL, { backgroundColor: c }]} />
      <View style={[s_static.mPost, s_static.mPostR, { backgroundColor: c }]} />
    </View>
  ),
  sled_machine: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.mPad, { backgroundColor: c }]} />
      <View style={[s_static.mPost, s_static.mPostL, { backgroundColor: c }]} />
      <View style={[s_static.mPost, s_static.mPostR, { backgroundColor: c }]} />
    </View>
  ),
  other: (c) => (
    <View style={s_static.glyph}>
      <View style={[s_static.blank, { borderColor: c }]} />
    </View>
  )
};

const s_static = StyleSheet.create({
  thumb: { alignItems: "center", justifyContent: "center", borderWidth: 1 },
  // Fixed 22x22 canvas. Every part is absolutely positioned with an explicit centre:
  // a column-flex container would stack them instead of superimposing them.
  glyph: { width: 22, height: 22 },
  // barbell / dumbbell
  barLong: { position: "absolute", left: 1, top: 9.75, width: 20, height: 2.5, borderRadius: 1.25 },
  barShort: { position: "absolute", left: 6.5, top: 9.5, width: 9, height: 3, borderRadius: 1.5 },
  plateThin: { position: "absolute", top: 4.5, width: 3, height: 13, borderRadius: 1.5 },
  plateThick: { position: "absolute", top: 3.5, width: 6, height: 15, borderRadius: 3 },
  atLeft: { left: 0 },
  atRight: { right: 0 },
  // kettlebell
  kbHandle: {
    position: "absolute",
    left: 5.5,
    top: 3,
    width: 11,
    height: 7,
    borderWidth: 2.5,
    borderBottomWidth: 0,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6
  },
  kbBell: { position: "absolute", left: 3, top: 7, width: 16, height: 12, borderRadius: 6 },
  // machine: a padded bench on two uprights
  mPad: { position: "absolute", left: 2, top: 7, width: 18, height: 4, borderRadius: 2 },
  mPost: { position: "absolute", top: 11, width: 2.5, height: 8, borderRadius: 1 },
  mPostL: { left: 4 },
  mPostR: { left: 15.5 },
  // cable: a top rail with a hanging line and an offset weight stack
  cableTop: { position: "absolute", left: 4, top: 3, width: 14, height: 2.5, borderRadius: 1.25 },
  cableLine: { position: "absolute", left: 10.75, top: 5.5, width: 2.5, height: 8, borderRadius: 1.25 },
  cableWeight: { position: "absolute", left: 7.75, top: 13, width: 8, height: 5, borderRadius: 2 },
  // plate: disc with a centred hub hole
  disc: { position: "absolute", left: 1, top: 1, width: 20, height: 20, borderRadius: 10, borderWidth: 2.5 },
  hub: { position: "absolute", left: 8.5, top: 8.5, width: 5, height: 5, borderRadius: 2.5 },
  // band: wide flat loop with a dot inside
  loop: { position: "absolute", left: 1, top: 6.5, width: 20, height: 9, borderRadius: 4.5, borderWidth: 2.5 },
  dot: { position: "absolute", left: 9, top: 9, width: 4, height: 4, borderRadius: 2 },
  // suspension: two straps with handles (TRX), distinct from the bodyweight ring
  strap: { position: "absolute", top: 4, width: 2.5, height: 9, borderRadius: 1.25 },
  strapL: { left: 6.5 },
  strapR: { left: 13 },
  handle: { position: "absolute", top: 13, width: 4, height: 4, borderRadius: 2 },
  handleL: { left: 5.75 },
  handleR: { left: 12.25 },
  // bodyweight: head + body, deliberately unlike every other glyph
  bwHead: { position: "absolute", left: 8, top: 3, width: 6, height: 6, borderRadius: 3, borderWidth: 2.5 },
  bwBody: { position: "absolute", left: 9.5, top: 10, width: 3, height: 9, borderRadius: 1.5 },
  blank: { position: "absolute", left: 4, top: 4, width: 14, height: 14, borderRadius: 4, borderWidth: 2.5 }
});
