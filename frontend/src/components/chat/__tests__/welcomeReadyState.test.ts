import {
  beginTeamRequest,
  isWelcomeContentReady,
  settleTeamRequestFailure,
  settleTeamRequestSuccess,
  type TeamRequestState,
} from "../welcomeReadyState.ts";

type Card = { id: string };

const settledTeamState: TeamRequestState<Card> = {
  requestId: 1,
  cards: [{ id: "previous-team" }],
  isLoading: false,
  isSettled: true,
};

test("keeps welcome content pending while settings load", () => {
  expect(
    isWelcomeContentReady({
      settingsLoading: true,
      currentAgent: "assistant",
      personaPresetsLoading: false,
      teamRequestSettled: false,
    }),
  ).toBe(false);
});

test("keeps welcome content pending until the active agent resolves", () => {
  expect(
    isWelcomeContentReady({
      settingsLoading: false,
      currentAgent: undefined,
      personaPresetsLoading: false,
      teamRequestSettled: true,
    }),
  ).toBe(false);
});

test("waits for persona presets only in persona mode", () => {
  expect(
    isWelcomeContentReady({
      settingsLoading: false,
      currentAgent: "assistant",
      personaPresetsLoading: true,
      teamRequestSettled: false,
    }),
  ).toBe(false);
  expect(
    isWelcomeContentReady({
      settingsLoading: false,
      currentAgent: "assistant",
      personaPresetsLoading: false,
      teamRequestSettled: false,
    }),
  ).toBe(true);
});

test("waits for the active team request and settles on success or failure", () => {
  expect(
    isWelcomeContentReady({
      settingsLoading: false,
      currentAgent: "team",
      personaPresetsLoading: false,
      teamRequestSettled: false,
    }),
  ).toBe(false);
  expect(
    isWelcomeContentReady({
      settingsLoading: false,
      currentAgent: "team",
      personaPresetsLoading: true,
      teamRequestSettled: true,
    }),
  ).toBe(true);
});

test("starting a new team request clears settled cards before its outcome", () => {
  expect(beginTeamRequest(settledTeamState, 2)).toEqual({
    requestId: 2,
    cards: [],
    isLoading: true,
    isSettled: false,
  });
});

test("a matching team request stores successful cards", () => {
  const pending = beginTeamRequest(settledTeamState, 2);

  expect(settleTeamRequestSuccess(pending, 2, [{ id: "new-team" }])).toEqual({
    requestId: 2,
    cards: [{ id: "new-team" }],
    isLoading: false,
    isSettled: true,
  });
});

test("a matching team request clears cards when it fails", () => {
  const pending = beginTeamRequest(settledTeamState, 2);

  expect(settleTeamRequestFailure(pending, 2)).toEqual({
    requestId: 2,
    cards: [],
    isLoading: false,
    isSettled: true,
  });
});

test("stale team outcomes leave the current request pending", () => {
  const pending = beginTeamRequest(settledTeamState, 2);

  expect(settleTeamRequestSuccess(pending, 1, [{ id: "stale-team" }])).toBe(
    pending,
  );
  expect(settleTeamRequestFailure(pending, 1)).toBe(pending);
});
