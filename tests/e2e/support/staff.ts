import { readFileSync, writeFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { STAFF_FILE, urls } from './env';
import { freshTotp } from './totp';

interface StaffCredentials {
  email: string;
  password: string;
  totpSecret?: string;
  lastCode?: string;
}

/** Signs the staff account in, enrolling two-factor the first time (as a person would with an app). */
export async function signInStaff(page: Page): Promise<void> {
  const staff = JSON.parse(readFileSync(STAFF_FILE, 'utf8')) as StaffCredentials;
  await page.goto(`${urls.admin}/login`);
  await page.getByLabel('Email').fill(staff.email);
  await page.getByLabel('Password').fill(staff.password);
  await page.getByRole('button', { name: 'Continue' }).click();
  const setup = page.getByTestId('mfa-secret');
  const verify = page.getByRole('heading', { name: 'Enter your code' });
  await expect(setup.or(verify)).toBeVisible();
  if (await setup.isVisible()) staff.totpSecret = (await setup.textContent())!.replace(/\s/g, '');
  if (!staff.totpSecret)
    throw new Error('Staff account already enrolled but its secret is unknown; rerun the suite.');
  const code = await freshTotp(staff.totpSecret, staff.lastCode);
  await page.getByLabel('Authentication code').fill(code);
  await page.getByRole('button', { name: /Verify/ }).click();
  await expect(page).toHaveURL((u) => u.pathname === '/');
  writeFileSync(STAFF_FILE, JSON.stringify({ ...staff, lastCode: code }));
}
