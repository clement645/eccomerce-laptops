# ADR 0001: pnpm monorepo, built internal packages, pinned toolchain

- Status: accepted
- Date: 2026-10-27

## Context

Three independently deployable apps (Next.js, Vue, NestJS) must share types, validation, and configuration.

## Decision

- Use **pnpm workspaces** without Turborepo or Nx. Root scripts use `pnpm -r` and `--filter`. A build orchestrator can be added later if CI time demands it.
- Shared packages under `packages/*` are compiled with `tsc` to ESM `dist/` with declarations. Apps consume the build output, never raw source. This keeps Nest (native ESM, `nodenext`), Vite, and Next on one well-defined module contract.
- Pin exact versions (`save-exact`). Toolchain: Node 24 LTS, pnpm 12, TypeScript **6.0.x**. TS 7 (the native Go compiler) is not yet supported by the Nest CLI (pins `~6.0.2`) or typescript-eslint (`<6.1`).
- Use one ESLint flat config at the root, with per-app overrides (Next, Vue, Node), plus Prettier.
- Tests: Vitest everywhere (Nest 12's default template uses it). Playwright for E2E from Phase 6.

## Consequences

- Shared packages must be built before apps start. `pnpm dev` does this automatically, and `pnpm dev:packages` runs `tsc --watch`.
- Each app keeps its own `package.json` and can be deployed from its directory (Netlify base dir / Docker build with `pnpm deploy`).
