import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { Permission } from '@repo/shared-types';
import AdminLayout from '@/layouts/AdminLayout.vue';
import { useAuthStore } from '@/stores/auth';

declare module 'vue-router' {
  interface RouteMeta {
    title?: string;
    /** UI-only hint. The API enforces permissions on every request. */
    permission?: Permission;
    /** Reachable without a session (sign-in, invite links). */
    public?: boolean;
  }
}

const page = (
  path: string,
  name: string,
  component: RouteRecordRaw['component'],
  title: string,
  permission: Permission,
): RouteRecordRaw => ({ path, name, component: component!, meta: { title, permission } });

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: AdminLayout,
    children: [
      page(
        '',
        'dashboard',
        () => import('@/views/DashboardView.vue'),
        'Dashboard',
        'dashboard:read',
      ),
      page(
        'orders',
        'orders',
        () => import('@/views/orders/OrdersView.vue'),
        'Orders',
        'orders:read',
      ),
      page(
        'orders/:orderNumber',
        'order',
        () => import('@/views/orders/OrderDetailView.vue'),
        'Order',
        'orders:read',
      ),
      page(
        'products',
        'products',
        () => import('@/views/products/ProductsView.vue'),
        'Products',
        'products:read',
      ),
      page(
        'products/new',
        'product-new',
        () => import('@/views/products/ProductEditorView.vue'),
        'New product',
        'products:write',
      ),
      page(
        'products/:id',
        'product',
        () => import('@/views/products/ProductEditorView.vue'),
        'Product',
        'products:read',
      ),
      page(
        'categories',
        'categories',
        () => import('@/views/catalog/CategoriesView.vue'),
        'Categories',
        'products:read',
      ),
      page(
        'brands',
        'brands',
        () => import('@/views/catalog/BrandsView.vue'),
        'Brands',
        'products:read',
      ),
      page(
        'inventory',
        'inventory',
        () => import('@/views/InventoryView.vue'),
        'Inventory',
        'inventory:read',
      ),
      page(
        'customers',
        'customers',
        () => import('@/views/customers/CustomersView.vue'),
        'Customers',
        'customers:read',
      ),
      page(
        'customers/:id',
        'customer',
        () => import('@/views/customers/CustomerDetailView.vue'),
        'Customer',
        'customers:read',
      ),
      page(
        'banners',
        'banners',
        () => import('@/views/content/BannersView.vue'),
        'Banners',
        'content:write',
      ),
      page(
        'homepage',
        'homepage',
        () => import('@/views/content/HomepageView.vue'),
        'Homepage',
        'content:write',
      ),
      page(
        'staff',
        'staff',
        () => import('@/views/staff/StaffView.vue'),
        'Staff & roles',
        'staff:manage',
      ),
      page('audit', 'audit', () => import('@/views/AuditView.vue'), 'Audit log', 'audit:read'),
      page(
        'reviews',
        'reviews',
        () => import('@/views/engagement/ReviewsView.vue'),
        'Reviews',
        'reviews:moderate',
      ),
      page(
        'messages',
        'messages',
        () => import('@/views/engagement/MessagesView.vue'),
        'Messages',
        'customers:read',
      ),
      page(
        'coupons',
        'coupons',
        () => import('@/views/engagement/CouponsView.vue'),
        'Coupons',
        'coupons:write',
      ),
      page(
        'newsletter',
        'newsletter',
        () => import('@/views/engagement/NewsletterView.vue'),
        'Newsletter',
        'customers:read',
      ),
      page('blog', 'blog', () => import('@/views/blog/BlogView.vue'), 'Blog', 'blog:write'),
      page(
        'blog/new',
        'post-new',
        () => import('@/views/blog/PostEditorView.vue'),
        'New post',
        'blog:write',
      ),
      page(
        'blog/:id',
        'post',
        () => import('@/views/blog/PostEditorView.vue'),
        'Post',
        'blog:write',
      ),
      page(
        'settings',
        'settings',
        () => import('@/views/SettingsView.vue'),
        'Store settings',
        'settings:write',
      ),
      {
        path: 'no-access',
        name: 'no-access',
        component: () => import('@/views/NoAccessView.vue'),
        meta: { title: 'No access' },
      },
    ],
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { title: 'Sign in', public: true },
  },
  {
    path: '/set-password',
    name: 'set-password',
    component: () => import('@/views/SetPasswordView.vue'),
    meta: { title: 'Set your password', public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/views/NotFoundView.vue'),
    meta: { title: 'Not found' },
  },
];

export const router = createRouter({ history: createWebHistory(import.meta.env.BASE_URL), routes });

/** Top-level pages in menu order; the first one a staff member may open is their home. */
export const HOME_ORDER = [
  'dashboard',
  'orders',
  'products',
  'inventory',
  'customers',
  'banners',
  'staff',
  'audit',
];

// Every non-public route needs a staff session; the API still checks each request.
router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const auth = useAuthStore();
  if (!(await auth.ensureSession()))
    return { name: 'login', query: to.fullPath !== '/' ? { next: to.fullPath } : {} };
  if (to.meta.permission && !auth.can(to.meta.permission)) {
    const home = HOME_ORDER.map((name) => routes[0]!.children!.find((r) => r.name === name)).find(
      (r) => r?.meta?.permission && auth.can(r.meta.permission),
    );
    if (to.name === 'dashboard' && home) return { name: home.name as string };
    return { name: 'no-access' };
  }
  return true;
});

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Admin` : 'Admin';
});
