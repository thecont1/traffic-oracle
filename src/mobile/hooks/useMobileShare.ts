import { useCallback, useState, useRef, useEffect } from "react";

interface ShareData {
  title: string;
  text: string;
  url: string;
}

/** Web Share API with graceful fallback to clipboard copy. */
export function useMobileShare() {
  const [shared, setShared] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const share = useCallback(async (data: ShareData) => {
    // Try native Web Share API first
    if (navigator.share) {
      try {
        await navigator.share(data);
        setShared(true);
        timeoutRef.current = setTimeout(() => setShared(false), 2000);
        return;
      } catch (e: any) {
        // User cancelled or API failed — fall through to clipboard
        if (e?.name === "AbortError") return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(data.url);
      setShared(true);
      timeoutRef.current = setTimeout(() => setShared(false), 2000);
    } catch {
      // Last resort: do nothing
    }
  }, []);

  return { share, shared };
}
