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
