import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "@/lib/ThemeContext";
import { trailingPercentiles } from "@/lib/trailingPercentiles";
import type { DayStats } from "@/lib/useTrafficData";

const CIRCLE_D = 38;
const DAY_HDR  = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

export function CalendarWidget({
  dailyStats, allDayStats, fmtDur, widgetCalYear, widgetCalMonth, onDateClick,
}: {
  dailyStats: Map<string, DayStats>;
  allDayStats: Map<string, DayStats>;
  fmtDur: (n: number) => string;
  widgetCalYear: number;
  widgetCalMonth: number;
  onDateClick?: (dateKey: string) => void;
}) {
  const { theme: thm } = useTheme();

  const [fadeKey, setFadeKey] = useState(0);
  useEffect(() => {
    setFadeKey(k => k + 1);
  }, [widgetCalYear, widgetCalMonth]);


  /* ── Global scale (shared across all dates) ──────────────────── */
  const globalScale = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const d of allDayStats.values()) {
      if (d.minSpeed > 0 && d.minSpeed < lo) lo = d.minSpeed;
      if (d.maxSpeed > 0 && d.maxSpeed > hi) hi = d.maxSpeed;
    }
    if (!isFinite(lo) || !isFinite(hi) || lo >= hi) return { lo: 10, hi: 50 };
    return { lo, hi };
  }, [allDayStats]);

  /* ── Imperative tooltip ─────────────────────────────────────── */
  const tooltipRef  = useRef<HTMLDivElement>(null);
  const lastKeyRef  = useRef<string | null>(null);

  const hideTip = useCallback(() => {
    if (tooltipRef.current) tooltipRef.current.style.opacity = "0";
    lastKeyRef.current = null;
  }, []);

  const showTip = useCallback((dateKey: string, cellEl: HTMLElement) => {
    const el = tooltipRef.current;
    if (!el) return;
    const s = dailyStats.get(dateKey);
    if (!s) { hideTip(); return; }

    const date   = new Date(dateKey + "T12:00:00");
    const dayStr = date.toLocaleDateString("en-IN", { weekday:"short", day:"numeric", month:"short", year:"2-digit" });

    /* 30-day window of filtered (ToD-aware) data (not including this date) */
    const dkDate = new Date(dateKey + "T12:00:00");
    const windowEnd = dkDate.getTime();
    const windowStart = windowEnd - 30 * 86400000;
    const windowAll: number[] = [];
    for (const k of dailyStats.keys()) {
      if (k === dateKey) continue;
      const t = new Date(k + "T12:00:00").getTime();
      if (t >= windowStart && t < windowEnd) {
        const d = dailyStats.get(k)!;
        if (d.avgSpeed > 0) {
          windowAll.push(d.minSpeed, d.avgSpeed, d.maxSpeed);
        }
      }
    }
    windowAll.sort((a, b) => a - b);
    /* Number of days with data in the trailing 30-day window */
    const trailingDayCount = Math.round(windowAll.length / 3);

    /* Position markers on the GLOBAL scale (full min–max range) */
    const { lo: gLo, hi: gHi } = globalScale;
    /* Inverted: fast speeds map to 0% (top), slow speeds to 100% (bottom) */
    const posOf = (speed: number) => gHi > gLo
      ? Math.max(0, Math.min(100, ((gHi - speed) / (gHi - gLo)) * 100))
      : 50;
    const markers = [
      { label:"MIN", time:s.minTime, speed:s.minSpeed, pos:posOf(s.minSpeed), color:"#ef4444" },
      { label:"AVG", time:"",         speed:s.avgSpeed,  pos:posOf(s.avgSpeed),  color:"#ffffff" },
      { label:"MAX", time:s.maxTime, speed:s.maxSpeed,  pos:posOf(s.maxSpeed),  color:"#22d3ee" },
    ];

    const markerLines = markers.map(m =>
      `<div style="position:absolute;left:0;right:0;height:2px;background:${m.color};opacity:0.85;` +
      `top:${m.pos}%;transform:translateY(-50%);z-index:1;"></div>` +
      `<div style="position:absolute;right:-6px;top:${m.pos}%;transform:translate(100%,-50%);` +
      `font-size:11px;font-weight:700;color:${m.color};white-space:nowrap;line-height:1.2;">` +
      `<span style="padding-left:4px;">${m.label}</span>` +
      (m.time ? `<br><span style="font-size:9px;font-weight:600;color:#94A3B8;padding-left:4px;">${m.time}</span>` : "") +
      `</div>`
    ).join("");

    el.innerHTML =
      `<span style="display:inline-block;background:#141A24;border-radius:12px;padding:13px 17px;width:270px;` +
      `box-shadow:0 8px 32px rgba(0,0,0,0.55);font-family:var(--app-font);font-size:14px;color:#F0F4F8;">` +
      `<div style="font-weight:700;font-size:15px;margin-bottom:11px;color:#F0F4F8">${dayStr}` +
      ` <span style="font-size:11px;font-weight:600;color:#64748B;">n=${trailingDayCount}</span></div>` +
      `<div style="position:relative;height:160px;margin-left:38px;margin-right:38px;">` +
        `<div style="position:absolute;left:0;top:0;right:0;bottom:0;border-radius:4px;overflow:hidden;background:#1E293B;">` +
          `<div style="width:100%;height:100%;background:linear-gradient(to bottom,` +
            `rgba(100,116,139,0.15) 0%,rgba(100,116,139,0.6) 25%,` +
            `rgba(100,116,139,0.9) 50%,` +
            `rgba(100,116,139,0.6) 75%,rgba(100,116,139,0.15) 100%);"></div>` +
        `</div>` +
        `<div style="position:absolute;top:0;left:-38px;width:34px;text-align:right;font-size:12px;font-weight:700;` +
          `color:#F0F4F8;text-shadow:0 0 3px rgba(0,0,0,0.9);transform:translateY(-50%);">` +
          `${Math.round(gHi)}</div>` +
        `<div style="position:absolute;top:4px;left:-38px;width:34px;text-align:right;` +
          `font-size:8px;font-weight:600;letter-spacing:0.05em;color:#94A3B8;">` +
          `FASTER</div>` +
        `<div style="position:absolute;bottom:0;left:-38px;width:34px;text-align:right;font-size:12px;font-weight:700;` +
          `color:#F0F4F8;text-shadow:0 0 3px rgba(0,0,0,0.9);transform:translateY(50%);">` +
          `${Math.round(gLo)}</div>` +
        `<div style="position:absolute;bottom:4px;left:-38px;width:34px;text-align:right;` +
          `font-size:8px;font-weight:600;letter-spacing:0.05em;color:#94A3B8;">` +
          `SLOWER</div>` +
        markerLines +
      `</div>` +
      `</span>` +
      `<div id="cal-tip-tail" style="position:absolute;width:0;height:0;pointer-events:none;"></div>`;

    const rect   = cellEl.getBoundingClientRect();
    const TW     = el.offsetWidth  || 280;
    const TH     = el.offsetHeight || 210;
    const TAIL   = 9;
    const GAP    = 8;
    const vw     = window.innerWidth;

    const rawLeft  = rect.left + rect.width / 2 - TW / 2;
    const left     = rawLeft + TW > vw - 8 ? Math.max(8, rect.right - TW) : Math.max(8, rawLeft);
    const wouldTop = rect.top - TH - TAIL - GAP;
    const isAbove  = wouldTop >= 0;
    const top      = isAbove ? wouldTop : rect.bottom + TAIL + GAP;

    const tailLeft = Math.max(14, Math.min(TW - 14, rect.left + rect.width / 2 - left));
    const tail = el.querySelector("#cal-tip-tail") as HTMLElement | null;
    if (tail) {
      tail.style.left      = tailLeft + "px";
      tail.style.transform = "translateX(-50%)";
      if (isAbove) {
        tail.style.bottom       = -TAIL + "px";
        tail.style.top          = "";
        tail.style.borderLeft   = "9px solid transparent";
        tail.style.borderRight  = "9px solid transparent";
        tail.style.borderTop    = `${TAIL}px solid #141A24`;
        tail.style.borderBottom = "";
      } else {
        tail.style.top          = -TAIL + "px";
        tail.style.bottom       = "";
        tail.style.borderLeft   = "9px solid transparent";
        tail.style.borderRight  = "9px solid transparent";
        tail.style.borderBottom = `${TAIL}px solid #141A24`;
        tail.style.borderTop    = "";
      }
    }

    el.style.left    = left + "px";
    el.style.top     = top  + "px";
    el.style.opacity = "1";
  }, [dailyStats, globalScale, hideTip]);

  const handleGridMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-dk]");
    if (!cell) { hideTip(); return; }
    const dk = cell.dataset.dk!;
    if (dk === lastKeyRef.current) return;
    lastKeyRef.current = dk;
    showTip(dk, cell);
  }, [showTip, hideTip]);

  /* ── Calendar math ──────────────────────────────────────────── */
  const prefixStr  = `${widgetCalYear}-${String(widgetCalMonth + 1).padStart(2, "0")}`;
  const firstDay   = (new Date(widgetCalYear, widgetCalMonth, 1).getDay() + 6) % 7; // Monday = 0
  const daysInMo   = new Date(widgetCalYear, widgetCalMonth + 1, 0).getDate();

  /* Memoised cells — always 42 cells (6 rows × 7 cols), no height jumping */
  const cells = useMemo(() => {
    const todayD   = new Date();
    const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth()+1).padStart(2,"0")}-${String(todayD.getDate()).padStart(2,"0")}`;
    const isCurrentMo = widgetCalYear === todayD.getFullYear() && widgetCalMonth === todayD.getMonth();

    /* reduce rgba/rgb color to 0.5 alpha for the stripe overlay */
    const fadeColor = (c: string) =>
      c.startsWith("rgba") ? c.replace(/,\s*[\d.]+\)$/, ", 0.5)")
      : c.startsWith("rgb(") ? c.replace("rgb(", "rgba(").replace(")", ", 0.5)")
      : c;

    const stripePattern = "repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.4) 4px,rgba(255,255,255,0.4) 8px)";

    return Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - firstDay + 1;

      /* outside the month — blank spacer cell, same height as a day cell */
      if (dayNum < 1 || dayNum > daysInMo) {
        return (
          <div key={`e${i}`} style={{ display:"flex", alignItems:"center",
            justifyContent:"center", padding:"5px 0" }}>
            <div style={{ width:CIRCLE_D, height:CIRCLE_D }} />
          </div>
        );
      }

      const dateKey  = `${prefixStr}-${String(dayNum).padStart(2,"0")}`;
      const s        = dailyStats.get(dateKey);
      const isFuture = isCurrentMo && dateKey >= todayStr;
      const isPast   = isCurrentMo && dateKey < todayStr;

      let circleStyle: React.CSSProperties;
      let txtClr: string;

      if (isCurrentMo) {
        if (isFuture) {
          /* future date — dashed outline, no fill */
          circleStyle = { border:`2px dashed ${thm.textMuted}`, background:"transparent" };
          txtClr = thm.textMuted;
        } else if (isPast && s) {
          /* past date with data — colour relative to trailing 30 days */
          const { p10: lp10, p90: lp90, insufficient } = trailingPercentiles(dailyStats, dateKey);
          if (insufficient) {
            circleStyle = { border:`2px dashed #6b7280`, background:"transparent" };
            txtClr = "#6b7280";
          } else {
            const t = lp90 > lp10 ? Math.max(0, Math.min(1, (s.avgSpeed - lp10) / (lp90 - lp10))) : 0.5;
            circleStyle = { background: thm.calColor(s.avgSpeed, lp10, lp90), boxShadow:"0 2px 8px rgba(0,0,0,0.15)" };
            txtClr = thm.calTextColor(t);
          }
        } else {
          /* past date with no data — dashed grey outline */
          circleStyle = { border:`2px dashed ${thm.textMuted}`, background:"transparent" };
          txtClr = thm.textMuted;
        }
      } else {
        /* any other month — colour relative to trailing 30 days */
        if (s) {
          const { p10: lp10, p90: lp90, insufficient } = trailingPercentiles(dailyStats, dateKey);
          if (insufficient) {
            circleStyle = { border:"2px dashed #6b7280", background:"transparent" };
            txtClr = "#6b7280";
          } else {
            const t = lp90 > lp10 ? Math.max(0, Math.min(1, (s.avgSpeed - lp10) / (lp90 - lp10))) : 0.5;
            circleStyle = { background: thm.calColor(s.avgSpeed, lp10, lp90), boxShadow:"0 2px 8px rgba(0,0,0,0.15)" };
            txtClr = thm.calTextColor(t);
          }
        } else {
          circleStyle = { background: thm.emptyCalCircle };
          txtClr = thm.textMuted;
        }
      }

      return (
        <div
          key={dateKey}
          data-dk={s && !isFuture ? dateKey : undefined}
          onClick={s && !isFuture && onDateClick ? () => onDateClick(dateKey) : undefined}
          style={{ display:"flex", alignItems:"center", justifyContent:"center",
            padding:"5px 0", cursor:(s && !isFuture) ? "pointer" : "default" }}
        >
          <div style={{ width:CIRCLE_D, height:CIRCLE_D, borderRadius:"50%",
            display:"flex", alignItems:"center", justifyContent:"center",
            transition:"transform 0.13s, box-shadow 0.13s",
            ...circleStyle,
          }}>
            <span style={{ fontSize:13, fontWeight:800, color:txtClr,
              lineHeight:1, userSelect:"none", opacity: isFuture ? 0.4 : 1 }}>
              {dayNum}
            </span>
          </div>
        </div>
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyStats, firstDay, daysInMo, prefixStr, thm.key, widgetCalYear, widgetCalMonth]);

  const CAL_MUTED = thm.textMuted;

  return (
    <>
      <div style={{ position:"relative" }}>

        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:2 }}>
          {DAY_HDR.map(d => (
            <div key={d} style={{ textAlign:"center", fontSize:10, fontWeight:700,
              textTransform:"uppercase", letterSpacing:"0.06em",
              color: CAL_MUTED, padding:"4px 0" }}>{d}</div>
          ))}
        </div>

        <div key={fadeKey}
          onMouseMove={handleGridMove}
          onMouseLeave={hideTip}
          style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)",
            animation:"cal-fade-in 0.2s ease" }}>
          {cells}
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:12,
          justifyContent:"flex-end", fontSize:11, color: CAL_MUTED }}>
          <span>Slower vs 30d</span>
          <div style={{ width:88, height:7, borderRadius:4,
            background: thm.key === "gray"
              ? "linear-gradient(90deg,#1a1a1a,#404040,#808080,#c0c0c0,#f0f0f0)"
              : thm.key === "pastel"
              ? "linear-gradient(90deg,#fca5a5,#fdba74,#fde68a,#bef264,#86efac)"
              : "linear-gradient(90deg,#ef4444,#f97316,#fbbf24,#86efac,#22c55e)"
          }} />
          <span>Faster vs 30d</span>
        </div>
      </div>
      {createPortal(
        <div ref={tooltipRef} style={{
          position:"fixed", pointerEvents:"none",
          opacity:0, transition:"opacity 0.15s ease",
          zIndex:9999, overflow:"visible",
          fontFamily:"var(--app-font)", fontSize:12,
          top:0, left:0,
        }} />,
        document.body
      )}
    </>
  );
}
