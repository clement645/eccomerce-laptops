import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { BlogService } from '../modules/blog/blog.service.js';
import { PaymentSweepService } from '../modules/payments/payment-sweep.service.js';
import { JobsStatusService } from './jobs-status.service.js';

interface Sweep {
  name: string;
  everyMs: number;
  run: () => Promise<string | null>;
}

/** Longest the first catch-up may delay startup; whatever is left continues in the background. */
const CATCH_UP_BUDGET_MS = 20_000;
/** How long shutdown waits for a sweep already running. */
const SHUTDOWN_GRACE_MS = 10_000;

/**
 * Recurring maintenance, run inside the API process (or the optional worker). These sweeps read and
 * write Postgres only, where all their state lives (holds with expiry times, prompts with their next
 * check time, posts with a publish time). So they need no queue: they cost no Redis commands, and
 * nothing is lost while the process sleeps. Missed work is simply found by the next run.
 *
 * - On start (for example after Render wakes the service) one catch-up pass runs before the API
 *   accepts traffic: payments first, then holds, then posts.
 * - Each sweep never overlaps itself in this process. Across processes (a deploy briefly runs two)
 *   the database updates are conditional, so a second run changes nothing.
 * - On shutdown the timers stop and a running sweep is allowed to finish.
 */
@Injectable()
export class MaintenanceScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceScheduler.name);
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly running = new Map<string, Promise<void>>();
  private stopping = false;
  readonly sweeps: Sweep[];

  constructor(
    private readonly payments: PaymentSweepService,
    private readonly blog: BlogService,
    private readonly status: JobsStatusService,
  ) {
    this.sweeps = [
      {
        name: 'payments-and-holds',
        everyMs: 30_000,
        run: async () => {
          const r = await this.payments.sweep();
          return r.checked || r.released
            ? `checked ${r.checked} prompt(s), settled ${r.settled}, released ${r.released} order(s)`
            : null;
        },
      },
      {
        name: 'scheduled-posts',
        everyMs: 5 * 60_000,
        run: async () => {
          const published = await this.blog.publishDue();
          return published ? `published ${published} post(s)` : null;
        },
      },
    ];
  }

  async onApplicationBootstrap(): Promise<void> {
    const started = Date.now();
    const catchUp = (async () => {
      for (const sweep of this.sweeps) await this.runOnce(sweep);
    })();
    let timer: NodeJS.Timeout | undefined;
    const finished = await Promise.race([
      catchUp.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), CATCH_UP_BUDGET_MS);
      }),
    ]);
    clearTimeout(timer);
    this.status.catchUp = {
      at: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      finished,
    };
    if (!finished) this.logger.warn('Catch-up is taking long; continuing in the background');
    for (const sweep of this.sweeps) {
      this.timers.push(setInterval(() => void this.runOnce(sweep), sweep.everyMs));
    }
    this.logger.log('Maintenance sweeps scheduled in this process');
  }

  /** Runs a sweep unless it is already running here. Never throws. */
  runOnce(sweep: Sweep): Promise<void> {
    if (this.stopping) return Promise.resolve();
    const inFlight = this.running.get(sweep.name);
    if (inFlight) return inFlight;
    const startedAt = new Date();
    const job = sweep
      .run()
      .then((detail) => {
        this.status.record(sweep.name, true, startedAt, detail ?? undefined);
        if (detail) this.logger.log(`${sweep.name}: ${detail}`);
      })
      .catch((error: unknown) => {
        this.status.record(sweep.name, false, startedAt, (error as Error).message);
        this.logger.error(`${sweep.name} failed: ${(error as Error).message}`);
      })
      .finally(() => this.running.delete(sweep.name));
    this.running.set(sweep.name, job);
    return job;
  }

  /**
   * Nest destroys this module before Prisma and Redis (dependents first), so a running sweep still
   * has its connections while it finishes.
   */
  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    for (const t of this.timers) clearInterval(t);
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...this.running.values()]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, SHUTDOWN_GRACE_MS);
      }),
    ]);
    clearTimeout(timer);
  }
}
