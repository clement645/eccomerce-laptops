import type { BlogService } from '../modules/blog/blog.service.js';
import type { PaymentSweepService } from '../modules/payments/payment-sweep.service.js';
import { testEnv } from '../../test/support/test-env.js';
import { JobsStatusService } from './jobs-status.service.js';
import { MaintenanceScheduler } from './maintenance.scheduler.js';

function setup(paymentsSweep: () => Promise<unknown>) {
  const calls: string[] = [];
  const payments = {
    sweep: async () => {
      calls.push('payments');
      await paymentsSweep();
      return { checked: 0, settled: 0, released: 0 };
    },
  } as unknown as PaymentSweepService;
  const blog = {
    publishDue: async () => {
      calls.push('posts');
      return 0;
    },
  } as unknown as BlogService;
  const status = new JobsStatusService(testEnv({ BACKGROUND_JOBS: 'inline' }));
  return { scheduler: new MaintenanceScheduler(payments, blog, status), calls, status };
}

describe('MaintenanceScheduler', () => {
  it('catches up on start: payments (with holds) before posts, then reports it', async () => {
    const { scheduler, calls, status } = setup(() => Promise.resolve());
    await scheduler.onApplicationBootstrap();
    await scheduler.onModuleDestroy();
    expect(calls).toEqual(['payments', 'posts']);
    expect(status.snapshot()).toMatchObject({
      mode: 'inline',
      catchUp: { finished: true },
      sweeps: { 'payments-and-holds': { ok: true }, 'scheduled-posts': { ok: true } },
    });
  });

  it('never runs a sweep twice at once in this process', async () => {
    let finish: (() => void) | undefined;
    const { scheduler, calls } = setup(() =>
      finish ? Promise.resolve() : new Promise<void>((r) => (finish = r)),
    );
    const sweep = scheduler.sweeps[0]!;
    const first = scheduler.runOnce(sweep);
    const second = scheduler.runOnce(sweep);
    expect(calls).toEqual(['payments']);
    finish!();
    await Promise.all([first, second]);
    await scheduler.runOnce(sweep);
    expect(calls).toEqual(['payments', 'payments']);
  });

  it('records a failure without throwing', async () => {
    const { scheduler, status } = setup(() => Promise.reject(new Error('database down')));
    await scheduler.runOnce(scheduler.sweeps[0]!);
    expect(status.snapshot().sweeps['payments-and-holds']).toMatchObject({
      ok: false,
      detail: 'database down',
    });
  });

  it('on shutdown waits for a running sweep and starts no new ones', async () => {
    let finish!: () => void;
    let done = false;
    const { scheduler, calls } = setup(
      () =>
        new Promise<void>((r) => {
          finish = () => {
            done = true;
            r();
          };
        }),
    );
    void scheduler.runOnce(scheduler.sweeps[0]!);
    const stopping = scheduler.onModuleDestroy();
    setTimeout(() => finish(), 50);
    await stopping;
    expect(done).toBe(true);
    await scheduler.runOnce(scheduler.sweeps[1]!);
    expect(calls).toEqual(['payments']);
  });
});
