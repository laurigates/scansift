/**
 * Happy-path E2E smoke test.
 *
 * Boots the full dev stack (server + Vite client) via the `webServer` config
 * in playwright.config.ts and asserts the initial UI renders correctly:
 *   - The page title shows the app name
 *   - The scanner status component renders (with or without an attached scanner)
 *   - The primary "Scan Fronts" button is visible and enabled
 *
 * Without a real network scanner discovered via mDNS we can't trigger an
 * actual scan from the browser, so the scan-trigger scenario is skipped with
 * an explanation. The MVP value here is regression coverage for the static
 * UI shell — header, scanner status, and the main scan button.
 */

import { expect, test } from '@playwright/test';

test.describe('happy path smoke', () => {
  test('page loads with header, scanner status, and primary scan button', async ({ page }) => {
    await page.goto('/');

    // Header / app title.
    await expect(page.getByRole('heading', { name: /photoscan/i })).toBeVisible();

    // Scanner status card renders (data-testid set on the surrounding div).
    // It may show "Scanner Connected" or "Scanner Not Found" depending on
    // whether the server discovered an eSCL scanner during the test run; we
    // accept either by waiting for the wrapper to settle.
    const statusCard = page.getByTestId('scanner-status');
    await expect(statusCard).toBeVisible();
    await expect(statusCard).toContainText(/Scanner (Connected|Not Found)/);

    // Primary scan button — initially in idle/"Scan Fronts" mode.
    const scanButton = page.getByRole('button', { name: /scan fronts/i });
    await expect(scanButton).toBeVisible();
    await expect(scanButton).toBeEnabled();

    // Refresh button on the scanner status card.
    await expect(page.getByRole('button', { name: /refresh scanner status/i })).toBeVisible();
  });

  test.skip('triggering a scan completes the front+back+save workflow', async () => {
    // Skipped: this scenario requires a discoverable eSCL scanner (or an
    // in-process scanner stub) reachable from the dev server during the
    // Playwright run. The integration tests in tests/integration/ already
    // cover the equivalent flow against a fake eSCL HTTP server.
    //
    // To unlock this test: extend the dev-server boot in playwright.config.ts
    // to point the server at a fake eSCL backend (e.g. via env var like
    // SCANNER_URL=http://127.0.0.1:N) and stub mDNS discovery accordingly.
  });
});
