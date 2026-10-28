import type { ReactNode } from "react";
import { useTheme } from "@/lib/ThemeContext";
import type { ChipVariant } from "@/lib/theme";

interface ChipProps {
  children: ReactNode;
  icon: string;
  variant: ChipVariant;
  onClick: () => void;
  animate?: boolean;
  inert?: boolean;
}

export default function Chip({ children, icon, variant, onClick, animate, inert }: ChipProps) {
  const { theme: thm } = useTheme();
  const tok = thm.chips[variant];
  const styleOverride: React.CSSProperties | undefined = thm.key !== "colour" ? {
    background: tok.bg,
    color:      tok.color,
    border:     `1.5px solid ${tok.border}`,
    boxShadow:  tok.shadow,
  } : undefined;

  return (
    <button
      type="button"
      className={`chip chip-${variant} ${animate ? "animate-pop" : ""}`}
      onClick={inert ? undefined : onClick}
      title={inert ? "Multi-city support coming soon" : "Tap to explore differently"}
      aria-disabled={inert || undefined}
      style={inert ? { cursor: "default", opacity: 0.9, ...styleOverride } : styleOverride}
    >
      <span aria-hidden="true" className="chip__icon">{icon}</span>
      <span className="chip__label">{children}</span>
    </button>
  );
}
