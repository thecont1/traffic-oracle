import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { WeeklyAggregate } from "@/lib/useTrafficData";

interface NapkinChartProps {
  baselineWeeks: WeeklyAggregate[];
  recentWeeks:   WeeklyAggregate[];
  height?: number;
  dateLabels?: { bStart: string; bEnd: string; rStart: string; rEnd: string };
}

export default function NapkinChart({
  baselineWeeks, recentWeeks, height = 120, dateLabels,
}: NapkinChartProps) {
  const { theme: thm } = useTheme();

  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(500);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setW(Math.round(w));
    });
    obs.observe(el);
    const init = el.getBoundingClientRect().width;
    if (init > 0) setW(Math.round(init));
    return () => obs.disconnect();
  }, []);

  const bLen = baselineWeeks.length;
  const rLen = recentWeeks.length;
  if (bLen + rLen < 2) return null;

  const allSpeeds = [
    ...baselineWeeks.map(w => w.avgSpeed),
    ...recentWeeks.map(w => w.avgSpeed),
  ].filter(s => s > 0);
  if (allSpeeds.length < 2) return null;

  const minS = Math.min(...allSpeeds);
  const maxS = Math.max(...allSpeeds);
  const range = maxS - minS || 1;

  const H = height;
  const PX = 0, PY = 8;
  const chartW = W - PX * 2;
  const chartH = H - PY * 2;
  const LABEL_H = dateLabels ? 18 : 0;
  const totalH  = H + LABEL_H;

  const hasGap = bLen > 0 && rLen > 0;

  const allWeeks = [...baselineWeeks, ...recentWeeks];
  const t0 = new Date(allWeeks[0].weekKey).getTime();
  const t1 = new Date(allWeeks[allWeeks.length - 1].weekKey).getTime();
  const tSpan = t1 - t0 || 1;
  const toX = (wk: string) => PX + ((new Date(wk).getTime() - t0) / tSpan) * chartW;

  const bXS = toX(baselineWeeks[0].weekKey);
  const bXE = toX(baselineWeeks[bLen - 1].weekKey);
  const rXS = hasGap ? toX(recentWeeks[0].weekKey) : PX;
  const rXE = W - PX;

  const toY = (s: number) => PY + chartH - ((s - minS) / range) * chartH;

  const baselineAvg = bLen > 0
    ? baselineWeeks.reduce((sum, w) => sum + w.avgSpeed, 0) / bLen
    : 0;
  const recentAvg = rLen > 0
    ? recentWeeks.reduce((sum, w) => sum + w.avgSpeed, 0) / rLen
    : 0;

  const pts = (weeks: WeeklyAggregate[]) =>
    weeks.length === 1
      ? `${toX(weeks[0].weekKey).toFixed(1)},${toY(weeks[0].avgSpeed).toFixed(1)} ${toX(weeks[0].weekKey).toFixed(1)},${toY(weeks[0].avgSpeed).toFixed(1)}`
      : weeks.map(w => `${toX(w.weekKey).toFixed(1)},${toY(w.avgSpeed).toFixed(1)}`).join(" ");

  const { baseline: BL, recent: RC, gap: GAP } = thm.napkin;
  const labelY = H + 13;

  const baselineW = thm.key === "gray" ? 2 : 3.5;
  const recentW   = thm.key === "gray" ? 3.5 : 3.5;

  return (
    <svg ref={svgRef}
      role="img"
      viewBox={`0 0 ${W} ${totalH}`}
      style={{ width: "100%", height: totalH, display: "block", overflow: "visible" }}
      overflow="visible"
      preserveAspectRatio="xMidYMid meet">
      <title>Traffic speed trend chart</title>
      <desc>Line chart comparing baseline period speeds with recent speeds for the selected route.</desc>
      {bLen > 0 && (
        <polyline points={pts(baselineWeeks)}
          fill="none" stroke={BL} strokeWidth={baselineW}
          strokeLinejoin="round" strokeLinecap="round" />
      )}
      {rLen > 0 && (
        <polyline points={pts(recentWeeks)}
          fill="none" stroke={RC} strokeWidth={recentW}
          strokeLinejoin="round" strokeLinecap="round" />
      )}

      {dateLabels && bLen > 0 && (<>
        <line x1={bXS} y1={toY(baselineWeeks[0].avgSpeed)} x2={bXS} y2={H}
          stroke={BL} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={bXS} y={labelY} fontSize={9} fill={BL} opacity={0.8}
          textAnchor="start">{dateLabels.bStart}</text>
        <line x1={bXE} y1={toY(baselineWeeks[bLen - 1].avgSpeed)} x2={bXE} y2={H}
          stroke={BL} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={bXE} y={labelY} fontSize={9} fill={BL} opacity={0.8}
          textAnchor="end">{dateLabels.bEnd}</text>
      </>)}
      {dateLabels && rLen > 0 && (<>
        <line x1={rXS} y1={toY(recentWeeks[0].avgSpeed)} x2={rXS} y2={H}
          stroke={RC} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={rXS} y={labelY} fontSize={9} fill={RC} opacity={0.8}
          textAnchor="start">{dateLabels.rStart}</text>
        <line x1={rXE} y1={toY(recentWeeks[rLen - 1].avgSpeed)} x2={rXE} y2={H}
          stroke={RC} strokeWidth={1} strokeDasharray="3 3" opacity={0.4} />
        <text x={rXE} y={labelY} fontSize={9} fill={RC} opacity={0.8}
          textAnchor="end">{dateLabels.rEnd}</text>
      </>)}
      {bLen > 0 && baselineAvg > 0 && (
        <line x1={bXS} y1={toY(baselineAvg)} x2={bXE} y2={toY(baselineAvg)}
          stroke={BL} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7} />
      )}
      {rLen > 0 && recentAvg > 0 && (
        <line x1={rXS} y1={toY(recentAvg)} x2={rXE} y2={toY(recentAvg)}
          stroke={RC} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7} />
      )}
      {hasGap && bLen > 0 && rLen > 0 && baselineAvg > 0 && recentAvg > 0 && (
        <line x1={bXE} y1={toY(baselineAvg)} x2={rXS} y2={toY(recentAvg)}
          stroke={GAP} strokeWidth={2} strokeDasharray="6 4" />
      )}
    </svg>
  );
}
