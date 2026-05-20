import { Customized } from "recharts";
import type { BaselineChartStats } from "@/lib/chartHelpers";
import type { AppTheme } from "@/lib/theme";

interface Props {
  baseline: BaselineChartStats;
  view: "speed" | "duration";
  thm: AppTheme;
}

export default function BaselineReferenceLines({ baseline, view, thm }: Props) {
  const isSpeed = view === "speed";
  const bestVal = isSpeed ? baseline.speedP95 : baseline.durationP05;
  const avgVal = isSpeed ? baseline.speedAvg : baseline.durationAvg;
  const worstVal = isSpeed ? baseline.speedP05 : baseline.durationP95;
  const unit = isSpeed ? "km/h" : "min";
  const bestColor = thm.key === "gray" ? "#444" : "#22c55e";
  const baseColor = thm.key === "gray" ? "#222" : "#3b82f6";
  const worstColor = thm.key === "gray" ? "#444" : "#ef4444";

  return (
    <Customized
      component={(props: any) => {
        const { yAxisMap, width, height, margin } = props;
        const yScale = yAxisMap?.[0] || yAxisMap?.default;
        if (!yScale || !width || !height) return null;

        const yBest = yScale(bestVal);
        const yAvg = yScale(avgVal);
        const yWorst = yScale(worstVal);
        const x1 = margin?.left ?? 8;
        const x2 = width - (margin?.right ?? 8);
        const labelX = x2 - 4;

        return (
          <g>
            <line x1={x1} x2={x2} y1={yBest} y2={yBest}
              stroke={bestColor} strokeDasharray="6 3" strokeWidth={2.5} />
            <text x={labelX} y={yBest - 4} textAnchor="end"
              fill={bestColor} fontSize={10}>
              Best {bestVal.toFixed(1)} {unit}
            </text>

            <line x1={x1} x2={x2} y1={yAvg} y2={yAvg}
              stroke={baseColor} strokeDasharray="8 3" strokeWidth={3} />
            <text x={labelX} y={yAvg - 4} textAnchor="end"
              fill={baseColor} fontSize={10}>
              Baseline {avgVal.toFixed(1)} {unit}
            </text>

            <line x1={x1} x2={x2} y1={yWorst} y2={yWorst}
              stroke={worstColor} strokeDasharray="6 3" strokeWidth={2.5} />
            <text x={labelX} y={yWorst - 4} textAnchor="end"
              fill={worstColor} fontSize={10}>
              Worst {worstVal.toFixed(1)} {unit}
            </text>
          </g>
        );
      }}
    />
  );
}