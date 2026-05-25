import { useState, useEffect, useRef } from "react";
import type { AppTheme } from "@/lib/theme";
import type { CityConfig } from "@/lib/config";

interface LocationDropdownProps {
  thm: AppTheme;
  selectedCity: string;
  onCityChange: (name: string) => void;
  cities: CityConfig[];
}

export default function LocationDropdown({ thm, selectedCity, onCityChange, cities }: LocationDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
    return undefined;
  }, [isOpen]);

  const tok = thm.chips.city;
  const styleOverride: React.CSSProperties = thm.key !== "colour" ? {
    background: tok.bg,
    color: tok.color,
    border: `1.5px solid ${tok.border}`,
    boxShadow: tok.shadow,
  } : {
    background: "rgba(255,255,255,0.15)",
    color: thm.textPrimary,
    border: "1.5px solid rgba(255,255,255,0.3)",
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        style={{
          height: 44,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 12px",
          borderRadius: 9999,
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--app-font-display)",
          ...styleOverride,
        }}
      >
        <span>📍</span>
        <span>{selectedCity}</span>
        <span style={{
          marginLeft: 2,
          fontSize: 10,
          transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.2s",
        }}>▼</span>
      </button>

      {isOpen && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          minWidth: 140,
          background: thm.sectionBg,
          border: `1px solid ${thm.key === "gray" ? "#e0e0e0" : "hsl(var(--border))"}`,
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          padding: "4px 0",
          zIndex: 1000,
        }}>
          {cities.map((city) => {
            const hasData = !!city.data_source;
            return (
              <button
                key={city.name}
                onClick={() => { onCityChange(city.name); setIsOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  width: "100%",
                  padding: "8px 12px",
                  minHeight: 44,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: city.name === selectedCity ? 700 : 400,
                  color: hasData ? thm.textPrimary : thm.textMuted,
                  opacity: hasData ? 1 : 0.55,
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 10 }}>
                  {city.name === selectedCity ? "●" : hasData ? "○" : "◌"}
                </span>
                <span>{city.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
