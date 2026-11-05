import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** Fails on serious or critical WCAG 2.1 A/AA problems. Minor findings are reported, not fatal. */
export async function expectAccessible(page: Page, label: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  const summary = blocking.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join('\n    ')}`,
  );
  expect(summary, `Accessibility problems on ${label}`).toEqual([]);
}
