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
      className={`chip chip-${variant} ${animate ? "animate-pop" : ""}`}
      onClick={inert ? undefined : onClick}
      title={inert ? "Multi-city support coming soon" : "Tap to explore differently"}
      style={inert
        ? { cursor: "default", opacity: 0.9, display: "flex", alignItems: "center", gap: 6, padding: "6px 44px", ...styleOverride }
        : { display: "flex", alignItems: "center", gap: 6, padding: "4px 34px", ...styleOverride }
      }
    >
      <span>{icon}</span>{children}
    </button>
  );
}
