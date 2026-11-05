import { randomUUID } from 'node:crypto';
import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { ApiEnv } from '@repo/configuration';
import { LoggerModule } from 'nestjs-pino';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { RateLimitModule } from './common/rate-limit/rate-limit.module.js';
import { AppConfigModule } from './config/config.module.js';
import { CacheModule } from './infrastructure/cache/cache.module.js';
import { MediaModule } from './infrastructure/media/media.module.js';
import { RevalidationModule } from './infrastructure/revalidation/revalidation.module.js';
import { MailModule } from './infrastructure/mail/mail.module.js';
import { AccountModule } from './modules/account/account.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { StorageModule } from './infrastructure/storage/storage.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CartModule } from './modules/cart/cart.module.js';
import { CatalogModule } from './modules/catalog/catalog.module.js';
import { CheckoutModule } from './modules/checkout/checkout.module.js';
import { BlogModule } from './modules/blog/blog.module.js';
import { ContactModule } from './modules/contact/contact.module.js';
import { CouponsModule } from './modules/coupons/coupons.module.js';
import { NewsletterModule } from './modules/newsletter/newsletter.module.js';
import { ReviewsModule } from './modules/reviews/reviews.module.js';
import { OrdersCoreModule } from './modules/orders/orders-core.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsCoreModule } from './modules/payments/payments-core.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { StorefrontModule } from './modules/storefront/storefront.module.js';

const CALLBACK_URL = /(\/payments\/mpesa\/callback\/)[^/?#]+/;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

@Module({})
export class AppModule {
  static forRoot(env: ApiEnv): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(env),
        LoggerModule.forRoot({
          pinoHttp: {
            level: env.LOG_LEVEL,
            // Accept a well-formed upstream request ID (e.g. from the load balancer), otherwise generate one.
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
                  ? incoming
                  : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
                '*.password',
                '*.passwordHash',
                '*.token',
                '*.phone',
              ],
              censor: '[REDACTED]',
            },
            serializers: {
              // The M-Pesa callback URL carries a secret path segment; keep it out of logs.
              req: (req: { url?: string; params?: unknown }) => {
                if (req.url && CALLBACK_URL.test(req.url)) {
                  req.url = req.url.replace(CALLBACK_URL, '$1[REDACTED]');
                  req.params = {};
                }
                return req;
              },
            },
            autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
            ...(env.NODE_ENV === 'development'
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        }),
        PrismaModule,
        RedisModule,
        CacheModule,
        MediaModule,
        RevalidationModule,
        MailModule,
        AuditModule,
        AuthModule,
        RateLimitModule,
        HealthModule,
        SettingsModule,
        StorefrontModule,
        CatalogModule,
        AccountModule,
        OrdersCoreModule,
        PaymentsCoreModule,
        CartModule,
        CouponsModule,
        CheckoutModule,
        OrdersModule,
        PaymentsModule,
        StorageModule,
        AdminModule,
        BlogModule,
        ReviewsModule,
        NewsletterModule,
        ContactModule,
      ],
      providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
    };
  }
}
