import { expect, test } from '@playwright/test';
import { expectAccessible } from '../support/a11y';
import { urls } from '../support/env';
import { linkFrom, waitForEmail } from '../support/mailpit';
import { signInStaff } from '../support/staff';

interface ProductCard {
  slug: string;
  name: string;
}

/**
 * The whole store, end to end, through the real UI:
 * a shopper registers and confirms their email, finds a product, buys it with a coupon and
 * (simulated) M-Pesa; staff fulfil the order; the shopper sees it delivered and reviews the
 * product; staff publish the review, and it appears on the product page.
 */
test('shopper buys with a coupon, staff fulfil, review is published', async ({ browser }) => {
  const run = Date.now().toString(36);
  const shopperEmail = `e2e-shopper-${run}@example.com`;
  const password = `Shop-${run}-Long-Passphrase`;
  const couponCode = `E2E${run}`.toUpperCase();
  const reviewText = `Bought this for work (${run}). Fast, quiet and the battery lasts all day.`;

  const list = (await (
    await fetch(`${urls.api}/catalog/products?inStock=true&sort=newest&pageSize=24`)
  ).json()) as {
    items: ProductCard[];
  };
  const product = list.items.find((p) => !p.slug.startsWith('e2e-')) ?? list.items[0];
  expect(product, 'Seed data must include an in-stock product').toBeTruthy();

  const staffContext = await browser.newContext();
  const staff = await staffContext.newPage();
  const shopperContext = await browser.newContext();
  const shopper = await shopperContext.newPage();
  let orderNumber = '';

  await test.step('staff sign in with two-factor and create a coupon', async () => {
    await signInStaff(staff);
    await expect(staff.getByText('Daily revenue')).toBeVisible();
    await expectAccessible(staff, 'admin dashboard');
    await staff.goto(`${urls.admin}/coupons`);
    await staff.getByRole('button', { name: 'New coupon' }).click();
    const dialog = staff.getByRole('dialog', { name: 'New coupon' });
    await dialog.getByLabel('Code').fill(couponCode);
    await dialog.getByLabel('Description (shown at checkout)').fill('E2E 10% off');
    await dialog.getByLabel('Percent off').fill('10');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(staff.getByRole('cell', { name: couponCode })).toBeVisible();
  });

  await test.step('shopper registers and confirms their email', async () => {
    await shopper.goto(`${urls.storefront}/account/register`);
    await shopper.locator('main').getByLabel('First name').fill('Njeri');
    await shopper.locator('main').getByLabel('Last name').fill('Wambui');
    await shopper.locator('main').getByLabel('Email address').fill(shopperEmail);
    await shopper.locator('main').getByLabel('Password', { exact: true }).fill(password);
    await shopper.getByRole('button', { name: 'Create account' }).click();
    await expect(shopper.getByRole('heading', { name: 'Check your inbox' })).toBeVisible();
    const email = await waitForEmail(shopperEmail, 'Confirm your email address');
    await shopper.goto(linkFrom(email, '/account/verify-email?token='));
    await expect(shopper.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
    await shopper.getByRole('link', { name: 'Sign in' }).last().click();
    await shopper.locator('main').getByLabel('Email address').fill(shopperEmail);
    await shopper.locator('main').getByLabel('Password', { exact: true }).fill(password);
    await shopper.getByRole('button', { name: 'Sign in' }).click();
    await expect(shopper).toHaveURL(/\/account$/);
  });

  await test.step('shopper finds the product and adds it to the cart', async () => {
    await shopper.goto(urls.storefront);
    const search = shopper.getByRole('combobox', { name: 'Search products' }).first();
    await search.fill(product!.name.split(' ').slice(0, 2).join(' '));
    await search.press('Enter');
    await expect(shopper).toHaveURL(/\/search\?q=/);
    await shopper.getByRole('link', { name: product!.name }).first().click();
    await expect(shopper.getByRole('heading', { level: 1, name: product!.name })).toBeVisible();
    await expectAccessible(shopper, 'product page');
    await shopper.getByRole('button', { name: 'Add to Cart' }).first().click();
    await expect(shopper.getByRole('dialog')).toContainText(product!.name);
    await shopper.goto(`${urls.storefront}/checkout`);
  });

  await test.step('shopper checks out with the coupon and simulated M-Pesa', async () => {
    await shopper.locator('main').getByLabel('Mobile number').fill('0712 345 678');
    await shopper.getByRole('button', { name: 'Continue to delivery address' }).click();
    await shopper.locator('main').getByLabel('Recipient name').fill('Njeri Wambui');
    await shopper.locator('main').getByLabel('Recipient mobile number').fill('0712 345 678');
    await shopper.locator('main').getByLabel('County').selectOption('Nairobi');
    await shopper.locator('main').getByLabel('Town / area').fill('Westlands');
    await shopper.locator('main').getByLabel('Street / road').fill('Waiyaki Way');
    await shopper.getByRole('button', { name: 'Continue to delivery options' }).click();
    await shopper.locator('input[name="shipping"]').first().check();
    await shopper.getByRole('button', { name: 'Continue to payment' }).click();
    await shopper.getByRole('radio', { name: /M-Pesa/ }).check();
    await shopper.getByRole('button', { name: 'Review order' }).click();

    await shopper.locator('main').getByLabel('Discount code').fill(couponCode.toLowerCase());
    await shopper.getByRole('button', { name: 'Apply' }).click();
    await expect(shopper.getByText(`${couponCode} applied`)).toBeVisible();
    await expect(shopper.getByText(`Discount (${couponCode})`)).toBeVisible();
    await expectAccessible(shopper, 'checkout review');

    await shopper.getByRole('button', { name: /Place order/ }).click();
    await expect(shopper).toHaveURL(/\/checkout\/confirmation\?token=/);
    orderNumber = (await shopper
      .getByText(/^EL-\d{4}-\d{6}$/)
      .first()
      .textContent())!.trim();
    await shopper.getByRole('button', { name: 'Simulate successful payment' }).click();
    await expect(shopper.getByText('Payment received. Thank you!')).toBeVisible();
    await waitForEmail(shopperEmail, `Order ${orderNumber} received`);
  });

  await test.step('staff fulfil the order through to delivery', async () => {
    await staff.goto(`${urls.admin}/orders?q=${orderNumber}`);
    await staff.getByRole('link', { name: orderNumber }).click();
    await expect(staff.getByRole('heading', { name: orderNumber })).toBeVisible();
    await expectAccessible(staff, 'admin order page');
    await staff.getByRole('button', { name: 'Start processing' }).click();
    await staff.getByRole('button', { name: 'Mark as packed' }).click();
    await staff.getByRole('button', { name: 'Mark as shipped…' }).click();
    const dialog = staff.getByRole('dialog', { name: 'Ship order' });
    await dialog.getByLabel('Courier').fill('G4S');
    await dialog.getByLabel('Tracking number (optional)').fill(`G4S${run}`.toUpperCase());
    await dialog.getByRole('button', { name: 'Mark as shipped' }).click();
    await staff.getByRole('button', { name: 'Mark as delivered' }).click();
    await expect(staff.getByRole('button', { name: 'Mark as delivered' })).toHaveCount(0);
    await waitForEmail(shopperEmail, `Order ${orderNumber} was delivered`);
  });

  await test.step('shopper sees the delivery and reviews the product', async () => {
    await shopper.goto(`${urls.storefront}/account/orders`);
    await expect(shopper.getByText(orderNumber)).toBeVisible();
    await shopper.goto(`${urls.storefront}/products/${product!.slug}#reviews`);
    await shopper.getByRole('button', { name: 'Write a review' }).click();
    await shopper.getByText('5 stars (Excellent)').click({ force: true });
    await shopper.locator('main').getByLabel('Title (optional)').fill('Great machine');
    await shopper.locator('main').getByLabel('Your review').fill(reviewText);
    await shopper.getByRole('button', { name: 'Submit review' }).click();
    await expect(shopper.getByText(/will appear here once our team has checked it/)).toBeVisible();
  });

  await test.step('staff publish the review and it appears in the store', async () => {
    await staff.goto(`${urls.admin}/reviews`);
    const card = staff.getByRole('listitem').filter({ hasText: reviewText });
    await card.getByRole('button', { name: 'Publish' }).click();
    await expect(card).toHaveCount(0);
    await expect(async () => {
      await shopper.reload();
      await expect(shopper.getByText(reviewText)).toBeVisible({ timeout: 2000 });
    }).toPass({ timeout: 60_000 });
    await expect(shopper.getByText('Njeri W.').first()).toBeVisible();
  });

  await staffContext.close();
  await shopperContext.close();
});
