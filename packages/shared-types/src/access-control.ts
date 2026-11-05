/** Permissions are enforced by the API. The admin UI only uses them to hide what a user cannot do. */
export const PERMISSIONS = [
  'dashboard:read',
  'products:read',
  'products:write',
  'products:publish',
  'categories:write',
  'brands:write',
  'inventory:read',
  'inventory:adjust',
  'orders:read',
  'orders:update',
  'orders:cancel',
  'orders:refund',
  'customers:read',
  'customers:manage',
  'content:write',
  'blog:write',
  'blog:publish',
  'reviews:moderate',
  'coupons:write',
  'settings:write',
  'staff:manage',
  'audit:read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const AdminRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  STORE_MANAGER: 'STORE_MANAGER',
  INVENTORY_MANAGER: 'INVENTORY_MANAGER',
  SALES_MANAGER: 'SALES_MANAGER',
  CUSTOMER_SUPPORT: 'CUSTOMER_SUPPORT',
  CONTENT_EDITOR: 'CONTENT_EDITOR',
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];

/** Default role grants. Seeded into the database; the database is authoritative at runtime. */
export const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<AdminRole, readonly Permission[]>> = {
  SUPER_ADMIN: PERMISSIONS,
  STORE_MANAGER: PERMISSIONS.filter((p) => p !== 'staff:manage' && p !== 'audit:read'),
  INVENTORY_MANAGER: [
    'dashboard:read',
    'products:read',
    'inventory:read',
    'inventory:adjust',
    'orders:read',
  ],
  SALES_MANAGER: [
    'dashboard:read',
    'products:read',
    'orders:read',
    'orders:update',
    'orders:cancel',
    'customers:read',
    'coupons:write',
  ],
  CUSTOMER_SUPPORT: ['orders:read', 'orders:update', 'customers:read', 'reviews:moderate'],
  CONTENT_EDITOR: [
    'products:read',
    'content:write',
    'blog:write',
    'blog:publish',
    'reviews:moderate',
  ],
};
