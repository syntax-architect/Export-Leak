import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useMonotonicFlight,
  useSingleFlight,
  useThrottledCallback,
} from "@/lib/hooks/use-resilience";

describe("Resilience & Stress Protection Suite", () => {
  describe("useSingleFlight anti-spam & concurrent execution guard", () => {
    it("safely drops concurrent executions and executes exactly once", async () => {
      let activeFlights = 0;
      let totalCompleted = 0;
      let maxConcurrent = 0;

      const mockAsyncWork = vi.fn(async () => {
        activeFlights++;
        maxConcurrent = Math.max(maxConcurrent, activeFlights);
        await new Promise((r) => setTimeout(r, 50));
        activeFlights--;
        totalCompleted++;
        return "done";
      });

      const { result } = renderHook(() =>
        useSingleFlight(mockAsyncWork, { cooldownMs: 0 })
      );

      // Rapidly fire 25 times concurrently
      const promises: Promise<string | undefined>[] = [];
      act(() => {
        for (let i = 0; i < 25; i++) {
          promises.push(result.current[0]());
        }
      });

      const results = await Promise.all(promises);

      // Only the first invocation ran, the remaining 24 were safely dropped
      expect(mockAsyncWork).toHaveBeenCalledTimes(1);
      expect(totalCompleted).toBe(1);
      expect(maxConcurrent).toBe(1);
      expect(results[0]).toBe("done");
      for (let i = 1; i < 25; i++) {
        expect(results[i]).toBeUndefined();
      }
    });

    it("respects anti-double-tap cooldown period", async () => {
      const mockFn = vi.fn(async () => "ok");
      const { result } = renderHook(() =>
        useSingleFlight(mockFn, { cooldownMs: 200 })
      );

      await act(async () => {
        await result.current[0]();
      });
      expect(mockFn).toHaveBeenCalledTimes(1);

      // Second tap immediately within cooldown should be dropped
      await act(async () => {
        await result.current[0]();
      });
      expect(mockFn).toHaveBeenCalledTimes(1);

      // After cooldown expires, tap works
      await new Promise((r) => setTimeout(r, 220));
      await act(async () => {
        await result.current[0]();
      });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe("useThrottledCallback", () => {
    it("throttles rapid rapid-tap calls within waitMs window", () => {
      const callback = vi.fn();
      const { result } = renderHook(() => useThrottledCallback(callback, 200));

      // 10 calls in rapid succession
      for (let i = 0; i < 10; i++) {
        result.current(i);
      }

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(0);
    });
  });

  describe("useMonotonicFlight race condition prevention", () => {
    it("discards slow older responses when newer requests resolve first", async () => {
      const resultsReceived: string[] = [];
      const onData = vi.fn((data: string) => {
        resultsReceived.push(data);
      });

      let resolveSlow: (val: string) => void;
      let resolveFast: (val: string) => void;

      const slowPromise = new Promise<string>((r) => {
        resolveSlow = r;
      });
      const fastPromise = new Promise<string>((r) => {
        resolveFast = r;
      });

      const asyncWorker = vi.fn((type: "slow" | "fast") => {
        if (type === "slow") return slowPromise;
        return fastPromise;
      });

      const { result } = renderHook(() =>
        useMonotonicFlight(asyncWorker, onData)
      );

      // Dispatch request 1 (slow)
      act(() => {
        result.current[0]("slow");
      });

      // User types or clicks fast -> Dispatch request 2 (fast)
      act(() => {
        result.current[0]("fast");
      });

      // Request 2 finishes FIRST
      await act(async () => {
        resolveFast!("FAST_RESULT");
      });

      expect(resultsReceived).toEqual(["FAST_RESULT"]);

      // Request 1 finishes LATER (should be safely discarded by monotonic sequence guard)
      await act(async () => {
        resolveSlow!("OLD_STALE_RESULT");
      });

      // Ensure stale result never overwrote the latest data
      expect(resultsReceived).toEqual(["FAST_RESULT"]);
      expect(onData).toHaveBeenCalledTimes(1);
    });
  });

  describe("Button antiDoubleTap stress guard", () => {
    it("blocks rapid spam clicking when antiDoubleTap is true", () => {
      const onClick = vi.fn();
      render(
        <Button antiDoubleTap throttleMs={250} onClick={onClick}>
          Submit Shipment
        </Button>
      );

      const btn = screen.getByRole("button", { name: "Submit Shipment" });

      // Click 10 times in rapid succession
      for (let i = 0; i < 10; i++) {
        fireEvent.click(btn);
      }

      expect(onClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("Industry-Grade EmptyState Component", () => {
    it("renders default empty state with title, description, and tips", () => {
      render(
        <EmptyState
          title="No Shipping Bills found"
          description="Upload your ICEGATE EDI files to begin."
          tips={[
            "Accepts EDI 1.5 PDFs",
            "Auto-calculates RoDTEP & Drawback",
          ]}
          primaryAction={<Button>Upload now</Button>}
          secondaryAction={<Button variant="secondary">Learn more</Button>}
          footerNotice="Files are kept in-memory"
        />
      );

      const status = screen.getByRole("status");
      expect(status).toHaveAttribute("aria-live", "polite");
      expect(screen.getByText("No Shipping Bills found")).toBeInTheDocument();
      expect(screen.getByText("Upload your ICEGATE EDI files to begin.")).toBeInTheDocument();
      expect(screen.getByText("Quick tips")).toBeInTheDocument();
      expect(screen.getByText("Accepts EDI 1.5 PDFs")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Upload now" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Learn more" })).toBeInTheDocument();
      expect(screen.getByText("Files are kept in-memory")).toBeInTheDocument();
    });

    it("renders filter variant with reset button", () => {
      const onReset = vi.fn();
      render(
        <EmptyState
          variant="filter"
          title="No items match filter"
          description="Try adjusting your date range."
          primaryAction={
            <Button onClick={onReset}>Clear filters</Button>
          }
        />
      );

      expect(screen.getByText("No items match filter")).toBeInTheDocument();
      const clearBtn = screen.getByRole("button", { name: "Clear filters" });
      fireEvent.click(clearBtn);
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it("renders success variant with compliant banner", () => {
      render(
        <EmptyState
          variant="success"
          title="Zero compliance alerts"
          description="All foreign remittances are within EDPMS limits."
        />
      );

      expect(screen.getByText("Zero compliance alerts")).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveClass("border-success/30");
    });
  });
});
