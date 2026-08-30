export interface WelcomeReadinessState {
  settingsLoading: boolean;
  currentAgent?: string;
  personaPresetsLoading: boolean;
  teamRequestSettled: boolean;
}

export function isWelcomeContentReady({
  settingsLoading,
  currentAgent,
  personaPresetsLoading,
  teamRequestSettled,
}: WelcomeReadinessState) {
  return (
    !settingsLoading &&
    !!currentAgent &&
    (currentAgent === "team" ? teamRequestSettled : !personaPresetsLoading)
  );
}

/**
 * The skeleton replaces the entire WelcomePage — including the ChatInput that
 * owns the feature-panel state (e.g. the open persona plaza). It must only
 * cover the initial load; once the welcome content has been ready, background
 * refetches (persona preset search/pagination) must not remount the page.
 * See issue #158.
 */
export function shouldRenderWelcomeSkeleton(
  contentReady: boolean,
  hasEverBeenReady: boolean,
): boolean {
  return !contentReady && !hasEverBeenReady;
}

export interface TeamRequestState<T> {
  requestId: number;
  cards: T[];
  isLoading: boolean;
  isSettled: boolean;
}

export function beginTeamRequest<T>(
  _state: TeamRequestState<T>,
  requestId: number,
): TeamRequestState<T> {
  return { requestId, cards: [], isLoading: true, isSettled: false };
}

export function settleTeamRequestSuccess<T>(
  state: TeamRequestState<T>,
  requestId: number,
  cards: T[],
): TeamRequestState<T> {
  if (state.requestId !== requestId) return state;
  return { requestId, cards, isLoading: false, isSettled: true };
}

export function settleTeamRequestFailure<T>(
  state: TeamRequestState<T>,
  requestId: number,
): TeamRequestState<T> {
  if (state.requestId !== requestId) return state;
  return { requestId, cards: [], isLoading: false, isSettled: true };
}
