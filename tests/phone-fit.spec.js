// Every tab must fit her phone (412px wide): nothing may stick out past the
// right edge, where the page hides it (no sideways scroll). A live check on
// Nov 19 2026 found the Admin tab cut off: the sort-button row (Grouped · Added
// · A→Z · Z→A · High · Low) didn't wrap, so group totals read "₪9…".
const { test, expect } = require('./fixtures');

const TABS = ['budget', 'admin', 'travel', 'charity', 'year', 'biz', 'cash', 'analyze'];

for (const tab of TABS) {
  test(`phone fit: ${tab} tab has nothing past 412px`, async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-19T12:00:00+02:00'));
    await page.setViewportSize({ width: 412, height: 892 });
    await page.goto('/');
    await page.waitForFunction(() => !document.querySelector('.loading'), null, {
      timeout: 30000,
    });
    await page.evaluate((t) => window.switchTab(t), tab);
    await page.waitForFunction(() => !window.state.loading, null, { timeout: 30000 });
    await page.waitForTimeout(400);
    const offenders = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const out = [];
      document.querySelectorAll('#root *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.position === 'fixed') return;
        // Inside a box that scrolls sideways on purpose → fine.
        let p = el.parentElement;
        while (p && p.id !== 'root') {
          const ox = getComputedStyle(p).overflowX;
          if (ox === 'auto' || ox === 'scroll') return;
          p = p.parentElement;
        }
        if (r.right > W + 1) {
          const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
          out.push(
            `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} right=${Math.round(r.right)} "${txt}"`,
          );
        }
      });
      return out;
    });
    if (process.env.FIT_SHOT)
      await page.screenshot({ path: `${process.env.FIT_SHOT}-${tab}.png`, fullPage: true });
    expect(offenders.slice(0, 15), offenders.length + ' elements past the edge').toEqual([]);
  });
}
