import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

export interface TimeTravelState {
  isActive: boolean;
  simulatedNow: Date | null;
  /** Activate TT at a specific datetime */
  activate: (dt: Date) => void;
  /** Cancel TT, return to live */
  deactivate: () => void;
  /** Advance simulated clock by N ms (called by playback timer) */
  advance: (ms: number) => void;
}

const TimeTravelContext = createContext<TimeTravelState>({
  isActive: false,
  simulatedNow: null,
  activate: () => {},
  deactivate: () => {},
  advance: () => {},
});

export function useTimeTravel() {
  return useContext(TimeTravelContext);
}

const TICK_MS = 6 * 60 * 1000; // 6-minute increments

export function TimeTravelProvider({ children }: { children: React.ReactNode }) {
  const [simulatedNow, setSimulatedNow] = useState<Date | null>(null);
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activate = useCallback((dt: Date) => {
    setSimulatedNow(new Date(dt));
    setIsActive(true);
  }, []);

  const deactivate = useCallback(() => {
    setSimulatedNow(null);
    setIsActive(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const advance = useCallback((ms: number) => {
    setSimulatedNow(prev => prev ? new Date(prev.getTime() + ms) : prev);
  }, []);

  // 6-minute playback tick
  useEffect(() => {
    if (isActive && simulatedNow) {
      intervalRef.current = setInterval(() => {
        setSimulatedNow(prev => prev ? new Date(prev.getTime() + TICK_MS) : prev);
      }, TICK_MS);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive]); // Only re-run when isActive changes, not on every simulatedNow tick

  return (
    <TimeTravelContext.Provider value={{ isActive, simulatedNow, activate, deactivate, advance }}>
      {children}
    </TimeTravelContext.Provider>
  );
}
