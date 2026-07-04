import { test, expect, type Page } from '@playwright/test';

/**
 * E2E Smoke Tests — Demo-Kader Flow
 *
 * All tests use the built-in "Demo laden" button so no external
 * API calls (Goalsverse/Tracker/PlayGOALS) are required.
 *
 * Console error collection: each test listens for console errors
 * and page errors. If any occur the test fails.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

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
 * Navigate to the import page and dismiss the onboarding modal if present.
 * Returns when the "Demo laden" button is ready.
 */
async function openImportPage(page: Page) {
  await page.goto('/');

  // Dismiss onboarding modal if visible (first visit only)
  const loslegen = page.getByRole('button', { name: 'Loslegen' });
  if (await loslegen.isVisible()) {
    await loslegen.click();
    await expect(loslegen).not.toBeVisible();
  }

  // Confirm import page is ready
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
  // The card always renders "Turnier-Bereitschaft" as a label
  // and "Aktuelle Startelf" as the h3 — both are inside the visible card region,
  // not hidden nav links.
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
