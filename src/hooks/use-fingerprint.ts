import { useEffect, useRef } from "react";
import { identify, IdentifyError } from "fingerprint.dev";

const FP_KEY = import.meta.env.VITE_FP_API_KEY as string;

export function useFingerprint() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || !FP_KEY) return;
    ran.current = true;

    (async () => {
      try {
        const result = await identify({ apiKey: FP_KEY });
        if (result.visitor_id === null) return;

        await fetch("/api/fp-ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            visitor_id: result.visitor_id,
            confidence:  result.confidence,
            kind:        result.kind,           // "new" | "match"
            request_id:  result.request_id,
            page:        window.location.pathname,
            ts:          new Date().toISOString(),
          }),
        });
      } catch (err) {
        if (err instanceof IdentifyError) {
          console.warn("[FP]", err.code, err.message);
        }
      }
    })();
  }, []);
}
