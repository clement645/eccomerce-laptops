-- Runs once when the local volume is first created.
-- ecommerce        : local development database
-- ecommerce_shadow : Prisma shadow database used by `prisma migrate dev`
-- ecommerce_test   : integration tests (migrated with `prisma migrate deploy`)
CREATE DATABASE ecommerce_shadow;
CREATE DATABASE ecommerce_test;
