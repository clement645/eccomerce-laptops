import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { urls } from '../support/env';

/** Public pages, checked with axe against WCAG 2.1 A and AA (serious and critical issues fail). */
test.describe('accessibility', () => {
  let productSlug = '';
  let postSlug = '';

  test.beforeAll(async () => {
    const products = (await (await fetch(`${urls.api}/catalog/products?pageSize=1`)).json()) as {
      items: { slug: string }[];
    };
    productSlug = products.items[0]!.slug;
    const posts = (await (await fetch(`${urls.api}/blog/posts?pageSize=1`)).json()) as {
      items: { slug: string }[];
    };
    postSlug = posts.items[0]?.slug ?? '';
  });

  const pages: [string, () => string][] = [
    ['home', () => '/'],
    ['shop', () => '/shop'],
    ['filtered listing', () => '/shop?inStock=true&sort=price_asc'],
    ['search', () => '/search?q=laptop'],
    ['product', () => `/products/${productSlug}`],
    ['brands', () => '/brands'],
    ['deals', () => '/deals'],
    ['cart', () => '/cart'],
    ['sign in', () => '/account/login'],
    ['register', () => '/account/register'],
    ['forgot password', () => '/account/forgot-password'],
    ['track order', () => '/track-order'],
    ['blog', () => '/blog'],
    ['blog post', () => (postSlug ? `/blog/${postSlug}` : '/blog')],
    ['contact', () => '/contact'],
  ];

  for (const [name, path] of pages) {
    test(`${name} page`, async ({ page }) => {
      await page.goto(`${urls.storefront}${path()}`, { waitUntil: 'networkidle' });
      await expect(page.locator('main')).toBeVisible();
      await expectAccessible(page, name);
    });
  }

  test('admin sign-in page', async ({ page }) => {
    await page.goto(`${urls.admin}/login`);
    await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible();
    await expectAccessible(page, 'admin sign in');
  });

  test('keyboard users can skip to content and reach the cart', async ({ page }) => {
    await page.goto(urls.storefront, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /skip to (main )?content/i });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });
});
