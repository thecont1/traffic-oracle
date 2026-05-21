import { useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import type { AppTheme } from "@/lib/theme";

interface InfoTipProps {
  thm: AppTheme;
  children: React.ReactNode;
  /** Max width in px. Default 240. */
  maxWidth?: number;
}

/**
 * Standardised info tooltip for all dashboard cards and sections.
 *
 * - Trigger: hover the "i" icon
 - Theme-aware background/border/text colours
 * - Portaled to document.body to avoid overflow clipping
 * - Auto-positions above or below the trigger based on viewport space
 * - Smooth opacity transition
 * - pointer-events: none so it never blocks interaction
 */
export default function InfoTip({ thm, children, maxWidth = 240 }: InfoTipProps) {
  const tipRef = useRef<HTMLDivElement>(null);

  const show = useCallback((e: React.MouseEvent<HTMLSpanElement>) => {
    const el = tipRef.current;
    if (!el) return;
    const r = e.currentTarget.getBoundingClientRect();
    const TW = el.offsetWidth || maxWidth;
    const TH = el.offsetHeight || 64;
    const vw = window.innerWidth;
    const left = Math.max(8, Math.min(vw - TW - 8, r.left + r.width / 2 - TW / 2));
    el.style.left = left + "px";
    el.style.top = (r.top > TH + 20 ? r.top - TH - 10 : r.bottom + 10) + "px";
    el.style.opacity = "1";
  }, [maxWidth]);

  const hide = useCallback(() => {
    if (tipRef.current) tipRef.current.style.opacity = "0";
  }, []);

  const isGray = thm.key === "gray";

  return (
    <>
      <span
        onMouseEnter={show}
        onMouseLeave={hide}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          borderRadius: "50%",
          border: `1.5px solid ${thm.textMuted}`,
          fontSize: 8,
          fontWeight: 900,
          cursor: "help",
          color: thm.textMuted,
          marginLeft: 5,
          userSelect: "none",
          textTransform: "none",
          letterSpacing: "normal",
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        i
      </span>
      {createPortal(
        <div
          ref={tipRef}
          style={{
            position: "fixed",
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 0.15s ease",
            background: isGray ? "#f0f0f0" : "#141A24",
            border: isGray ? "1px solid #d0d0d0" : "none",
            borderRadius: 10,
            padding: "9px 12px",
            boxShadow: "0 6px 28px rgba(0,0,0,0.45)",
            zIndex: 9999,
            maxWidth,
            fontSize: 12,
            lineHeight: 1.5,
            color: isGray ? "#333333" : "#F0F4F8",
            fontFamily: "var(--app-font)",
            top: 0,
            left: 0,
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
