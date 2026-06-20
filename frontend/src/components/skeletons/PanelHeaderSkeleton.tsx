import { SkeletonLine } from "./primitives";

/**
 * Matches PanelHeader layout:
 *   - Icon box: size-10/lg:size-11 rounded-lg subtle-bg + ring
 *   - Title (text-base/lg:text-lg font-serif) + optional subtitle
 *   - Desktop action buttons
 *   - Mobile menu button (when !hasSearch)
 *   - Optional search row with searchAccessory + searchActions
 */
export function PanelHeaderSkeleton({
  hasSearch = true,
  hasSubtitle = false,
}: {
  hasSearch?: boolean;
  hasSubtitle?: boolean;
}) {
  return (
    <div className="panel-header panel-header--has-search">
      <div className="panel-header__top flex flex-wrap items-center justify-between gap-3 lg:gap-4">
        {/* Identity — icon box + title */}
        <div className="panel-header__identity flex min-w-0 items-center gap-3 lg:gap-4">
          {/* Icon box — matches real PanelHeader: size-10 lg:size-11 rounded-lg subtle-bg + ring-1 */}
          <div
            className="panel-header__icon flex size-10 flex-shrink-0 items-center justify-center rounded-lg ring-1 ring-stone-200 dark:ring-stone-700 lg:size-11"
            style={{
              backgroundColor:
                "var(--theme-bg-subtle, color-mix(in srgb, var(--theme-bg) 80%, white))",
              borderColor: "var(--theme-border)",
            }}
          >
            <div className="skeleton-line size-5 rounded-md" />
          </div>
          <div className="min-w-0">
            <SkeletonLine
              width="w-28 sm:w-36 xl:w-48"
              className="!h-4 sm:!h-[18px]"
            />
            {hasSubtitle && (
              <SkeletonLine
                width="w-40 sm:w-52 xl:w-64"
                className="!h-3 sm:!h-[14px] mt-0.5 !opacity-60"
              />
            )}
          </div>
        </div>

        {/* Desktop action buttons */}
        <div className="panel-header__actions panel-header__desktop-actions flex flex-nowrap flex-shrink-0 items-center gap-1.5 sm:gap-2">
          <div className="skeleton-line h-10 w-20 rounded-lg" />
          <div className="skeleton-line h-10 w-10 rounded-lg" />
        </div>

        {/* Mobile menu button — always shown on mobile */}
        <div className="panel-header__mobile-actions sm:hidden">
          <div className="skeleton-line size-9 rounded-lg" />
        </div>
      </div>

      {/* Search row — matches real search-row with searchAccessory + searchActions */}
      {hasSearch && (
        <div className="panel-header__search-row mt-2 flex items-center gap-2 sm:mt-3 lg:mt-4">
          <div className="panel-header__search-box relative min-w-0 flex-1">
            <div className="skeleton-line h-10 w-full rounded-lg" />
          </div>
          {/* searchAccessory skeleton (e.g. period filter) */}
          <div className="panel-header__search-accessory hidden sm:block">
            <div className="skeleton-line h-10 w-28 rounded-lg" />
          </div>
          {/* searchActions skeleton (e.g. refresh button) */}
          <div className="panel-header__search-actions hidden sm:flex flex-nowrap shrink-0 items-center gap-1.5 sm:gap-2">
            <div className="skeleton-line size-10 rounded-lg" />
          </div>
          {/* Mobile inline menu button in search row */}
          <div className="panel-header__mobile-actions panel-header__mobile-actions--search sm:hidden">
            <div className="skeleton-line size-10 rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
