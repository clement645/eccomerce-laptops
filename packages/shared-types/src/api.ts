/** Standard error envelope returned by every API error response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export type DependencyStatus = 'up' | 'down' | 'not_configured';

/**
 * ok: everything is up. degraded: Redis is down (cache and rate limits fail open; orders still work).
 * down: the database is unreachable (HTTP 503).
 */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
  checks: Record<string, DependencyStatus>;
  /** Background work in this process (email consumer and maintenance sweeps). */
  jobs?: BackgroundJobsHealth;
}

export interface BackgroundJobsHealth {
  /** inline: run by the API itself; external: by a separate worker; disabled: not run. */
  mode: 'inline' | 'external' | 'disabled';
  emailConsumer: 'running' | 'off';
  /** The pass run at startup (e.g. after Render wakes the service). */
  catchUp: { at: string; durationMs: number; finished: boolean } | null;
  sweeps: Record<string, { lastRunAt: string; durationMs: number; ok: boolean; detail?: string }>;
}

/** Validation error details returned with code VALIDATION_FAILED. */
export interface ValidationIssue {
  path: string;
  message: string;
  code: string;
}

export interface TrustIndicator {
  icon: string;
  title: string;
  description: string;
}

/** Store settings that are safe to expose publicly (GET /settings/public). */
export interface PublicStoreSettings {
  profile: { name: string; tagline: string | null; currency: string; locale: string } | null;
  contact: {
    phone: string | null;
    email: string | null;
    whatsappNumber: string | null;
    address: string | null;
    mapUrl: string | null;
    openingHours: string | null;
  } | null;
  social: Record<string, string | null> | null;
  announcement: { enabled: boolean; messages: string[]; href: string | null } | null;
  trustIndicators: TrustIndicator[];
  whyChooseUs: TrustIndicator[];
  pricesIncludeVat: boolean;
}
