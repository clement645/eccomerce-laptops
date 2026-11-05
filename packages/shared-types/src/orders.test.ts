import { describe, expect, it } from 'vitest';
import { canTransitionFulfillment } from './orders.js';

describe('fulfilment transitions', () => {
  it('allows the forward path', () => {
    expect(canTransitionFulfillment('PENDING', 'PROCESSING')).toBe(true);
    expect(canTransitionFulfillment('PACKED', 'SHIPPED')).toBe(true);
    expect(canTransitionFulfillment('SHIPPED', 'DELIVERED')).toBe(true);
  });

  it('rejects skipping, reversing, and cancelling after shipment', () => {
    expect(canTransitionFulfillment('PENDING', 'SHIPPED')).toBe(false);
    expect(canTransitionFulfillment('DELIVERED', 'PENDING')).toBe(false);
    expect(canTransitionFulfillment('SHIPPED', 'CANCELLED')).toBe(false);
    expect(canTransitionFulfillment('CANCELLED', 'PROCESSING')).toBe(false);
  });
});

describe('KENYA_COUNTIES', async () => {
  const { KENYA_COUNTIES } = await import('./kenya.js');
  it('lists all 47 counties exactly once', () => {
    expect(KENYA_COUNTIES).toHaveLength(47);
    expect(new Set(KENYA_COUNTIES).size).toBe(47);
  });
});
