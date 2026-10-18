export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

export function fmtVolume(v: number, units: string): string {
  const rounded = Math.round(v * 10) / 10;
  return `${rounded.toLocaleString()} ${units}`;
}

export function prLabel(kind: string): string {
  switch (kind) {
    case "heaviest":
      return "Heaviest lift";
    case "most_reps":
      return "Most reps";
    case "best_1rm":
      return "Best est. 1RM";
    case "best_set_volume":
      return "Best set volume";
    case "best_duration":
      return "Best duration";
    case "most_distance":
      return "Longest distance";
    default:
      return kind;
  }
}
