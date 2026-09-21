#!/usr/bin/env node
// Exports a season's poster as PDF and PNG by driving the actual poster
// editor's "Export PDF" / "Export PNG" buttons in a real browser -- the
// poster is rendered and exported entirely client-side, so there is no
// backend endpoint that can produce these files directly.
//
// Usage:
//   SEASON_ID=<uuid> node export_poster.js [output_dir]
//
// Requires the frontend dev server to be running and reachable at
// FRONTEND_URL (default http://localhost:5173). Run from a directory
// where `require('playwright')` resolves (e.g. the frontend/ package),
// or set NODE_PATH to its node_modules.
//
// Optional: PLAYWRIGHT_CHROMIUM_PATH to point at a pre-installed
// Chromium binary instead of the one Playwright would otherwise expect.

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SEASON_ID = process.env.SEASON_ID;
if (!SEASON_ID) {
  console.error('SEASON_ID environment variable is required');
  process.exit(1);
}

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const OUT_DIR = path.resolve(process.argv[2] || '.');
const errors = [];

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch(
    CHROMIUM_PATH ? { executablePath: CHROMIUM_PATH } : {}
  );
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1100 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto(`${FRONTEND_URL}/seasons/${SEASON_ID}/poster`);
  await page.waitForSelector('[data-testid="poster-page"]', { timeout: 15000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(OUT_DIR, 'poster_editor_view.png'), fullPage: false });

  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('button:has-text("Export PDF")'),
  ]);
  await pdfDownload.saveAs(path.join(OUT_DIR, 'poster.pdf'));

  const [pngDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('button:has-text("Export PNG")'),
  ]);
  await pngDownload.saveAs(path.join(OUT_DIR, 'poster.png'));

  const realErrors = errors.filter((e) => !e.includes('favicon') && !e.includes('404'));
  console.log('Console/page errors (excluding favicon 404):', realErrors);
  if (realErrors.length > 0) {
    process.exitCode = 1;
  }
  console.log('done');
  await browser.close();
})();
