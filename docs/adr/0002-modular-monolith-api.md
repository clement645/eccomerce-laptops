# ADR 0002: NestJS modular monolith with a separate worker process

- Status: accepted
- Date: 2026-10-27

## Decision

One NestJS codebase with domain modules. Two entry points from the same image:

- `main.ts`: HTTP API (`/api/v1`)
- `worker.ts`: BullMQ consumers (email, payment reconciliation, reservation expiry, image processing)

PostgreSQL (Neon) is the only source of truth. Redis holds cache, rate limits, ephemeral checkout state, locks, and queues. Losing Redis must never lose an order or payment.

## Why

Microservices would add network failure modes and distributed transactions for no benefit at this scale. Inventory and payment correctness depend on single-database ACID transactions.
