# Welcome Suggestion Card Desktop Width Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen only the welcome-page Team Plaza card container at responsive `sm`–`2xl` breakpoints.

**Architecture:** Extract the width-bearing class string from `getWelcomeSuggestionsContainerClass` into an exported constant. Both the rendered suggestions container and the loading skeleton consume this constant so loading and loaded content retain identical dimensions.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, Vitest.

---

### Task 1: Lock down the responsive width contract

**Files:**
- Modify: `frontend/src/components/chat/__tests__/welcomeLayout.test.ts`

- [ ] **Step 1: Write the failing test**

Update the existing starter-prompt/container test and add assertions that the exported container class contains `sm:max-w-[48rem]`, `md:max-w-[50rem]`, `lg:max-w-[52rem]`, `xl:max-w-[54rem]`, and `2xl:max-w-[56rem]`; assert it has no unprefixed `max-w-*` class; add a source assertion that `ChatSkeletons.tsx` imports and uses the shared constant.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- src/components/chat/__tests__/welcomeLayout.test.ts`

Expected: FAIL because the current widths are 44/46/48/50/52rem and no shared skeleton constant exists.

- [ ] **Step 3: Write minimal implementation**

Export `WELCOME_SUGGESTIONS_CLASS_NAME` from `welcomeLayout.ts`, set its responsive widths to 48/50/52/54/56rem, return it from `getWelcomeSuggestionsContainerClass`, and import it in `ChatSkeletons.tsx` for the skeleton container.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- src/components/chat/__tests__/welcomeLayout.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit only the three files above with message: `fix: widen welcome suggestion cards on desktop`.

### Task 2: Validate the frontend integration

**Files:**
- Verify: `frontend/src/components/chat/welcomeLayout.ts`
- Verify: `frontend/src/components/skeletons/ChatSkeletons.tsx`
- Verify: `frontend/src/components/chat/__tests__/welcomeLayout.test.ts`

- [ ] **Step 1: Run the focused test**

Run: `cd frontend && pnpm test -- src/components/chat/__tests__/welcomeLayout.test.ts`

Expected: PASS with no failures.

- [ ] **Step 2: Build the frontend**

Run: `cd frontend && pnpm run build`

Expected: successful Vite production build.
