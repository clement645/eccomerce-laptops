import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';
import type { Component } from 'vue';
import type { Permission } from '@repo/shared-types';
import { useAuthStore } from '@/stores/auth';

/** Mounts a view at `path` as a signed-in staff member with the given permissions. */
export async function mountView(
  component: Component,
  path: string,
  routes: RouteRecordRaw[],
  permissions: Permission[],
) {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.user = { id: 'staff', email: 'staff@example.com', name: 'Staff', roles: ['X'], permissions };
  auth.status = 'authenticated';
  const stub = { template: '<p />' };
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [...routes, { path: '/:pathMatch(.*)*', name: 'any', component: stub }],
  });
  for (const name of ['product', 'blog', 'post'])
    if (!router.hasRoute(name)) router.addRoute({ path: `/__${name}/:id?`, name, component: stub });
  await router.push(path);
  const wrapper = mount(component, {
    global: {
      plugins: [
        router,
        [
          VueQueryPlugin,
          { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        ],
      ],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

export const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status }));
