const trim = (url: string) => url.replace(/\/$/, '');

export const urls = {
  storefront: trim(process.env.E2E_STOREFRONT_URL ?? 'http://localhost:3000'),
  admin: trim(process.env.E2E_ADMIN_URL ?? 'http://localhost:5173'),
  api: trim(process.env.E2E_API_URL ?? 'http://localhost:4000/api/v1'),
  mailpit: trim(process.env.E2E_MAILPIT_URL ?? 'http://localhost:8025'),
};

/** Where global setup leaves the staff credentials for the run (git-ignored). */
export const STAFF_FILE = new URL('../.auth/staff.json', import.meta.url);
