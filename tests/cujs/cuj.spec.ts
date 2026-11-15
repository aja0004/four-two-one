import { expect, test } from '@playwright/test';
import {
  installDeterministicMocks,
  MOCK_CANDIDATE_POOL,
  seedPlayerDevice,
  TEST_LOCATION,
} from './helpers';
import { GameSessionState } from '../../lib/types';

test.describe('4-2-1 Top 5 Critical User Journeys (CUJs)', () => {
  test('CUJ 1: Happy Path 4 → 2 → 1 Funnel in 1-iPhone Pass-the-Phone mode', async ({
    page,
  }) => {
    await seedPlayerDevice(page, {
      ownerName: 'Alex',
      recentPartners: ['Lauren'],
    });
    await installDeterministicMocks(page);

    await page.goto('/');

    // 1. Setup Screen: select 1 iPhone (Pass) mode, verify Alex & Lauren, and Start
    await expect(page.getByText(TEST_LOCATION.label)).toBeVisible();
    await page.getByRole('button', { name: /1 iPhone \(Pass\)/i }).click();
    await expect(page.getByRole('button', { name: 'Start' })).toBeEnabled();
    await page.getByRole('button', { name: 'Start' }).click();

    // 2. Questionnaire Page 1: Meal Type & Cuisines
    await expect(
      page.getByRole('heading', { name: 'What sounds good?' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Italian' }).click();
    await page.getByRole('button', { name: 'Thai' }).click();
    await page
      .getByPlaceholder(/cozy ramen, vegetarian options/i)
      .fill('handmade pasta or spicy noodles');
    await page
      .getByRole('button', { name: /Next: Price & Distance/i })
      .click();

    // 3. Questionnaire Page 2: Price & Timing -> Find 4 Options
    await expect(
      page.getByRole('heading', { name: 'Price & timing' })
    ).toBeVisible();
    await page.getByRole('button', { name: '$$$', exact: true }).click();
    await page.getByRole('button', { name: 'Find 4 Options' }).click();

    // 4. Stage 4 (U1_REVIEW_4): Verify 4 RestaurantCards render and confirm
    await expect(
      page.getByRole('heading', { name: 'Review your 4 spots' })
    ).toBeVisible();
    for (const spot of MOCK_CANDIDATE_POOL.slice(0, 4)) {
      await expect(
        page.getByRole('heading', { name: spot.name, exact: true })
      ).toBeVisible();
    }
    await page
      .getByRole('button', { name: /Confirm These 4 for Lauren/i })
      .click();

    // 5. Handoff Interstitial to User 2 -> Stage 2 (U2_PICK_2)
    await expect(
      page.getByRole('heading', { name: /Pass iPhone to Lauren/i })
    ).toBeVisible();
    await page
      .getByRole('button', { name: /I’m Lauren — Show Options/i })
      .click();

    await expect(
      page.getByRole('heading', { name: 'Pick your top 2 finalists' })
    ).toBeVisible();

    const sendTwoBtn = page.getByRole('button', {
      name: /Send These 2 to Alex/i,
    });
    await expect(sendTwoBtn).toBeDisabled();

    // Select 2 finalists: Trullo & Farang
    await page.getByRole('heading', { name: 'Trullo', exact: true }).click();
    await page.getByRole('heading', { name: 'Farang', exact: true }).click();
    await expect(page.getByText('2 of 2 selected')).toBeVisible();
    await expect(sendTwoBtn).toBeEnabled();
    await sendTwoBtn.click();

    // 6. Handoff Interstitial back to User 1 -> Stage 1 (U1_PICK_1)
    await expect(
      page.getByRole('heading', {
        name: /Lauren narrowed it down to 2! Pass back to Alex/i,
      })
    ).toBeVisible();
    await page.getByRole('button', { name: /I’m Alex — Continue/i }).click();

    await expect(
      page.getByRole('heading', { name: /Lauren’s Top 2 Finalists/i })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Trullo', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Farang', exact: true })
    ).toBeVisible();

    const confirmWinnerBtn = page.getByRole('button', {
      name: /That’s Dinner!/i,
    });
    await expect(confirmWinnerBtn).toBeDisabled();

    await page.getByRole('heading', { name: 'Trullo', exact: true }).click();
    await expect(confirmWinnerBtn).toBeEnabled();
    await confirmWinnerBtn.click();

    // 7. Winner Screen: Verify winner details, delivery links, address link, and recent winner persistence
    await expect(page.getByText('Tonight’s Dinner')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Trullo', exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Saved to recent household winners')
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /300-302 St Paul’s Rd/i })
    ).toHaveAttribute('href', /maps\.google\.com/);
  });

  test('CUJ 2: Rerolls, Cumulative Exclusions & User 2 Strictly-1-Veto Invariant', async ({
    page,
  }) => {
    await seedPlayerDevice(page, {
      ownerName: 'Alex',
      recentPartners: ['Lauren'],
    });
    await installDeterministicMocks(page);

    await page.goto('/');
    await page.getByRole('button', { name: /1 iPhone \(Pass\)/i }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await page
      .getByRole('button', { name: /Next: Price & Distance/i })
      .click();
    await page.getByRole('button', { name: 'Find 4 Options' }).click();

    // Initial 4: Trullo, Farang, Smoking Goat, Padella
    await expect(
      page.getByRole('heading', { name: 'Trullo', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Padella', exact: true })
    ).toBeVisible();

    // 1. Keep 3 spots (Trullo, Farang, Smoking Goat) and reroll the 1 unkept spot (Padella)
    await page.getByRole('heading', { name: 'Trullo', exact: true }).click();
    await page.getByRole('heading', { name: 'Farang', exact: true }).click();
    await page
      .getByRole('heading', { name: 'Smoking Goat', exact: true })
      .click();
    await expect(page.getByText('3 of 4 kept')).toBeVisible();

    await page
      .getByRole('button', { name: /Reroll the Rest \(1\)/i })
      .click();

    // Padella is replaced by Dishoom Upper Street and added to excludedPlaceIds
    await expect(
      page.getByRole('heading', { name: 'Padella', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Dishoom Upper Street', exact: true })
    ).toBeVisible();

    // Confirm the 4 for Lauren
    await page
      .getByRole('button', { name: /Confirm These 4 for Lauren/i })
      .click();
    await page
      .getByRole('button', { name: /I’m Lauren — Show Options/i })
      .click();

    // 2. Stage 2: Lauren uses her 1 Veto
    const vetoBtn = page.getByRole('button', { name: /Veto All 4 \(1 left\)/i });
    await expect(vetoBtn).toBeVisible();
    await vetoBtn.click();

    // Confirm in the iOS action sheet
    await expect(
      page.getByRole('heading', {
        name: /Use your 1 veto and send back to Alex\?/i,
      })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Yes, Veto All 4' }).click();

    // Handoff back to Alex -> U2_VETOED screen
    await expect(
      page.getByRole('heading', {
        name: /Lauren used their Veto! Pass back to Alex/i,
      })
    ).toBeVisible();
    await page.getByRole('button', { name: /I’m Alex — Continue/i }).click();

    await expect(
      page.getByRole('heading', { name: /Lauren vetoed those 4 spots/i })
    ).toBeVisible();
    await page.getByRole('button', { name: /Roll 4 New Options/i }).click();

    // 3. Verify none of the 5 previously excluded spots (Padella + 4 vetoed) appear in the new 4
    await expect(
      page.getByRole('heading', { name: 'Roti King', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Blacklock Islington', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'BAO Noodle Shop', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Mangal 2', exact: true })
    ).toBeVisible();

    for (const excludedName of [
      'Padella',
      'Trullo',
      'Farang',
      'Smoking Goat',
      'Dishoom Upper Street',
    ]) {
      await expect(
        page.getByRole('heading', { name: excludedName, exact: true })
      ).toHaveCount(0);
    }

    // Confirm the new 4 and verify Lauren now has 0 vetoes remaining
    await page
      .getByRole('button', { name: /Confirm These 4 for Lauren/i })
      .click();
    await page
      .getByRole('button', { name: /I’m Lauren — Show Options/i })
      .click();

    await expect(
      page.getByText(/Veto used — pick 2 finalists/i)
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Veto All 4/i })
    ).toHaveCount(0);
  });

  test('CUJ 3: Two-Phone Live Sync & Turn-Locking across two contexts', async ({
    browser,
  }) => {
    const sharedSessions = new Map<string, GameSessionState>();

    // Create two isolated BrowserContexts (Phone A = Alex, Phone B = Lauren) to simulate 2 separate iPhones
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const phoneA = await contextA.newPage();
    const phoneB = await contextB.newPage();

    // Bridge sync updates from one context to the other ONLY to the opposite phone!
    const makeNotifyPeer =
      (peerPage: typeof phoneA) => (updatedSession: GameSessionState) => {
        void peerPage
          .evaluate((sess) => {
            const bc = new BroadcastChannel('421_local_sync_channel_v1');
            bc.postMessage({ type: 'SESSION_UPDATE', session: sess });
            bc.close();
          }, updatedSession)
          .catch(() => {});
      };

    await installDeterministicMocks(contextA, {
      sharedSessions,
      onSessionSynced: makeNotifyPeer(phoneB),
    });
    await installDeterministicMocks(contextB, {
      sharedSessions,
      onSessionSynced: makeNotifyPeer(phoneA),
    });

    // Seed Phone A as Alex, Phone B as Lauren
    await seedPlayerDevice(phoneA, {
      ownerName: 'Alex',
      recentPartners: ['Lauren'],
    });
    await seedPlayerDevice(phoneB, {
      ownerName: 'Lauren',
      recentPartners: ['Alex'],
    });

    await phoneA.goto('/');

    // Phone A starts a 2 iPhones (Live) game with Lauren
    await phoneA.getByRole('button', { name: /2 iPhones \(Live\)/i }).click();
    await phoneA.getByRole('button', { name: 'Start' }).click();

    await expect(
      phoneA.getByRole('heading', { name: 'What sounds good?' })
    ).toBeVisible();

    // Extract the 4-digit room code from Phone A's FunnelHeader
    const roomBadgeText = await phoneA
      .locator('header button[title="Share room code"]')
      .innerText();
    const roomCode = roomBadgeText.replace(/\D/g, '');
    expect(roomCode).toHaveLength(4);

    // Phone B (Lauren) joins via `/room/[code]`
    await phoneB.goto(`/room/${roomCode}`);

    // Verify Turn-Locking: while Alex is in Q_PAGE_1, Lauren sees the calm waiting screen
    await expect(
      phoneB.getByRole('heading', {
        name: /Alex is picking tonight’s cravings/i,
      })
    ).toBeVisible();
    // Wait for Phone B's join sync (`Partner: Lauren`) to settle on Phone A before Alex advances
    await expect(phoneA.getByText('Partner:')).toBeVisible();

    // Alex advances to Stage 4 and confirms the 4 spots
    await phoneA
      .getByRole('button', { name: /Next: Price & Distance/i })
      .click();
    await phoneA.getByRole('button', { name: 'Find 4 Options' }).click();
    await expect(
      phoneA.getByRole('heading', { name: 'Review your 4 spots' })
    ).toBeVisible();

    // Lauren's waiting copy updates live to reflect Stage 4
    await expect(
      phoneB.getByRole('heading', { name: /Alex is reviewing 4 options/i })
    ).toBeVisible();

    await phoneA
      .getByRole('button', { name: /Confirm These 4 for Lauren/i })
      .click();

    // Now Phone A waits for Lauren, while Phone B automatically unlocks Stage 2!
    await expect(
      phoneA.getByRole('heading', {
        name: /Lauren is narrowing 4 down to 2/i,
      })
    ).toBeVisible();
    await expect(
      phoneB.getByRole('heading', { name: 'Pick your top 2 finalists' })
    ).toBeVisible();

    // Lauren picks 2 finalists on Phone B and sends them to Alex
    await phoneB.getByRole('heading', { name: 'Trullo', exact: true }).click();
    await phoneB.getByRole('heading', { name: 'Farang', exact: true }).click();
    await phoneB
      .getByRole('button', { name: /Send These 2 to Alex/i })
      .click();

    // Phone A automatically transitions to Stage 1 (`U1_PICK_1`), Phone B waits
    await expect(
      phoneA.getByRole('heading', { name: /Lauren’s Top 2 Finalists/i })
    ).toBeVisible();
    await expect(
      phoneB.getByRole('heading', {
        name: /Alex is choosing between your 2 finalists/i,
      })
    ).toBeVisible();

    // Alex picks the final winner on Phone A -> BOTH phones simultaneously show the Winner screen!
    await phoneA.getByRole('heading', { name: 'Farang', exact: true }).click();
    await phoneA.getByRole('button', { name: /That’s Dinner!/i }).click();

    await expect(phoneA.getByText('Tonight’s Dinner')).toBeVisible();
    await expect(phoneB.getByText('Tonight’s Dinner')).toBeVisible();
    await expect(
      phoneB.getByRole('heading', { name: 'Farang', exact: true })
    ).toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test('CUJ 4: Favorites, Manual Spot Inclusions & Recent-Winner Exclusion Filtering', async ({
    page,
  }) => {
    // Seed Trullo as a recent winner from 2 days ago so it is excluded by default
    await seedPlayerDevice(page, {
      ownerName: 'Alex',
      recentPartners: ['Lauren'],
      recentWinners: [
        {
          id: 'win_1',
          householdId: 'pair_alex__lauren',
          sessionId: 'sess_prev',
          placeId: 'mock_trullo',
          name: 'Trullo',
          cuisine: 'Italian',
          mealType: 'order_in',
          priceTier: '$$$',
          address: '300 St Paul’s Rd',
          mapsUrl: 'https://maps.google.com/?cid=trullo',
          createdAt: new Date(Date.now() - 2 * 86400_000).toISOString(),
        },
      ],
    });
    await installDeterministicMocks(page);

    await page.goto('/');
    await page.getByRole('button', { name: /1 iPhone \(Pass\)/i }).click();
    await page.getByRole('button', { name: 'Start' }).click();

    // 1. Verify "Exclude recent winners (7d)" toggle is active with 1/1 recent winner (Trullo)
    const excludeSwitch = page.getByRole('switch');
    await expect(excludeSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('1/1')).toBeVisible();

    // 2. Use "Include Specific Spots" lookup to manually lock in "Maison Premiere"
    const lookupInput = page.getByPlaceholder(
      /Lookup a restaurant to include/i
    );
    await lookupInput.fill('Maison Premiere');
    await page
      .getByRole('button', { name: /Include “Maison Premiere”/i })
      .click();
    await expect(page.getByText('1/4 included')).toBeVisible();

    // Proceed to Stage 4
    await page
      .getByRole('button', { name: /Next: Price & Distance/i })
      .click();
    await page.getByRole('button', { name: 'Find 4 Options' }).click();

    // 3. Assert manually included spot ("Maison Premiere") is locked into Stage 4 and pre-marked "Kept",
    // while excluded recent winner ("Trullo") is filtered out!
    await expect(
      page.getByRole('heading', { name: 'Maison Premiere', exact: true })
    ).toBeVisible();
    await expect(page.getByText('1 of 4 kept')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Trullo', exact: true })
    ).toHaveCount(0);
  });

  test('CUJ 5: API Resilience — Manual Geocode Fallback & Pool Exhaustion Recovery', async ({
    page,
  }) => {
    await seedPlayerDevice(page, {
      ownerName: 'Alex',
      recentPartners: ['Lauren'],
    });
    await installDeterministicMocks(page, { forceExhaustedOnInitial: true });

    await page.goto('/');

    // 1. Test inline manual location editor via `/api/geocode`
    await page.getByRole('button', { name: /Islington, London/i }).click();
    const locInput = page.getByPlaceholder(/Neighborhood, address, or ZIP/i);
    await expect(locInput).toBeVisible();
    await locInput.fill('Soho');
    await page.getByRole('button', { name: 'Set', exact: true }).click();
    await expect(page.getByText('Soho, London')).toBeVisible();

    // 2. Start game and trigger exhausted pool response
    await page.getByRole('button', { name: /1 iPhone \(Pass\)/i }).click();
    await page.getByRole('button', { name: 'Start' }).click();
    await page
      .getByRole('button', { name: /Next: Price & Distance/i })
      .click();
    await page.getByRole('button', { name: 'Find 4 Options' }).click();

    // 3. Verify graceful exhaustion UI and recovery via "Edit Filters" ("Update Filters" sheet)
    await expect(
      page.getByText('No matching open restaurants left')
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Edit Filters' })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Update Filters' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Apply & Roll/i })
    ).toBeVisible();
  });

  test('CUJ 6: Hardened Live Play Resilience — Suspended WebSockets, 1-Tap iMessage Join, Transient 503 Retry & Stale PWA Reload', async ({
    browser,
  }) => {
    const sharedSessions = new Map<string, GameSessionState>();
    const failNextUpsertOnPhoneB = { count: 0 };

    // Isolated contexts WITH ZERO BroadcastChannel / WebSocket push between them!
    // Simulates iOS Safari suspending Phone A's WebSocket while Alex texts the link in iMessage.
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const phoneA = await contextA.newPage();
    const phoneB = await contextB.newPage();

    await installDeterministicMocks(contextA, { sharedSessions });
    await installDeterministicMocks(contextB, {
      sharedSessions,
      failNextUpsertRef: failNextUpsertOnPhoneB,
    });

    // Phone A is Alex; Phone B is an unseeded fresh browser (like opening an iMessage link in SafariViewController!)
    await seedPlayerDevice(phoneA, {
      ownerName: 'Alex',
      recentPartners: ['Lauren'],
    });

    await phoneA.goto('/');
    await phoneA.getByRole('button', { name: /2 iPhones \(Live\)/i }).click();
    await phoneA.getByRole('button', { name: 'Start' }).click();

    await expect(
      phoneA.getByRole('heading', { name: 'What sounds good?' })
    ).toBeVisible();

    // Assert Phone A's browser URL automatically synced to `/room/[code]`
    await expect(phoneA).toHaveURL(/\/room\/\d{4}$/);
    const roomCode = phoneA.url().split('/room/')[1].slice(0, 4);

    // Alex curates 4 options and confirms them for Lauren
    await phoneA
      .getByRole('button', { name: /Next: Price & Distance/i })
      .click();
    await phoneA.getByRole('button', { name: 'Find 4 Options' }).click();
    await expect(
      phoneA.getByRole('heading', { name: 'Review your 4 spots' })
    ).toBeVisible();

    await phoneA
      .getByRole('button', { name: /Confirm These 4 for Lauren/i })
      .click();

    // Phone A shows the waiting view + summary of the 4 spots sent to Lauren
    await expect(
      phoneA.getByRole('heading', { name: /Lauren is narrowing 4 down to 2/i })
    ).toBeVisible();
    await expect(phoneA.getByText('4 Spots Sent to Lauren')).toBeVisible();

    // Phone B opens `/room/[code]` in a fresh browser with NO saved name in localStorage
    await phoneB.goto(`/room/${roomCode}`);

    // Verify 1-tap identity modal offers "Continue as Lauren" + "I’m Alex (Host)"
    const continueAsLaurenBtn = phoneB.getByRole('button', {
      name: /Continue as Lauren/i,
    });
    await expect(continueAsLaurenBtn).toBeVisible();
    await expect(
      phoneB.getByRole('button', { name: /I’m Alex \(Host\)/i })
    ).toBeVisible();
    await continueAsLaurenBtn.click();

    // Phone B is immediately on Stage 2 ("Pick your top 2 finalists")
    await expect(
      phoneB.getByRole('heading', { name: 'Pick your top 2 finalists' })
    ).toBeVisible();

    // Inject a transient HTTP 503 failure on Phone B's first upsert when sending 2 finalists!
    failNextUpsertOnPhoneB.count = 1;

    await phoneB.getByRole('heading', { name: 'Trullo', exact: true }).click();
    await phoneB.getByRole('heading', { name: 'Farang', exact: true }).click();
    await phoneB
      .getByRole('button', { name: /Send These 2 to Alex/i })
      .click();

    // Verify Phone A AUTOMATICALLY catches up via heartbeat/foreground sync (within ~3s) WITH ZERO WebSocket push!
    await expect(
      phoneA.getByRole('heading', { name: /Lauren’s Top 2 Finalists/i })
    ).toBeVisible({ timeout: 6000 });
    await expect(
      phoneA.getByRole('heading', { name: 'Trullo', exact: true })
    ).toBeVisible();
    await expect(
      phoneA.getByRole('heading', { name: 'Farang', exact: true })
    ).toBeVisible();

    // Simulate iOS Home Screen PWA reopening `/` with a STALE `U2_PICK_2` snapshot in localStorage!
    await phoneA.evaluate(() => {
      const raw = window.localStorage.getItem('421_active_session_v1');
      if (!raw) return;
      const stale = JSON.parse(raw);
      stale.phase = 'U2_PICK_2';
      stale.finalistTwo = [];
      stale.revision = 1;
      window.localStorage.setItem(
        '421_active_session_v1',
        JSON.stringify(stale)
      );
    });
    await phoneA.goto('/');

    // Phone A must reconcile with Supabase (`fetchSessionById` + `mergeSessionStates`) and show Stage 1 (`Lauren's Top 2 Finalists`), NOT regress to `U2_PICK_2`!
    await expect(
      phoneA.getByRole('heading', { name: /Lauren’s Top 2 Finalists/i })
    ).toBeVisible({ timeout: 6000 });

    // Alex picks the winner -> Phone B (also without WebSocket push!) automatically reveals the Winner!
    await phoneA.getByRole('heading', { name: 'Farang', exact: true }).click();
    await phoneA.getByRole('button', { name: /That’s Dinner!/i }).click();

    await expect(phoneA.getByText('Tonight’s Dinner')).toBeVisible();
    await expect(phoneB.getByText('Tonight’s Dinner')).toBeVisible({
      timeout: 6000,
    });
    await expect(
      phoneB.getByRole('heading', { name: 'Farang', exact: true })
    ).toBeVisible();

    await contextA.close();
    await contextB.close();
  });

  test('CUJ 7: Open Invite Link — Partner Enters Name After Host Confirmed 4 Without Clobbering Game State', async ({
    browser,
  }) => {
    const sharedSessions = new Map<string, GameSessionState>();

    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const phoneA = await contextA.newPage();
    const phoneB = await contextB.newPage();

    await installDeterministicMocks(contextA, { sharedSessions });
    await installDeterministicMocks(contextB, { sharedSessions });

    await seedPlayerDevice(phoneA, {
      ownerName: 'Alex',
      recentPartners: ['Lauren'],
    });

    await phoneA.goto('/');
    await phoneA
      .getByRole('button', { name: /New Partner \(Invite Link\)/i })
      .click();
    await phoneA.getByRole('button', { name: 'Start' }).click();

    await expect(phoneA).toHaveURL(/\/room\/\d{4}$/);
    const roomCode = phoneA.url().split('/room/')[1].slice(0, 4);

    // Alex curates 4 spots and confirms them BEFORE sharing the link
    await phoneA
      .getByRole('button', { name: /Next: Price & Distance/i })
      .click();
    await phoneA.getByRole('button', { name: 'Find 4 Options' }).click();
    await expect(
      phoneA.getByRole('heading', { name: 'Review your 4 spots' })
    ).toBeVisible();
    await phoneA
      .getByRole('button', { name: /Confirm These 4 for Partner/i })
      .click();

    // Phone B opens `/room/[code]` in a fresh browser, enters name "Maya", and picks 2 finalists
    await phoneB.goto(`/room/${roomCode}`);
    await phoneB.getByPlaceholder(/Your first name/i).fill('Maya');
    await phoneB.getByRole('button', { name: 'Join Game' }).click();

    // Crucial: submitting name "Maya" must NOT clobber `phase: U2_PICK_2` or `currentFour`!
    await expect(
      phoneB.getByRole('heading', { name: 'Pick your top 2 finalists' })
    ).toBeVisible();

    await phoneB.getByRole('heading', { name: 'Trullo', exact: true }).click();
    await phoneB.getByRole('heading', { name: 'Padella', exact: true }).click();
    await phoneB
      .getByRole('button', { name: /Send These 2 to Alex/i })
      .click();

    // Phone A catches up automatically (with zero WebSockets) and shows both Maya's real name AND her 2 finalists!
    await expect(
      phoneA.getByRole('heading', { name: /Maya’s Top 2 Finalists/i })
    ).toBeVisible({ timeout: 6000 });
    await expect(
      phoneA.getByRole('heading', { name: 'Trullo', exact: true })
    ).toBeVisible();
    await expect(
      phoneA.getByRole('heading', { name: 'Padella', exact: true })
    ).toBeVisible();

    await contextA.close();
    await contextB.close();
  });
});
