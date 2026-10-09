import { useLayoutEffect, useRef, useState } from "react";

/** Track an element's pixel width so SVG charts draw in real pixels (text never scales with the container). */
export function useWidth<T extends HTMLElement>(fallback = 560) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
