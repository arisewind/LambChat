interface SubagentPanelScrollerLike {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}

interface SubagentPanelFooterLike {
  scrollIntoView: (args?: ScrollIntoViewOptions) => void;
}

export interface StartSubagentPanelScrollToBottomOptions {
  scroller: SubagentPanelScrollerLike | null | undefined;
  footer?: SubagentPanelFooterLike | null;
  intervalMs?: number;
  maxAttempts?: number;
  shouldAbort?: () => boolean;
  onAutoScroll?: () => void;
}

export const SUBAGENT_PANEL_BOTTOM_THRESHOLD_PX = 32;

export function isNearSubagentPanelBottom(
  scroller: SubagentPanelScrollerLike,
  thresholdPx = SUBAGENT_PANEL_BOTTOM_THRESHOLD_PX,
): boolean {
  return (
    scroller.scrollTop + scroller.clientHeight >=
    scroller.scrollHeight - thresholdPx
  );
}

export function shouldAutoScrollSubagentPanel({
  scroller,
  userScrolledUp,
}: {
  scroller: SubagentPanelScrollerLike | null | undefined;
  userScrolledUp: boolean;
}): boolean {
  return !!scroller && !userScrolledUp;
}

function forceSubagentPanelScrollerToBottom({
  scroller,
  footer,
  onAutoScroll,
}: {
  scroller: SubagentPanelScrollerLike;
  footer?: SubagentPanelFooterLike | null;
  onAutoScroll?: () => void;
}): void {
  onAutoScroll?.();
  footer?.scrollIntoView({ behavior: "auto", block: "end" });
  scroller.scrollTop = scroller.scrollHeight;
}

export function startSubagentPanelScrollToBottom({
  scroller,
  footer,
  intervalMs = 30,
  maxAttempts = 20,
  shouldAbort,
  onAutoScroll,
}: StartSubagentPanelScrollToBottomOptions): () => void {
  if (!scroller) {
    return () => undefined;
  }

  let attempts = 0;
  let lastKnownScrollHeight = scroller.scrollHeight;
  let finished = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  const stop = () => {
    if (finished) return;
    finished = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  const scrollToBottom = () => {
    forceSubagentPanelScrollerToBottom({
      scroller,
      footer,
      onAutoScroll,
    });
  };

  scrollToBottom();

  timer = setInterval(() => {
    if (shouldAbort?.()) {
      stop();
      return;
    }

    attempts += 1;
    const heightChanged = scroller.scrollHeight !== lastKnownScrollHeight;
    const isAtBottom =
      scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1;

    if (heightChanged || !isAtBottom) {
      lastKnownScrollHeight = scroller.scrollHeight;
      scrollToBottom();
    }

    if (attempts >= maxAttempts) {
      stop();
    }
  }, intervalMs);

  return stop;
}
