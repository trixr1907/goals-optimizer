import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Smoke Tests — Demo-Kader Flow
 *
 * All tests use the built-in "Demo laden" button so no external
 * API calls (Goalsverse/Tracker/PlayGOALS) are required.
 *
 * Onboarding modal: suppressed via localStorage before each page load
 * (see beforeEach below). The modal key 'goals-onboarding-seen-v1' is
 * read from OnboardingModal.tsx — do not change without updating there.
 *
 * Console error collection: each test listens for console errors
 * and page errors. If any occur the test fails.
 */

// ── Onboarding suppression ────────────────────────────────────────────────────

/**
 * Set the onboarding-seen flag in localStorage *before* the page loads.
 * addInitScript runs in the browser context before any page script executes,
 * so the React component reads the flag immediately and never mounts the modal.
 *
 * Key source: src/components/onboarding/OnboardingModal.tsx
 *   const ONBOARDING_SEEN_KEY = 'goals-onboarding-seen-v1';
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('goals-onboarding-seen-v1', 'true');
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collect console errors + uncaught exceptions from the page. */
function collectErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`console.error: ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${err.message}`);
  });

  return { errors };
}

/**
 * Navigate to the import page.
 * The onboarding modal is already suppressed via beforeEach/addInitScript,
 * so we go straight to confirming the "Demo laden" button is interactable.
 */
async function openImportPage(page: Page) {
  await page.goto('/');

  // Safety net: if for any reason the modal still appears (e.g. storage was
  // cleared), dismiss it gracefully without force-clicking through it.
  const loslegen = page.getByRole('button', { name: /Loslegen|Verstanden|Starten|Schließen|OK|Weiter/i });
  if (await loslegen.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await loslegen.click();
    // Wait until modal overlay is gone before proceeding
    await page.locator('div.fixed.inset-0').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }

  // Confirm "Demo laden" is now interactable (not blocked by any overlay)
  await expect(page.getByRole('button', { name: /Demo laden/i })).toBeVisible();
}

/**
 * Load the demo squad and wait for the redirect to /lineup.
 * Returns the lineup page URL.
 */
async function loadDemo(page: Page) {
  await page.getByRole('button', { name: /Demo laden/i }).click();

  // Redirect to /lineup expected
  await page.waitForURL(/\/lineup/, { timeout: 10_000 });
  return page.url();
}

// ── Test 1: Demo Import Flow ──────────────────────────────────────────────────

test('Test 1: Demo-Import leitet auf Lineup weiter und zeigt Formation', async ({ page }) => {
  const { errors } = collectErrors(page);

  await openImportPage(page);
  const lineupUrl = await loadDemo(page);

  // Must have landed on lineup
  expect(lineupUrl).toMatch(/\/lineup/);

  // Heading visible
  await expect(page.getByRole('heading', { name: /Aufstellung/i })).toBeVisible();

  // "demo" label in page (e.g. "demo · 4-3-3")
  await expect(page.getByText(/demo/i)).toBeVisible();

  // Formation selector present
  await expect(page.locator('select, [role="combobox"]').first()).toBeVisible();

  // Pitch slots visible (GK, CB, etc.)
  await expect(page.getByRole('button', { name: /GK|CB|FB|CM|ST|WF|CAM|CDM/i }).first()).toBeVisible();

  // Bank area: at least some player cards present
  // Players have score badges (e.g. "Kane 91")
  const playerCards = page.getByRole('button', { name: /\d{2,3}$/ });
  await expect(playerCards.first()).toBeVisible();

  // No console errors
  expect(errors).toEqual([]);
});

// ── Test 2: Lineup Auto-Fill + Tournament Readiness ───────────────────────────

test('Test 2: Auto-Fill füllt Startelf, Tournament Card sichtbar', async ({ page }) => {
  const { errors } = collectErrors(page);

  await openImportPage(page);
  await loadDemo(page);

  // Click Auto-Fill
  await page.getByRole('button', { name: /Auto-Fill/i }).click();

  // Wait for slots to fill — pitch now has named players, not empty labels
  // We check that the pitch area no longer shows only empty GK/CB/etc. placeholders
  // by looking for a player name (any word followed by 2-digit score)
  await expect(page.getByRole('button', { name: /\w+ \d{2,3}/ }).first()).toBeVisible({ timeout: 5_000 });

  // Tournament Readiness card should appear somewhere on the page.
  // The card always renders "Turnier-Bereitschaft" as a label — this p element
  // is outside the filledCount condition, so it's always present when the card mounts.
  const readinessLabel = page.getByText('Turnier-Bereitschaft');
  await expect(readinessLabel).toBeVisible();

  // If an "Anwenden" button is visible and clickable, click it and confirm
  const anwendenBtn = page.getByRole('button', { name: /Anwenden/i }).first();
  if (await anwendenBtn.isVisible()) {
    // The click triggers a window.confirm dialog — auto-accept it
    page.once('dialog', (dialog) => dialog.accept());
    await anwendenBtn.click();
    // After apply: page should not crash; lineup heading still visible
    await expect(page.getByRole('heading', { name: /Aufstellung/i })).toBeVisible();
  }

  // No console errors
  expect(errors).toEqual([]);
});

// ── Test 3: Squad + Development Smoke ────────────────────────────────────────

test('Test 3: Squad- und Development-Seite zeigen Demo-Spieler', async ({ page }) => {
  const { errors } = collectErrors(page);

  // Load demo first (from import page -> lineup -> then navigate)
  await openImportPage(page);
  await loadDemo(page);

  // Navigate to Squad page
  await page.getByRole('link', { name: /Kader/i }).click();
  await page.waitForURL(/\/squad/, { timeout: 10_000 });

  // Squad page: player cards or list visible
  // Check for any recognisable demo player name
  await expect(page.getByText(/Kane|Neuer|Müller|Davies|Kimmich/i).first()).toBeVisible({ timeout: 8_000 });

  // Navigate to Development page
  await page.getByRole('link', { name: /Entwicklung/i }).click();
  await page.waitForURL(/\/development/, { timeout: 10_000 });

  // Development Center heading
  await expect(page.getByRole('heading', { name: /Development Center/i })).toBeVisible();

  // At least one advice label visible: Starter, Trainieren, or Turnier-Spezialist
  const adviceLabel = page.getByText(/Starter|Trainieren|Turnier-Spezialist/i).first();
  await expect(adviceLabel).toBeVisible({ timeout: 8_000 });

  // No console errors
  expect(errors).toEqual([]);
});
