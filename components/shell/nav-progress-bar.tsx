"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  const prevPathRef = React.useRef(pathname);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // When pathname or search params change, complete the bar
  React.useEffect(() => {
    if (prevPathRef.current !== pathname) {
      prevPathRef.current = pathname;
      // Complete bar
      setProgress(100);
      const doneTimer = setTimeout(() => {
        setIsNavigating(false);
        setVisible(false);
        setProgress(0);
      }, 200);
      return () => clearTimeout(doneTimer);
    }
  }, [pathname, searchParams]);

  // Listen to navigation events from link clicks or programmatic navigation
  React.useEffect(() => {
    function handleStart() {
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(true);
      setIsNavigating(true);
      setProgress(25);

      timerRef.current = setTimeout(() => {
        setProgress((prev) => (prev < 80 ? prev + 35 : prev));
      }, 150);
    }

    function handleEnd() {
      setProgress(100);
      setTimeout(() => {
        setIsNavigating(false);
        setVisible(false);
        setProgress(0);
      }, 200);
    }

    window.addEventListener("exportleak:navigation-start", handleStart);
    window.addEventListener("exportleak:navigation-end", handleEnd);

    // Also intercept standard click on internal links
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (
        href &&
        href.startsWith("/") &&
        !href.startsWith("/#") &&
        target.target !== "_blank" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.shiftKey
      ) {
        // Only trigger if going to a different route
        if (href !== window.location.pathname) {
          handleStart();
        }
      }
    }

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      window.removeEventListener("exportleak:navigation-start", handleStart);
      window.removeEventListener("exportleak:navigation-end", handleEnd);
      document.removeEventListener("click", handleClick, { capture: true });
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      role="progressbar"
      aria-label="Page navigation progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={progress}
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] pointer-events-none bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-accent via-primary to-accent-hover transition-all duration-200 ease-out shadow-[0_0_8px_rgba(37,99,235,0.6)]"
        style={{
          width: `${progress}%`,
          opacity: isNavigating ? 1 : 0,
        }}
      />
    </div>
  );
}
