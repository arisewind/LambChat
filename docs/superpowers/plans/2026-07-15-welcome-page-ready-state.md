# Welcome Page Ready-State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the welcome skeleton visible until settings and the active role/team choice data have settled.

**Architecture:** A pure `welcomeReadyState` helper owns the single readiness predicate and a pure team-request transition helper owns card invalidation/outcome isolation; both are tested across every state transition. `WelcomePage` returns `WelcomeSkeleton` until that predicate is true. A `useLayoutEffect` applies the pending transition before paint; the fetch effect records only the corresponding request, and a failure transition clears cards before it settles.

**Tech Stack:** React 19, TypeScript, Vitest source-level tests.

---

### Task 1: Lock down readiness state transitions

**Files:**
- Create: `frontend/src/components/chat/welcomeReadyState.ts`
- Create: `frontend/src/components/chat/__tests__/welcomeReadyState.test.ts`
- Modify: `frontend/src/components/chat/__tests__/welcomeTeamGallery.test.ts`
- Test: `frontend/src/components/chat/__tests__/welcomeReadyState.test.ts`

- [ ] **Step 1: Write failing state-transition tests**

Test `isWelcomeContentReady` for settings loading, unresolved agent, persona pending and settled, team pending, success, and failure settlement. Test team request transitions from a settled card list into a new pending request, then through success, failure, and stale outcomes; this proves a prior team result is cleared before the new request settles. Add a source-level regression assertion that the component applies the pending transition in `useLayoutEffect` and gates its complete page by the helper.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run src/components/chat/__tests__/welcomeReadyState.test.ts src/components/chat/__tests__/welcomeTeamGallery.test.ts`

Expected: FAIL because the helper and before-paint invalidation do not exist.

- [ ] **Step 3: Implement the minimal readiness state**

Add helpers and their types. Import `WelcomeSkeleton` and settings loading; derive the single readiness condition through the helper; use `useLayoutEffect` to apply the pending team-request transition; use transition results to ignore stale outcomes and clear cards on failure; return the skeleton until ready.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run src/components/chat/__tests__/welcomeReadyState.test.ts src/components/chat/__tests__/welcomeTeamGallery.test.ts`

Expected: PASS.

### Task 2: Verify the scoped frontend change

**Files:**
- Modify: `frontend/src/components/chat/WelcomePage.tsx`
- Modify: `frontend/src/components/chat/__tests__/welcomeTeamGallery.test.ts`

- [ ] **Step 1: Run the related welcome tests**

Run: `cd frontend && pnpm vitest run src/components/chat/__tests__/welcomeReadyState.test.ts src/components/chat/__tests__/welcomeTeamGallery.test.ts src/components/chat/__tests__/welcomeLayout.test.ts`

Expected: PASS.

- [ ] **Step 2: Run the frontend build**

Run: `cd frontend && pnpm run build`

Expected: exit code 0.
