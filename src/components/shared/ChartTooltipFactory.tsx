import { fmtDuration } from "@/core/format";

interface ThmColors {
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  cardBg: string;
  cardBorder: string;
}

/** Create a Recharts tooltip renderer for speed or duration view. */
export function useChartTooltip(thm: ThmColors, view: "speed" | "duration" = "speed") {
  const SPEED_ORDER = ["Best", "Avg Speed", "Worst"];
  const DURATION_ORDER = ["Best", "Avg Duration", "Worst"];
  const order = view === "speed" ? SPEED_ORDER : DURATION_ORDER;

  const techLabel: Record<string, string> = {
    "Best": "Best",
    "Worst": "Worst",
    "Avg Speed": "Avg Speed",
    "Avg Duration": "Avg Duration",
  };

  return (props: any) => {
    const { active, payload, label } = props ?? {};
    if (!active || !payload?.length) return null;
    const tp = "#2B2924";
    const ts = "#6E675B";

    let dateLabel = label;
    try {
      const d = new Date(label);
      if (!isNaN(d.getTime())) {
        dateLabel = `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
      }
    } catch { /* keep original */ }

    const sorted = [...payload].sort((a: any, b: any) => {
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    const unit = view === "speed" ? "km/h" : "min";
    return (
      <div style={{ background: "rgba(255,255,255,0.97)", border: `1px solid ${thm?.cardBorder ?? "hsl(var(--border))"}`,
        borderRadius: 12, padding: "10px 14px", fontSize: 13, boxShadow: "0 8px 24px rgba(0,0,0,0.12)" }}>
        <p style={{ fontWeight: 700, marginBottom: 6, color: tp }}>{dateLabel}</p>
        {sorted.map((p: any) => (
          <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
            <span style={{ color: ts }}>{techLabel[p.name] ?? p.name}:</span>
            <span style={{ fontWeight: 600, color: tp }}>
              {view === "speed" ? `${p.value} ${unit}` : fmtDuration(p.value)}
            </span>
          </div>
        ))}
      </div>
    );
  };
}
