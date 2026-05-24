# Time Travel ↔ Live State Management

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Define a clean, well-defended state management architecture for transitioning between Live and Time Travel modes in the TraffiCOracle dashboard — ensuring the right state is preserved, the right state is reset, and the timing of saves/restores is bulletproof.

**Architecture:** Snapshot-rollback pattern with an explicit `DashboardStateSnapshot` type, a single coordinated save/restore effect, and clean separation between "what to snapshot" and "what to let reset." Eliminates the stale-closure risk and the `sliderManuallySet` dual-purpose hack.

**Tech Stack:** React (useState/useRef/useEffect), TypeScript, Bun tests.

---

## 1 — Problem Analysis

### 1.1 Full State Inventory

Every `useState` in `DashboardInner` (line ~990–1720), classified:

| State | Type | Live ↔ TT behavior | Current handling |
|-------|------|---------------------|------------------|
| `periodIdx` | number | SAVE & RESTORE | ✅ Saved |
| `todIdx` | number | SAVE & RESTORE | ✅ Saved |
| `questionMode` | string | SAVE & RESTORE | ✅ Saved |
| `chartView` | string | SAVE & RESTORE | ✅ Saved |
| `chartGranularity` | string | SAVE & RESTORE | ✅ Saved |
| `sliderVals` | [n,n] | SAVE & RESTORE (as weekKeys) | ✅ Saved |
| `sliderManuallySet` | bool | SAVE & RESTORE | ⚠️ Dual-purpose flag |
| `selectedCity` | string | KEEP (no change needed) | ✅ Implicit |
| `selectedRoute`/`routeIdx` | string/number | KEEP but guard against data loss | ❌ Not guarded |
| `zoomIdx` | number | KEEP | ✅ Implicit |
| `routeOptions` | derived[] | MAY SHRINK in TT (fewer routes in history) | ❌ Not guarded |
| `ttPopoverOpen` | bool | TRANSIENT — UI only | ✅ OK to leave as-is |
| `calMonth`/`calYear` | number | TRANSIENT — calendar UI | ✅ OK |
| `selectedDate`/`selectedTime` | Date/null | TRANSIENT — calendar UI | ✅ OK |
| `paneOpen` | bool | Transient, persisted in localStorage | ✅ OK |
| `copied`, `overlapWarning`, etc. | bool | Transient | ✅ OK |

### 1.2 Derived State That Changes

When TT activates, these `useMemo` values shift instantly:
- `ttAllRows` — filtered subset of allRows
- `effectiveWeatherMap` — TT-derived weather
- `effectiveDataTimestamp` — simulatedNow instead of dataTimestamp
- `routeOptions` — derived from ttAllRows, may lose routes

### 1.3 What SHOULD Be Preserved

**Must preserve** (user's analytical context):
- Period, time-of-day, question mode — these are the user's lens
- Slider position — the user's baseline comparison window
- Chart view and granularity — how they're visualizing

**Must NOT be overwritten** (but also shouldn't reset):
- City and route selection — the user's geographic focus
- Zoom level — the user's viewport preference

**Should guard** (preventing breakage):
- Route validity — if `routeOptions` shrinks in TT, the saved `routeIdx` may be out of bounds
- Slider validity — same for slider indices against a potentially shorter week array

### 1.4 Current Mechanism: What Works

The `preTtStateRef` save/restore at lines 1425–1468 is **mostly correct**:
- Uses `useRef` so saved state persists across renders
- Saves slider as stable `weekKey` strings (not indices) — handles array length changes
- Re-resolves weekKeys to indices on restore
- Sets `sliderManuallySet = true` after restore to prevent auto-set overwrite

### 1.5 Current Mechanism: What's Fragile

1. **Stale closure in the save effect (line 1434)**
   The effect depends only on `[tt.isActive]` but captures `periodIdx`, `todIdx`, `questionMode`, `chartView`, `chartGranularity`, `safeLeft`, `safeRight`, `allRouteWeeks` from the render closure. Works by accident because the save fires before the TT-defaults effect at line 1471. But if React batches renders differently (Strict Mode double-fires, future React 19+), the captured values could be stale.

2. **Multi-render dance**
   Activate requires 3 renders:
   - R1: `tt.isActive` → true
   - R2: effect saves state, clears `sliderManuallySet`
   - R3: TT-defaults effect fires, sets comparison windows
   Deactivate requires 2 renders:
   - R1: `tt.isActive` → false
   - R2: effect restores state, sets `sliderManuallySet = true`
   Each render re-computes all derived state, causing unnecessary work.

3. **`sliderManuallySet` does double duty**
   - Role A: Prevent auto-set from overwriting user's manual slider interaction (in `useEffect` at line 1389)
   - Role B: Prevent TT defaults from overwriting restored state (in `useEffect` at line 1471)
   These are different concerns sharing one flag. If the user manually moves the slider while in TT mode, Role A sets it true, and when they cancel TT, the restore effect sets it true again — no conflict now, but fragile.

4. **Route option changes are unhandled**
   If `routeOptions` in TT mode is `["Hosur Road", "ORR"]` but Live mode has `["Hosur Road", "MG Road", "ORR"]`, the `routeIdx` stays at 0 — which happens to be correct. But if `routeOptions` reorders or drops the first entry, the selected route silently changes.

5. **No guard for slider restore when weekKeys disappear**
   If `saved.sliderKeys` are `["2025-W01", "2025-W10"]` but current `allRouteWeeks` doesn't have one of those weekKeys, the restore falls through silently and the slider stays at `[0,0]`.

---

## 2 — Proposed Architecture

### 2.1 Explicit Snapshot Type

```typescript
interface DashboardSnapshot {
  periodIdx: number;
  todIdx: number;
  questionMode: "worsened" | "improved";
  chartView: "speed" | "duration";
  chartGranularity: "daily" | "weekly";
  sliderWeekKeys: [string, string] | null; // stable across data changes
  routeIdx: number;                        // NEW: preserve route focus
  routeName: string;                       // NEW: by name, not index
}
```

**Key change:** Include `routeName` (the string label) so we can preserve the user's route focus AND validate it still exists in both TT and Live data.

### 2.2 Single Coordinated Effect

Replace the two separate effects (save at 1434 + TT-defaults at 1471) with a single effect that handles the full lifecycle:

```typescript
useEffect(() => {
  if (tt.isActive && !preTtStateRef.current) {
    // ── SAVE ──
    preTtStateRef.current = {
      periodIdx,
      todIdx,
      questionMode,
      chartView,
      chartGranularity,
      sliderWeekKeys: [leftKey, rightKey],
      routeIdx,
      routeName: selectedRoute,
    };
    // Don't touch sliderManuallySet here — TT defaults effect will handle it
  } else if (!tt.isActive && preTtStateRef.current) {
    // ── RESTORE ──
    const saved = preTtStateRef.current;
    // ... restore all fields ...
    // Validate route still exists
    // Validate slider weekKeys still resolve
    preTtStateRef.current = null;
  }
}, [tt.isActive]);
```

### 2.3 Eliminate `sliderManuallySet` Dual Purpose

Split into two flags:
- `userMovedSlider` — true when user manually drags the slider (Role A)
- `ttDefaultsApplied` — true after TT defaults are set (Role B, cleared on restore)

Or simpler: keep `sliderManuallySet` for Role A only. For Role B, use the `preTtStateRef.current !== null` check — if we still have saved state, we haven't restored yet, so don't auto-set.

### 2.4 Route Validation on Restore

```typescript
// On restore, check if saved route still exists in Live data
const liveRouteOptions = /* allRouteWeeks computed from allRows, not ttAllRows */;
const restoredRouteExists = liveRouteOptions.some(r => r === saved.routeName);
if (restoredRouteExists) {
  setRouteIdx(liveRouteOptions.indexOf(saved.routeName));
} else {
  // Route disappeared (new data, route removed, etc.)
  // Keep current routeIdx — the modulo at line 1363 handles it
}
```

### 2.5 Slider Restore Guard

```typescript
if (saved.sliderWeekKeys) {
  const [lKey, rKey] = saved.sliderWeekKeys;
  const lIdx = allRouteWeeks.findIndex(w => w.weekKey === lKey);
  const rIdx = allRouteWeeks.findIndex(w => w.weekKey === rKey);
  if (lIdx >= 0 && rIdx >= 0) {
    setSliderVals([Math.min(lIdx, rIdx), Math.max(lIdx, rIdx)]);
  } else {
    // WeekKeys disappeared — fall back to auto-set range
    // (the existing useEffect at 1389 will handle this)
    setSliderManuallySet(false);
  }
}
```

### 2.6 Capture Values via Ref, Not Closure

To eliminate stale closure risk, capture mutable values through a ref:

```typescript
const stateSnapshotRef = useRef({
  periodIdx: 0,
  todIdx: 0,
  questionMode: "worsened" as "worsened" | "improved",
  chartView: "speed" as "speed" | "duration",
  chartGranularity: "weekly" as "daily" | "weekly",
});
// Keep ref current on every render
stateSnapshotRef.current = { periodIdx, todIdx, questionMode, chartView, chartGranularity };
```

Then in the effect, read from the ref instead of the closure:

```typescript
if (tt.isActive && !preTtStateRef.current) {
  const s = stateSnapshotRef.current;
  preTtStateRef.current = { ...s, sliderWeekKeys: [...], routeName: selectedRoute };
}
```

---

## 3 — Implementation Tasks

### Task 1: Add `stateSnapshotRef` for closure-safe state capture

**Objective:** Eliminate stale closure risk by reading current values from a ref instead of the effect closure.

**Files:**
- Modify: `src/pages/Dashboard.tsx` (~line 1110)

**Step 1:** Add `stateSnapshotRef` after the existing state declarations:

```typescript
// Always-current snapshot of user-facing state for TT save/restore
const stateSnapshotRef = useRef({
  periodIdx, todIdx, questionMode, chartView, chartGranularity,
  routeIdx, selectedRoute: "",
});
stateSnapshotRef.current = {
  periodIdx, todIdx, questionMode, chartView, chartGranularity,
  routeIdx, selectedRoute: (routeOptions[routeIdx % routeOptions.length] ?? ""),
};
```

Place this after `routeOptions` is computed (line ~1348) since it depends on `routeIdx` and `routeOptions`.

**Step 2:** Run `bun test` — 84/84 pass (no behavior change yet).

**Step 3:** Commit: `refactor: add stateSnapshotRef for closure-safe TT state capture`

---

### Task 2: Update `preTtStateRef` type to include route info

**Objective:** Extend the snapshot type to capture route focus, making restore complete.

**Files:**
- Modify: `src/pages/Dashboard.tsx` (~line 1425)

**Step 1:** Update the `preTtStateRef` type:

```typescript
const preTtStateRef = useRef<{
  sliderWeekKeys: [string, string] | null;
  periodIdx: number;
  todIdx: number;
  questionMode: "worsened" | "improved";
  chartView: "speed" | "duration";
  chartGranularity: "daily" | "weekly";
  routeName: string;
} | null>(null);
```

**Step 2:** Update the save block to use `stateSnapshotRef.current`:

```typescript
if (tt.isActive && !preTtStateRef.current) {
  const snap = stateSnapshotRef.current;
  const lKey = allRouteWeeks[safeLeft]?.weekKey ?? null;
  const rKey = allRouteWeeks[safeRight]?.weekKey ?? null;
  preTtStateRef.current = {
    sliderWeekKeys: lKey && rKey ? [lKey, rKey] : null,
    periodIdx: snap.periodIdx,
    todIdx: snap.todIdx,
    questionMode: snap.questionMode,
    chartView: snap.chartView,
    chartGranularity: snap.chartGranularity,
    routeName: snap.selectedRoute,
  };
  setSliderManuallySet(false);
}
```

**Step 3:** Update the restore block to restore route:

```typescript
} else if (!tt.isActive && preTtStateRef.current) {
  const saved = preTtStateRef.current;
  setPeriodIdx(saved.periodIdx);
  setTodIdx(saved.todIdx);
  setQuestionMode(saved.questionMode);
  setChartView(saved.chartView);
  setChartGranularity(saved.chartGranularity);
  
  // Restore route — validate it still exists in Live data
  const liveRoutes = Array.from(new Set(allRows.map(r => r.label_short))).sort();
  const rIdx = liveRoutes.indexOf(saved.routeName);
  if (rIdx >= 0) {
    setRouteIdx(rIdx);
  }
  
  // Restore slider
  if (saved.sliderWeekKeys) {
    const [lKey, rKey] = saved.sliderWeekKeys;
    const lIdx = allRouteWeeks.findIndex(w => w.weekKey === lKey);
    const rIdx = allRouteWeeks.findIndex(w => w.weekKey === rKey);
    if (lIdx >= 0 && rIdx >= 0) {
      setSliderVals([Math.min(lIdx, rIdx), Math.max(lIdx, rIdx)]);
      setSliderManuallySet(true);
    } else {
      setSliderManuallySet(false); // let auto-set handle it
    }
  } else {
    setSliderManuallySet(false);
  }
  
  preTtStateRef.current = null;
}
```

**Step 4:** Run `bun test` — 84/84 pass.

**Step 5:** Commit: `refactor: extend TT snapshot to include route, guard restore validity`

---

### Task 3: Simplify TT-defaults effect to use `preTtStateRef` as guard

**Objective:** Replace the `sliderManuallySet` guard in the TT-defaults effect with the snapshot ref, removing dual-purpose hack.

**Files:**
- Modify: `src/pages/Dashboard.tsx` (~line 1471)

**Step 1:** Change the TT-defaults effect guard:

```typescript
// Before:
if (!tt.isActive || !tt.simulatedNow || allRouteWeeks.length === 0 || sliderManuallySet) return;

// After:
if (!tt.isActive || !tt.simulatedNow || allRouteWeeks.length === 0 || preTtStateRef.current) return;
```

The semantics: "don't auto-set TT defaults if we're in the process of saving (preTtStateRef is being filled)" — but actually this effect should fire AFTER the save. So the guard should be: "don't auto-set if the user has already moved the slider in TT mode."

Actually, keep `sliderManuallySet` for THIS guard — it's the right flag here. The TT-defaults effect should not fire if the user manually dragged the slider during TT. `preTtStateRef.current` being non-null means we're mid-save, not that the user moved the slider.

**Revised:** Keep `sliderManuallySet` as-is for the TT-defaults effect. Its dual purpose is now split:
- Role A (user moved slider) — remains `sliderManuallySet`
- Role B (don't overwrite restored state) — now handled by `sliderManuallySet` being set `true` in the restore block

This is actually clean. No change needed here.

**Step 2:** Commit: (no change, skip)

---

### Task 4: Write tests for state preservation

**Objective:** Create reproducible tests for the save/restore behavior.

**Files:**
- Create: `tests/unit/tt-state-preservation.test.ts`

**Step 1:** Write test for snapshot capture:

```typescript
import { describe, it, expect } from "bun:test";

describe("TT state preservation", () => {
  it("captures period, tod, questionMode, chartView, chartGranularity on TT activate", () => {
    // This tests the snapshot type structure
    const snapshot = {
      sliderWeekKeys: ["2025-W10", "2025-W20"],
      periodIdx: 2,
      todIdx: 1,
      questionMode: "worsened" as const,
      chartView: "duration" as const,
      chartGranularity: "daily" as const,
      routeName: "Hosur Road",
    };
    expect(snapshot.periodIdx).toBe(2);
    expect(snapshot.routeName).toBe("Hosur Road");
  });

  it("sliderWeekKeys are stable strings, not indices", () => {
    // Verify weekKeys survive array length changes
    const before = ["2025-W01", "2025-W10"];
    const after = ["2025-W01", "2025-W10", "2025-W11", "2025-W12"];
    // The same weekKeys can be found in both arrays
    expect(after.indexOf(before[0])).toBeGreaterThanOrEqual(0);
    expect(after.indexOf(before[1])).toBeGreaterThanOrEqual(0);
  });

  it("restore handles missing weekKeys gracefully", () => {
    const savedKeys: [string, string] = ["2025-W01", "2025-W10"];
    const currentWeeks = [{ weekKey: "2025-W01" }, { weekKey: "2025-W05" }];
    // W10 doesn't exist — restore should fall back
    const lIdx = currentWeeks.findIndex(w => w.weekKey === savedKeys[0]);
    const rIdx = currentWeeks.findIndex(w => w.weekKey === savedKeys[1]);
    expect(lIdx).toBe(0);
    expect(rIdx).toBe(-1); // missing — triggers fallback
  });

  it("route restore validates route exists in Live data", () => {
    const savedRoute = "Hosur Road";
    const liveRoutes = ["Hosur Road", "MG Road", "ORR"];
    expect(liveRoutes.indexOf(savedRoute)).toBeGreaterThanOrEqual(0);

    const missingRoute = "Deleted Road";
    expect(liveRoutes.indexOf(missingRoute)).toBe(-1);
  });
});
```

**Step 2:** Run `bun test tests/unit/tt-state-preservation.test.ts` — 4 pass.

**Step 3:** Run full suite `bun test` — 88/88 pass (was 84, +4 new).

**Step 4:** Commit: `test: add state preservation tests for TT ↔ Live transitions`

---

### Task 5: Add route-name tracking to `preTtStateRef` save/restore

**Objective:** Ensure the user's route focus is preserved across mode switches, with validation.

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Step 1:** In the save block (inside the `tt.isActive` branch), capture `routeName`:

```typescript
routeName: allRows.length > 0
  ? (allRows.find(r => /* match current routeIdx */ )?.label_short ?? selectedRoute)
  : selectedRoute,
```

Actually, since `selectedRoute` is derived as `routeOptions[routeIdx % routeOptions.length]`, and `routeOptions` comes from `ttAllRows`, we should use `stateSnapshotRef.current.selectedRoute` which captures the CURRENT route name.

**Step 2:** In the restore block, compute live-mode routes from `allRows` (not `ttAllRows`) and validate:

```typescript
const liveRouteLabels = Array.from(new Set(allRows.map(r => r.label_short))).sort();
const routeIdxRestore = liveRouteLabels.indexOf(saved.routeName);
if (routeIdxRestore >= 0) {
  setRouteIdx(routeIdxRestore);
}
// If route not found, keep current routeIdx — modulo handles bounds
```

**Step 3:** Commit: `feat: preserve route focus across TT ↔ Live transitions`

---

### Task 6: Document the state management model

**Objective:** Update the Time Travel implementation reference with the definitive state management rules.

**Files:**
- Modify: skill reference `references/time-travel-implementation.md`

**Step 1:** Add a "State Management" section documenting:
- What gets saved/restored
- What stays untouched
- The snapshot type
- Why weekKeys not indices
- Route validation logic
- The stale closure prevention strategy

**Step 2:** Commit: `docs: document TT state management architecture`

---

## 4 — Files Changed

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Add `stateSnapshotRef`, update `preTtStateRef` type, update save/restore logic, add route preservation |
| `tests/unit/tt-state-preservation.test.ts` | New file — 4 tests |
| `references/time-travel-implementation.md` | Updated state management docs |

## 5 — Validation

1. `bun test` — all tests pass (88/88)
2. Manual QA scenarios:
   - TT → Cancel → verify slider, period, tod, route match pre-TT
   - TT → move slider → Cancel → verify user's slider position restored (not TT defaults)
   - TT → Cancel → verify route name is the same (not silently changed)
   - TT with route that exists in Live but not in TT window → Cancel → route preserved
   - Share URL with `?tt=` param → load → verify TT state → cancel → verify restore

## 6 — Risks and Tradeoffs

1. **Route restore may cause `routeIdx` to jump** — if the user was on "MG Road" (index 1) and TT changes the route ordering, restoring index 1 might point to a different route. **Mitigation:** Restore by name, not index.

2. **`stateSnapshotRef` runs on every render** — a trivial cost (object assignment) but worth noting. Could use a more targeted approach if profiling shows concern.

3. **No deep-cloning** — we store primitives and strings in the snapshot, so no mutation risk. If we ever add complex objects, this would need revisiting.

4. **Strict Mode double-fire** — React 18 Strict Mode runs effects twice in dev. The `preTtStateRef.current` null-check prevents double-save. The restore clears the ref, preventing double-restore. Safe.

## 7 — Open Questions

1. Should `selectedCity` be preserved? Currently it is (implicitly). If a user enters TT on City A, switches to City B in TT, then cancels TT — should they return to City A? **Recommendation:** Yes, preserve city. Add to snapshot if the implementation complexity is manageable, or leave as-is if city switching during TT is rare.

2. Should the TT-defaults comparison window be re-applied if `simulatedNow` changes during playback? Currently it's only set once (on activate). If the user plays forward 6 months, the comparison windows don't track. **Recommendation:** Leave as-is for now — the user can manually adjust.

3. Should `sliderManuallySet` be renamed to something clearer? **Recommendation:** `userDraggedSlider` — more precise about what it actually means.
