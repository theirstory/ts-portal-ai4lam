'use client';

import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Reports when the top bar's row stops fitting on one line.
 *
 * A breakpoint cannot answer this: the row holds whatever links a portal's
 * config declares, beside a logo of whatever width that portal supplies, so
 * where the wrap happens differs per portal and per page. Measuring the row
 * itself puts the switch exactly at the point the nav would have wrapped.
 */
export const useNavOverflow = (rowRef: RefObject<HTMLElement | null>, signature: string) => {
  const [isCompact, setIsCompact] = useState(false);
  // How wide the full row needed to be when it last overflowed. Once collapsed
  // the row fits by definition, so its own size can no longer say whether
  // there is room for everything again.
  const requiredWidthRef = useRef(0);

  // A changed set of links invalidates that remembered width — measure the
  // full row again rather than deciding from a width that described a
  // different nav.
  useEffect(() => {
    requiredWidthRef.current = 0;
    setIsCompact(false);
  }, [signature]);

  // Layout effect so the first measurement lands before paint: the row is
  // briefly over-wide while it is being measured, and that should never be
  // something a reader sees.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => {
      const available = row.clientWidth;
      if (!available) return;

      setIsCompact((current) => {
        if (!current) {
          const required = row.scrollWidth;
          if (required <= available + 1) return false;
          requiredWidthRef.current = required;
          return true;
        }
        // Expand again only once there is room for the whole row plus a
        // little, so a window parked on the tipping point cannot oscillate.
        return !(requiredWidthRef.current > 0 && available >= requiredWidthRef.current + 8);
      });
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [rowRef, signature]);

  return isCompact;
};
