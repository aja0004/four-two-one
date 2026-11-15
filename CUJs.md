# 4-2-1 • Critical User Journeys (CUJs)

This document defines the top 5 Critical User Journeys (CUJs) for **4-2-1** and maps each journey to its automated Playwright E2E test in [`tests/cujs/cuj.spec.ts`](./tests/cujs/cuj.spec.ts).

## Running the CUJ Suite

```bash
# Run all 5 automated CUJ tests headlessly
npm run test:cuj

# Open interactive Playwright UI mode
npm run test:cuj:ui

# View HTML trace/screenshot report after a run
npm run test:cuj:report
```

---

## CUJ 1: Happy Path 4 → 2 → 1 Funnel (`pass_phone` mode)
- **Goal:** Verify a complete 2-player game on a single phone transitions cleanly across all phases (`SETUP` → `Q_PAGE_1` → `Q_PAGE_2` → `GENERATING` → `U1_REVIEW_4` → `HANDOFF_TO_U2` → `U2_PICK_2` → `HANDOFF_TO_U1` → `U1_PICK_1` → `WINNER`).
- **Assertions:**
  - User 1 configures meal type, cuisines, cravings note, and price tiers.
  - Stage 4 displays 4 curated [`RestaurantCard`](./components/RestaurantCard.tsx) options.
  - Pass-the-phone handoff screens guard turn transitions between User 1 and User 2.
  - Stage 2 enforces selecting **exactly 2** finalists before the submit CTA enables.
  - Stage 1 enforces selecting **1** winner and reveals the `WINNER` screen with tappable maps/delivery links and saves to `recent_winners`.

## CUJ 2: Rerolls, Cumulative Exclusions & User 2's 1-Veto Invariant
- **Goal:** Ensure rejected restaurants never reappear in the same session and User 2 can only veto once per game.
- **Assertions:**
  - Keeping 3 spots and clicking `Reroll the Rest (1)` swaps only the unkept spot and adds the rejected `placeId` to `excludedPlaceIds`.
  - User 2 clicking `Veto All 4 (1 left)` transitions to `U2_VETOED`, permanently excludes all 4 options, and decrements `user2VetoesRemaining` from `1` to `0`.
  - Rolling 4 new options returns 4 fresh restaurants with zero overlap with any previously excluded spots, and the Veto button is replaced by `Veto used — pick 2 finalists`.

## CUJ 3: Two-Phone Live Sync & Turn-Locking (`two_phones` mode)
- **Goal:** Verify real-time state synchronization across two independent browser contexts (Phone A = User 1, Phone B = User 2).
- **Assertions:**
  - Phone B joins Phone A's active room via `/room/[code]` (or Household Auto-Lobby).
  - Turn-locking shows a calm live-status waiting screen on the inactive player's phone and automatically unlocks the active view when the turn changes.
  - Picking the final winner on Phone A simultaneously renders the `WINNER` screen on both Phone A and Phone B.

## CUJ 4: Favorites, Manual Spot Inclusions & Recent-Winner Filtering
- **Goal:** Verify household taste memory and manual spot locks are respected during Stage 4 curation.
- **Assertions:**
  - Recent winners within the last 7 days are automatically toggled into `excludedRecentWinnerIds` on Step 1 and filtered out of Stage 4.
  - Spots added via "Include Specific Spots" (`manuallyIncludedPlaces`) are guaranteed to appear in Stage 4 and start pre-marked as `Kept`.

## CUJ 5: API Resilience — Manual Geocode Fallback & Pool Exhaustion Recovery
- **Goal:** Ensure external API edge cases (location lookup or zero matching open restaurants) recover gracefully without trapping the user.
- **Assertions:**
  - Inline manual location search resolves via `/api/geocode` and updates the active neighborhood pill.
  - When `/api/options` returns an exhausted pool (`exhausted: true`), Stage 4 renders a clear recovery prompt (`Edit Filters`) that opens the `Update Filters` modal sheet so User 1 can adjust filters and roll 4 fresh spots.
