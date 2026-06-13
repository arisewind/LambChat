import { AlertCircle } from "lucide-react";

interface ConfigPanelErrorCalloutProps {
  message: string;
  className?: string;
}

export function ConfigPanelErrorCallout({
  message,
  className = "",
}: ConfigPanelErrorCalloutProps) {
  return (
    <div
      className={`glass-card flex items-center gap-2 rounded-xl p-3 text-sm text-red-600 !border-red-200/40 dark:text-red-400 dark:!border-red-800/30 ${className}`}
      role="alert"
    >
      <AlertCircle size={18} className="shrink-0" />
      <span className="min-w-0">{message}</span>
    </div>
  );
}
