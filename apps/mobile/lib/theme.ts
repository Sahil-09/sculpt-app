import type { TextStyle } from "react-native";

export type Theme = typeof Dark;

// Stitch dark scheme: Kinetic Obsidian / High-Contrast Warm Yellow
export const Dark = {
  bg: "#0a0a0a",          // main canvas (obsidian)
  card: "#18181b",        // surface-container / surface-container-low
  surface2: "#222226",    // elevated surface
  surface3: "#27272a",    // surface-container-high, chart tracks
  surfaceHighest: "#353534", // surface-container-highest
  border: "#2e2e34",      // outline-variant
  borderStrong: "#3f3f46",
  text: "#ffffff",        // on-surface
  textMuted: "#e5e2e1",
  dim: "#a1a1aa",        // on-surface-variant
  faint: "#71717a",      // outline / placeholder
  accent: "#facc15",     // primary-container (electric volt / warm yellow)
  onAccent: "#000000",   // text on yellow
  green: "#ffe083",      // primary-fixed
  red: "#ef4444",        // secondary
  blue: "#38bdf8",       // tertiary
  primary: "#facc15",
  onPrimary: "#000000",
  radius: {
    none: 0,
    xs: 2,
    sm: 4,               // Tailwind DEFAULT: 0.25rem (4px)
    md: 8,               // Tailwind lg: 0.5rem (8px)
    lg: 12,              // Tailwind xl: 0.75rem (12px)
    pill: 9999           // Tailwind full: 9999px
  },
  isDark: true
};

// Stitch light scheme: Bauhaus Neo-Brutalist Paper & Ink
export const Light = {
  bg: "#f5f0e8",          // warm off-white aged paper
  card: "#ffffff",        // surface-container-lowest
  surface2: "#eee9e0",    // surface-container
  surface3: "#e8e3da",    // surface-container-high
  surfaceHighest: "#e2ddd4", // surface-container-highest
  border: "#d0cbc3",      // outline-variant
  borderStrong: "#1a1a1a",// thick black border
  text: "#1a1a1a",        // on-surface (near-black ink)
  textMuted: "#2d2d2d",
  dim: "#4a4a4a",        // on-surface-variant
  faint: "#8a8378",      // placeholder
  accent: "#ffcc00",     // primary-container (bauhaus yellow)
  onAccent: "#1a1a1a",   // text on yellow
  green: "#e6b800",      // primary-fixed-dim
  red: "#e63b2e",        // secondary (accent red)
  blue: "#0055ff",       // tertiary (accent blue)
  primary: "#1a1a1a",
  onPrimary: "#ffffff",
  radius: {
    none: 0,
    xs: 2,
    sm: 2,               // Tailwind DEFAULT: 0.125rem (2px)
    md: 4,               // Tailwind lg: 0.25rem (4px)
    lg: 8,               // Tailwind xl: 0.5rem (8px)
    pill: 9999           // circular / pill
  },
  isDark: false
};

/** Low-alpha tints. */
export const getA = (isDark: boolean) => ({
  accent: isDark ? "rgba(250,204,21,0.14)" : "rgba(255,204,0,0.22)",
  good: isDark ? "rgba(255,224,131,0.12)" : "rgba(238,194,0,0.16)",
  danger: isDark ? "rgba(239,68,68,0.14)" : "rgba(230,59,46,0.14)",
  blue: isDark ? "rgba(56,189,248,0.14)" : "rgba(0,85,255,0.14)",
  scrim: isDark ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.4)"
});

export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36 } as const;
export const R = { xs: 2, sm: 4, md: 8, lg: 12, xl: 16, pill: 9999 } as const;

export const T = {
  hero: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 28, letterSpacing: -0.56, textTransform: "uppercase" as const },
  title: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, letterSpacing: -0.44, textTransform: "uppercase" as const },
  heading: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 17, letterSpacing: -0.2 },
  subheading: { fontFamily: "SpaceGrotesk_600SemiBold", fontSize: 13, letterSpacing: -0.1 },
  body: { fontFamily: "HankenGrotesk_500Medium", fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: "HankenGrotesk_400Regular", fontSize: 12, lineHeight: 16 },
  meta: { fontFamily: "HankenGrotesk_400Regular", fontSize: 12 },
  label: { fontFamily: "SpaceGrotesk_700Bold", fontSize: 11, letterSpacing: 0.88, textTransform: "uppercase" as const },
  micro: { fontFamily: "JetBrainsMono_600SemiBold", fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const },
  caps: { fontFamily: "JetBrainsMono_700Bold", fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase" as const }
} as const;

export const NUM: Pick<TextStyle, "fontFamily" | "fontVariant"> = { 
  fontFamily: "JetBrainsMono_700Bold", 
  fontVariant: ["tabular-nums"] 
};

/** Default export for backward compatibility. Note: will not be reactive. */
export const C = Dark;
