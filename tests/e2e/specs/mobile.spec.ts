import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { urls } from '../support/env';

/** Phone-sized checks: nothing scrolls sideways, and the menu and cart work by touch. */
test.describe('mobile', () => {
  const overflow = (page: import('@playwright/test').Page) =>
    page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  for (const path of ['/', '/shop', '/cart', '/checkout', '/account/login', '/blog', '/contact']) {
    test(`no sideways scrolling on ${path}`, async ({ page }) => {
      await page.goto(`${urls.storefront}${path}`, { waitUntil: 'networkidle' });
      expect(await overflow(page)).toBeLessThanOrEqual(0);
    });
  }

  test('menu opens and a product can be added to the cart', async ({ page }) => {
    await page.goto(urls.storefront, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /open (main )?menu/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expectAccessible(page, 'mobile menu');
    await page.keyboard.press('Escape');

    const products = (await (
      await fetch(`${urls.api}/catalog/products?inStock=true&pageSize=1`)
    ).json()) as {
      items: { slug: string; name: string }[];
    };
    await page.goto(`${urls.storefront}/products/${products.items[0]!.slug}`, {
      waitUntil: 'networkidle',
    });
    await page.getByRole('button', { name: 'Add to Cart' }).first().click();
    await expect(page.getByRole('dialog')).toContainText(products.items[0]!.name);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });

  test('admin works on a phone', async ({ page }) => {
    await page.goto(`${urls.admin}/login`);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
