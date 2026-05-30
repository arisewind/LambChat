import { useEffect, useRef, useState } from "react";
import { Target, X } from "lucide-react";
import type { ActiveGoalSpec } from "../../hooks/useAgent/types";

interface ActiveGoalBarProps {
  goal: ActiveGoalSpec | null;
  label?: string;
  durationLabel?: string;
  clearLabel?: string;
  onClear?: () => void;
  disabled?: boolean;
  /** When true, renders as an embedded strip inside the chat input card (no border/bg of its own). */
  embedded?: boolean;
  className?: string;
}

/** Format seconds into MM:SS string. */
function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
}

function EmbeddedGoalBar({
  goal,
  label,
  durationLabel,
  clearLabel = "Clear goal",
  onClear,
  disabled = false,
  className = "",
}: Omit<ActiveGoalBarProps, "embedded"> & {
  goal: NonNullable<ActiveGoalBarProps["goal"]>;
}) {
  const [now, setNow] = useState(Date.now());
  const [exiting, setExiting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const isRunning = !!goal.started_at && !goal.ended_at;

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const durationText = (() => {
    if (!goal.started_at) return null;
    const start = new Date(goal.started_at).getTime();
    const end = goal.ended_at ? new Date(goal.ended_at).getTime() : now;
    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    return formatDuration(totalSeconds);
  })();

  const handleClear = () => {
    setExiting(true);
    const el = containerRef.current;
    if (el) {
      el.addEventListener("animationend", () => onClear?.(), { once: true });
    } else {
      onClear?.();
    }
  };

  return (
    <div
      ref={containerRef}
      className={[
        "flex items-center gap-3 p-3 text-sm",
        exiting ? "animate-goal-exit" : "animate-goal-enter",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={{
        borderBottom: "1px solid var(--theme-border)",
        color: "var(--theme-text-tertiary)",
      }}
    >
      <Target
        className="size-4 shrink-0"
        style={{ color: "var(--theme-text-tertiary)" }}
      />

      <span
        className="shrink-0 font-medium"
        style={{ color: "var(--theme-text-secondary)" }}
      >
        {label}
      </span>

      <span className="min-w-0 flex-1 truncate" title={goal.objective}>
        {goal.objective}
      </span>

      {durationLabel && durationText && (
        <span className="shrink-0 tabular-nums" style={{ opacity: 0.5 }}>
          {durationText}
        </span>
      )}

      {onClear && (
        <button
          type="button"
          onClick={handleClear}
          disabled={disabled}
          title={clearLabel}
          aria-label={clearLabel}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors hover:bg-[var(--theme-bg-hover,rgba(128,128,128,0.08))] disabled:cursor-not-allowed disabled:opacity-20"
          style={{ opacity: 0.4 }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function ActiveGoalBar({
  goal,
  label = "Goal",
  durationLabel,
  clearLabel = "Clear goal",
  onClear,
  disabled = false,
  embedded = false,
  className = "",
}: ActiveGoalBarProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!goal?.started_at || goal.ended_at) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [goal?.started_at, goal?.ended_at]);

  const durationText = (() => {
    if (!goal?.started_at) return null;
    const start = new Date(goal.started_at).getTime();
    const end = goal.ended_at ? new Date(goal.ended_at).getTime() : now;
    const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
    return formatDuration(totalSeconds);
  })();

  if (!goal) return null;

  if (embedded) {
    return (
      <EmbeddedGoalBar
        goal={goal}
        label={label}
        durationLabel={durationLabel}
        clearLabel={clearLabel}
        onClear={onClear}
        disabled={disabled}
        className={className}
      />
    );
  }

  return (
    <div
      className={`mx-auto flex w-full max-w-[52rem] min-w-0 items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-sm ${className}`}
      style={{
        borderColor: "var(--theme-border)",
        backgroundColor: "var(--theme-primary-bg, rgba(59,130,246,0.06))",
        color: "var(--theme-text-secondary)",
      }}
    >
      <Target
        className="h-4 w-4 shrink-0"
        style={{ color: "var(--theme-primary)" }}
      />
      <span className="shrink-0 font-medium">{label}</span>
      <span className="min-w-0 flex-1 truncate" title={goal.objective}>
        {goal.objective}
      </span>
      {durationLabel && durationText && (
        <span className="shrink-0 text-xs" style={{ opacity: 0.6 }}>
          {durationLabel} {durationText}
        </span>
      )}
      {onClear && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          title={clearLabel}
          aria-label={clearLabel}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-[var(--theme-bg-hover,rgba(128,128,128,0.08))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
