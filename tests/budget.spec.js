const { test, expect } = require('@playwright/test');

// ─── Page Load ───
test('page loads with correct title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Budget 2026');
});

test('root element exists', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#root')).toBeVisible();
});

test('toast element exists in DOM', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#toast')).toBeAttached();
});

// ─── Header ───
test('header is visible and sticky', async ({ page }) => {
  await page.goto('/');
  const hdr = page.locator('.hdr');
  await expect(hdr).toBeVisible();
  await expect(hdr).toHaveCSS('position', 'sticky');
});

test('header contains app title', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hdr h1')).toBeVisible();
});

// ─── Tabs ───
test('all main tabs are present', async ({ page }) => {
  await page.goto('/');
  // Wait for app to render
  await page.waitForSelector('.ptab', { timeout: 10000 });
  const tabs = page.locator('.ptab');
  const tabTexts = await tabs.allTextContents();
  expect(tabTexts.some(t => t.includes('Budget'))).toBeTruthy();
  expect(tabTexts.some(t => t.includes('Biz'))).toBeTruthy();
  expect(tabTexts.some(t => t.includes('Admin'))).toBeTruthy();
  expect(tabTexts.some(t => t.includes('Travel'))).toBeTruthy();
  expect(tabTexts.some(t => t.includes('Charity'))).toBeTruthy();
  expect(tabTexts.some(t => t.includes('Cash'))).toBeTruthy();
  expect(tabTexts.some(t => t.includes('Year'))).toBeTruthy();
});

test('clicking a tab switches the active tab', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.ptab', { timeout: 10000 });
  const bizTab = page.locator('.ptab', { hasText: 'Biz' });
  await bizTab.click();
  await expect(bizTab).toHaveClass(/active/);
});

test('clicking Budget tab returns to budget view', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.ptab', { timeout: 10000 });
  // Switch away then back
  await page.locator('.ptab', { hasText: 'Biz' }).click();
  const budgetTab = page.locator('.ptab', { hasText: 'Budget' });
  await budgetTab.click();
  await expect(budgetTab).toHaveClass(/active/);
});

// ─── Month Tabs ───
test('month tabs are rendered', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.mtab', { timeout: 10000 });
  const monthTabs = page.locator('.mtab');
  expect(await monthTabs.count()).toBeGreaterThan(0);
});

test('one month tab is active', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.mtab.active', { timeout: 10000 });
  await expect(page.locator('.mtab.active').first()).toBeVisible();
});

// ─── Undo/Redo Buttons ───
test('undo button exists and starts disabled', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#undo-btn', { timeout: 10000 });
  await expect(page.locator('#undo-btn')).toBeDisabled();
});

test('redo button exists and starts disabled', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#redo-btn', { timeout: 10000 });
  await expect(page.locator('#redo-btn')).toBeDisabled();
});

// ─── Ribbon / Summary Bar ───
test('ribbon summary section exists', async ({ page }) => {
  await page.goto('/');
  // Ribbon might be hidden by default, check it's in DOM
  const ribbon = page.locator('.ribbon-panel');
  // It should either be visible or have a toggle to show it
  const toggleBtn = page.locator('.ribbon-toggle');
  const ribbonVisible = await ribbon.isVisible().catch(() => false);
  const toggleVisible = await toggleBtn.first().isVisible().catch(() => false);
  expect(ribbonVisible || toggleVisible).toBeTruthy();
});

// ─── Side Navigation ───
test('side navigation panel exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#side-nav', { timeout: 10000 });
  await expect(page.locator('#side-nav')).toBeVisible();
});

test('side nav contains Savings link', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.sidenav-item', { timeout: 10000 });
  const savingsLink = page.locator('.sidenav-item', { hasText: 'Savings' });
  await expect(savingsLink).toBeVisible();
});

// ─── Sidebar Quick Add Form ───
test('sidebar quick-add form has all fields', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#sb-cat', { timeout: 10000 });
  await expect(page.locator('#sb-cat')).toBeVisible();
  await expect(page.locator('#sb-store')).toBeVisible();
  await expect(page.locator('#sb-item')).toBeVisible();
  await expect(page.locator('#sb-amount')).toBeVisible();
  await expect(page.locator('#sb-date')).toBeVisible();
  await expect(page.locator('#sb-btn')).toBeVisible();
});

test('sidebar category dropdown has options', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#sb-cat', { timeout: 10000 });
  const options = page.locator('#sb-cat option');
  expect(await options.count()).toBeGreaterThan(1);
});

test('sidebar Save button has correct text', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#sb-btn', { timeout: 10000 });
  await expect(page.locator('#sb-btn')).toHaveText('Save →');
});

// ─── Category Sections ───
test('category rows are rendered', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.cat-row', { timeout: 10000 });
  const cats = page.locator('.cat-row');
  expect(await cats.count()).toBeGreaterThan(0);
});

test('clicking a category row toggles it open', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.cat-top', { timeout: 10000 });
  const firstCatTop = page.locator('.cat-top').first();
  await firstCatTop.click();
  // After click, the parent .cat-row should have 'open' class
  const catRow = firstCatTop.locator('..');
  await expect(catRow).toHaveClass(/open/);
});

test('double-clicking a category toggles it closed again', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.cat-top', { timeout: 10000 });
  const firstCatTop = page.locator('.cat-top').first();
  // Open
  await firstCatTop.click();
  await expect(firstCatTop.locator('..')).toHaveClass(/open/);
  // Close
  await firstCatTop.click();
  await expect(firstCatTop.locator('..')).not.toHaveClass(/open/);
});

// ─── Group Sections ───
test('group blocks are rendered', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.group-block', { timeout: 10000 });
  expect(await page.locator('.group-block').count()).toBeGreaterThan(0);
});

test('Savings group block exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#group-Savings', { timeout: 10000 });
  await expect(page.locator('#group-Savings')).toBeVisible();
});

// ─── Keyboard Shortcuts ───
test('Ctrl+Z does not crash when undo stack is empty', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('#undo-btn', { timeout: 10000 });
  await page.keyboard.press('Control+z');
  // Should still be fine — no errors
  await expect(page.locator('#root')).toBeVisible();
});

// ─── Toolbar Buttons ───
test('snapshot button exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.mtab', { timeout: 10000 });
  const snapshotBtn = page.locator('.mtab', { hasText: '📊' });
  await expect(snapshotBtn).toBeVisible();
});

test('collapse-all button exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.mtab', { timeout: 10000 });
  const collapseBtn = page.locator('.mtab', { hasText: '⊟' });
  await expect(collapseBtn).toBeVisible();
});

test('history button exists', async ({ page }) => {
  await page.goto('/');
  await page.waitForSelector('.mtab', { timeout: 10000 });
  const historyBtn = page.locator('.mtab', { hasText: '🕐' });
  await expect(historyBtn).toBeVisible();
});

// ─── Responsive / Style ───
test('body has correct font family', async ({ page }) => {
  await page.goto('/');
  const fontFamily = await page.locator('body').evaluate(el => getComputedStyle(el).fontFamily);
  expect(fontFamily).toContain('DM Sans');
});

test('CSS variables are defined', async ({ page }) => {
  await page.goto('/');
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim());
  expect(accent).toBe('#2d6a4f');
});

// ─── Supabase Script ───
test('Supabase JS library is loaded', async ({ page }) => {
  await page.goto('/');
  const hasSupabase = await page.evaluate(() => typeof window.supabase !== 'undefined');
  expect(hasSupabase).toBeTruthy();
});

// ─── No Console Errors on Load ───
test('no JavaScript errors on page load', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('/');
  await page.waitForTimeout(3000); // let app fully initialize
  // Filter out network errors (Supabase calls will fail in test env)
  const realErrors = errors.filter(e => !e.includes('fetch') && !e.includes('network') && !e.includes('Failed to fetch') && !e.includes('supabase'));
  expect(realErrors).toEqual([]);
});
