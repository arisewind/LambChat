import { useCallback, useEffect, useRef, useState } from "react";

export interface MessageScrollHistorySettling {
  isHistoryScrollSettling: boolean;
  clearHistoryScrollSettling: () => void;
  startHistoryScrollSettling: (fallbackTimeoutMs?: number) => void;
}

const DEFAULT_HISTORY_SCROLL_SETTLING_TIMEOUT_MS = 2000;
const HISTORY_SCROLL_SETTLING_FALLBACK_BUFFER_MS = 500;

export function getHistoryScrollSettlingFallbackTimeoutMs({
  maxDurationMs,
  observeAfterSettleMs,
  settleWindowMs,
}: {
  maxDurationMs: number;
  observeAfterSettleMs: number;
  settleWindowMs: number;
}): number {
  return (
    maxDurationMs +
    observeAfterSettleMs +
    settleWindowMs +
    HISTORY_SCROLL_SETTLING_FALLBACK_BUFFER_MS
  );
}

export function useMessageScrollHistorySettling(): MessageScrollHistorySettling {
  const [isHistoryScrollSettling, setIsHistoryScrollSettling] = useState(false);
  const historySettlingTimeoutRef = useRef<number>(0);

  const clearHistoryScrollSettling = useCallback(() => {
    if (historySettlingTimeoutRef.current) {
      window.clearTimeout(historySettlingTimeoutRef.current);
      historySettlingTimeoutRef.current = 0;
    }
    setIsHistoryScrollSettling(false);
  }, []);

  const startHistoryScrollSettling = useCallback(
    (fallbackTimeoutMs?: number) => {
      setIsHistoryScrollSettling(true);
      if (historySettlingTimeoutRef.current) {
        window.clearTimeout(historySettlingTimeoutRef.current);
      }
      historySettlingTimeoutRef.current = window.setTimeout(() => {
        historySettlingTimeoutRef.current = 0;
        setIsHistoryScrollSettling(false);
      }, fallbackTimeoutMs ?? DEFAULT_HISTORY_SCROLL_SETTLING_TIMEOUT_MS);
    },
    [],
  );

  useEffect(() => clearHistoryScrollSettling, [clearHistoryScrollSettling]);

  return {
    isHistoryScrollSettling,
    clearHistoryScrollSettling,
    startHistoryScrollSettling,
  };
}
