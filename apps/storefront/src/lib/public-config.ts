/**
 * Public configuration for client components. Read literally so Next.js inlines the values;
 * validated on the server by lib/env.ts at startup.
 */
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
