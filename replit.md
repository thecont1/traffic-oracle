# Workspace

## Overview

Bun workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: Bun workspaces
- **Node.js version**: 24
- **Package manager**: Bun
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v3`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (ESM bundle)

## Key Commands

- `bun run typecheck` — full typecheck across all packages
- `bun run build` — typecheck + build all packages
- `bun run --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `bun run --filter @workspace/db run push` — push DB schema changes (dev only)
- `bun run --filter @workspace/api-server run dev` — run API server locally