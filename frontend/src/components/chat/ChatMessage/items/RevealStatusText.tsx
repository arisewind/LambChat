import type { ReactNode } from "react";

export function RevealStatusText({
  title,
  subtitle,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="text-14 font-medium text-theme-text-secondary truncate">
        {title}
      </div>
      {subtitle != null && (
        <div className="text-12 text-theme-text-tertiary truncate mt-0.5">
          {subtitle}
        </div>
      )}
    </div>
  );
}

export function RevealStatusLabel({ children }: { children: ReactNode }) {
  return (
    <div className="text-12 text-amber-600 dark:text-amber-400">{children}</div>
  );
}
