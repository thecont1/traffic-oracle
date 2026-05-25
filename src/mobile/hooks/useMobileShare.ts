import { useCallback, useState } from "react";

interface ShareData {
  title: string;
  text: string;
  url: string;
}

/** Web Share API with graceful fallback to clipboard copy. */
export function useMobileShare() {
  const [shared, setShared] = useState(false);

  const share = useCallback(async (data: ShareData) => {
    // Try native Web Share API first
    if (navigator.share) {
      try {
        await navigator.share(data);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
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
      setTimeout(() => setShared(false), 2000);
    } catch {
      // Last resort: do nothing
    }
  }, []);

  return { share, shared };
}
