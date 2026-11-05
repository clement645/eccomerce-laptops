/** BullMQ connection options from a redis:// or rediss:// URL. */
export function bullConnection(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    tls: parsed.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ workers: blocking commands must not time out.
    maxRetriesPerRequest: null,
  };
}
