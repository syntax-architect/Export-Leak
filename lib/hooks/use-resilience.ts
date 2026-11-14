"use client";

import * as React from "react";

/**
 * useSingleFlight
 * Guarantees an async callback cannot be run concurrently.
 * Any subsequent invocation while the previous is still executing is dropped.
 * Adds an anti-double-tap cooldown (default 300ms) to shield against rapid clicks.
 */
export function useSingleFlight<TArgs extends readonly unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: {
    cooldownMs?: number;
    onError?: (error: unknown) => void;
  } = {}
): [(...args: TArgs) => Promise<TResult | undefined>, { isPending: boolean }] {
  const { cooldownMs = 300, onError } = options;
  const isExecutingRef = React.useRef(false);
  const lastExecutedRef = React.useRef(0);
  const [isPending, setIsPending] = React.useState(false);

  const execute = React.useCallback(
    async (...args: TArgs): Promise<TResult | undefined> => {
      const now = Date.now();
      if (isExecutingRef.current) {
        // Dropped: previous flight still executing
        return undefined;
      }
      if (now - lastExecutedRef.current < cooldownMs) {
        // Dropped: anti-double-tap cooldown
        return undefined;
      }

      isExecutingRef.current = true;
      lastExecutedRef.current = now;
      setIsPending(true);

      try {
        const result = await fn(...args);
        return result;
      } catch (err) {
        onError?.(err);
        throw err;
      } finally {
        isExecutingRef.current = false;
        setIsPending(false);
      }
    },
    [fn, cooldownMs, onError]
  );

  return [execute, { isPending }];
}

/**
 * useThrottledCallback
 * Ensures a function is called at most once per waitMs window.
 */
export function useThrottledCallback<TArgs extends readonly unknown[]>(
  cb: (...args: TArgs) => void,
  waitMs = 300
): (...args: TArgs) => void {
  const lastCalledRef = React.useRef(0);
  const cbRef = React.useRef(cb);
  cbRef.current = cb;

  return React.useCallback(
    (...args: TArgs) => {
      const now = Date.now();
      if (now - lastCalledRef.current >= waitMs) {
        lastCalledRef.current = now;
        cbRef.current(...args);
      }
    },
    [waitMs]
  );
}

/**
 * useMonotonicFlight
 * Solves race conditions for search & filtering.
 * Monotonically increasing request ID ensures that if request A takes 600ms
 * and request B takes 100ms, request A's response is safely discarded when it resolves.
 */
export function useMonotonicFlight<TArgs extends readonly unknown[], TResult>(
  asyncFn: (...args: TArgs) => Promise<TResult>,
  onSuccess: (result: TResult) => void
): [(...args: TArgs) => void, { isLoading: boolean }] {
  const latestRequestIdRef = React.useRef(0);
  const [isLoading, setIsLoading] = React.useState(false);

  const trigger = React.useCallback(
    (...args: TArgs) => {
      const currentId = ++latestRequestIdRef.current;
      setIsLoading(true);

      asyncFn(...args)
        .then((data) => {
          // If a newer request was dispatched while this was in-flight, discard this result
          if (currentId === latestRequestIdRef.current) {
            onSuccess(data);
            setIsLoading(false);
          }
        })
        .catch(() => {
          if (currentId === latestRequestIdRef.current) {
            setIsLoading(false);
          }
        });
    },
    [asyncFn, onSuccess]
  );

  return [trigger, { isLoading }];
}
