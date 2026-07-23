# Welcome suggestion card desktop width

## Goal

Give the Team Plaza suggestion cards more horizontal space on desktop so their names and descriptions can be read without premature truncation.

## Scope

- Update only the `welcome-suggestions` container in the welcome page.
- Increase every `sm` through `2xl` maximum-width breakpoint by 4rem. Here, “mobile” means the unprefixed/base layout; it remains unchanged.
- Keep the two-column card grid, card spacing, typography, and all other welcome-page regions unchanged.
- Require the loading skeleton to consume the same exported width-class constant, preventing width drift and layout shift.

## Implementation

An exported `WELCOME_SUGGESTIONS_CLASS_NAME` will change from 44/46/48/50/52rem to 48/50/52/54/56rem for `sm`/`md`/`lg`/`xl`/`2xl`, respectively. Both `getWelcomeSuggestionsContainerClass` and the loading skeleton will consume the constant. An existing source/layout test will assert the full breakpoint sequence and the skeleton's use of the shared constant.

## Validation

Run the focused frontend welcome-layout test, then the frontend build. The test verifies the desktop width contract and the build validates the Tailwind class compilation.
