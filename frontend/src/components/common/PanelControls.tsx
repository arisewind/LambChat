import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Select } from "./ui";
import type { SelectOption } from "./ui";

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export interface PanelFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  active?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  dropdownClassName?: string;
}

export function PanelFilterSelect({
  value,
  onChange,
  options,
  active = Boolean(value),
  disabled = false,
  className,
  triggerClassName,
  dropdownClassName,
}: PanelFilterSelectProps) {
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled}
      className={cx("panel-filter-select", className)}
      triggerClassName={cx(
        "panel-filter-trigger h-10 px-3",
        active && "panel-filter-trigger--active",
        triggerClassName,
      )}
      dropdownClassName={cx("panel-filter-menu", dropdownClassName)}
    />
  );
}

/**
 * Reusable portal-based filter dropdown.
 * Handles: open/close state, click-outside dismiss, smart positioning
 * (flips above when insufficient space below), and portal rendering.
 *
 * Usage:
 * ```tsx
 * <FilterDropdown
 *   trigger={<Button variant="secondary">Filter</Button>}
 *   active={hasActiveFilters}
 * >
 *   <div className="p-3">…filter content…</div>
 * </FilterDropdown>
 * ```
 */
export interface FilterDropdownProps {
  /** Element rendered as the trigger button */
  trigger: ReactNode;
  /** Content rendered inside the portal dropdown */
  children: ReactNode;
  /** Controlled open state (uncontrolled if omitted) */
  open?: boolean;
  /** Callback when open state changes (uncontrolled if omitted) */
  onOpenChange?: (open: boolean) => void;
  /** Whether the trigger should show its "active" style */
  active?: boolean;
  /** Additional class for the dropdown panel */
  dropdownClassName?: string;
}

export function FilterDropdown({
  trigger,
  children,
  open: controlledOpen,
  onOpenChange,
  active: _active = false,
  dropdownClassName,
}: FilterDropdownProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = onOpenChange ?? setInternalOpen;

  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (isOpen && !target.closest("[data-filter-menu]")) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen, setIsOpen]);

  // Position dropdown (portal-based, flips above when insufficient space below)
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = 288;
    const right = Math.max(16, viewportWidth - rect.right - 16);
    const spaceBelow = viewportHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const preferBelow = spaceBelow >= 200 || spaceBelow >= spaceAbove;

    setDropdownStyle({
      position: "fixed",
      top: preferBelow ? rect.bottom + 4 : undefined,
      bottom: preferBelow ? undefined : viewportHeight - rect.top + 4,
      right,
      width,
      zIndex: 9999,
    });
  }, [isOpen]);

  return (
    <div className="relative shrink-0" data-filter-menu ref={triggerRef}>
      {trigger}
      {isOpen &&
        createPortal(
          <div
            className={cx(
              "ui-select-dropdown panel-filter-menu skill-filter-dropdown",
              "w-72 !min-w-[18rem] rounded-2xl",
              dropdownClassName,
            )}
            role="menu"
            data-filter-menu
            style={dropdownStyle}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}

export interface PanelFooterActionsProps {
  children: ReactNode;
  align?: "end" | "between";
  className?: string;
}

export interface PanelHeaderActionsProps {
  children: ReactNode;
  className?: string;
}

export function PanelHeaderActions({
  children,
  className,
}: PanelHeaderActionsProps) {
  return (
    <div className={cx("panel-header-actions", className)}>{children}</div>
  );
}

export function PanelFooterActions({
  children,
  align = "end",
  className,
}: PanelFooterActionsProps) {
  return (
    <div
      className={cx(
        "panel-footer-actions",
        align === "between" && "panel-footer-actions--between",
        className,
      )}
    >
      {children}
    </div>
  );
}
