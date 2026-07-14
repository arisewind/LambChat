# Welcome Page Ready-State Design

## Goal

Prevent the welcome page from displaying its chat input before the role/team
gallery and welcome suggestions have reached a settled state.

## Root cause

`ChatView` only uses the session-level `isLoading` flag to select
`ChatSkeleton`. Once that flag is false, it mounts `WelcomePage` immediately.
`WelcomePage` then independently fetches team cards and receives persona and
settings data asynchronously, allowing the input to render before the rest of
the welcome content is ready.

## Design

`WelcomePage` will derive one welcome-ready condition from its relevant data:

- Settings are no longer loading, so configured welcome suggestions are known.
- Persona mode waits until the persona-preset request settles.
- Team mode waits until the request for the currently active team mode settles.
- An unresolved agent selection remains loading, because the relevant gallery
  cannot yet be determined.

The predicate is:

```ts
const welcomeContentReady =
  !settingsLoading &&
  !!currentAgent &&
  (currentAgent === "team" ? activeTeamRequestSettled : !personaPresetsLoading);
```

The team request state is synchronously associated with the agent/request that
started it. Entering team mode clears the prior team cards and invalidates the
previous settlement before the next paint, preventing a one-render flash of
stale data while the effect starts its new request. Success stores the returned
cards; failure clears the cards and settles into the existing empty-team state.

Until `welcomeContentReady` is true, `WelcomePage` renders the existing
`WelcomeSkeleton` as its sole visible content. A failed request still settles
the condition and uses the existing empty state, so the skeleton cannot persist
forever.

## Data flow and tests

The new condition stays in `WelcomePage`, where team loading and settings are
already available. It does not change data fetching or send behavior. Behavioral
tests cover settings loading, unresolved agent selection, persona loading and
settlement, team pending/success/failure, and switching into team mode after a
previous request settled.
