import type { Permission } from '@repo/shared-types';

export type Audience = 'storefront' | 'admin';

/** Attached to the request by AuthGuard. */
export interface AuthContext {
  userId: string;
  sessionId: string;
  audience: Audience;
  /** Admin only: effective permissions from the user's roles. */
  permissions: Permission[];
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}
