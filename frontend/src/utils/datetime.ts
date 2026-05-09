import type { TFunction } from "i18next";

// ── Parse ──────────────────────────────────────────────

export function parseDate(iso: string): Date {
  const s = iso.trim();
  return new Date(s.endsWith("Z") ? s : s + "Z");
}

// ── Display formatters ─────────────────────────────────

export function formatDateTime(iso: string): string {
  return parseDate(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return parseDate(iso).toLocaleDateString();
}

export function formatTime(iso: string): string {
  return parseDate(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateTimeShort(iso: string): string {
  return parseDate(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Relative time ──────────────────────────────────────

export function formatTimeAgo(t: TFunction, iso: string): string {
  const diffMs = Date.now() - parseDate(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return t("common.timeAgo.justNow");
  if (diffMin < 60) return t("common.timeAgo.minutesAgo", { count: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t("common.timeAgo.hoursAgo", { count: diffHr });
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return t("common.timeAgo.daysAgo", { count: diffDay });
  return t("common.timeAgo.monthsAgo", {
    count: Math.floor(diffDay / 30),
  });
}

export function formatRelativeDate(t: TFunction, iso: string | null): string {
  if (!iso) return "";
  const d = parseDate(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays === 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return t("common.timeAgo.daysAgo", { count: 1 });
  if (diffDays < 7) return t("common.timeAgo.daysAgo", { count: diffDays });
  if (diffDays < 30)
    return t("common.timeWeeksAgo", { count: Math.floor(diffDays / 7) });
  return t("common.timeMonthsAgo", { count: Math.floor(diffDays / 30) });
}

// ── Comparison helpers ─────────────────────────────────

export function getTimeMs(iso: string): number {
  return parseDate(iso).getTime();
}
