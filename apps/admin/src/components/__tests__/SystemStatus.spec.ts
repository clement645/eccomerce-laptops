import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SystemStatus from '../SystemStatus.vue';

function mountWithQuery() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return mount(SystemStatus, { global: { plugins: [[VueQueryPlugin, { queryClient }]] } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SystemStatus', () => {
  it('shows API status and dependency checks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status: 'ok',
            service: 'api',
            version: '0.1.0',
            uptimeSeconds: 1,
            timestamp: new Date().toISOString(),
            checks: { database: 'not_configured', redis: 'up' },
          }),
          { status: 200 },
        ),
      ),
    );
    const wrapper = mountWithQuery();
    expect(wrapper.text()).toContain('Checking API');
    await flushPromises();
    expect(wrapper.text()).toContain('API ok · v0.1.0');
    expect(wrapper.text()).toContain('not configured');
  });

  it('shows an error when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const wrapper = mountWithQuery();
    await flushPromises();
    expect(wrapper.text()).toContain('API unreachable');
  });
});
