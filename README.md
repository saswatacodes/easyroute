# EasyRoute

Corporate employee cab-booking platform for corporate. Three personas — **Employees** (book rides), **Drivers** (fulfill trips), and **Admins** (manage the system).

## Stack

| Layer | Tech |
|---|---|
| Monorepo | Turborepo + Bun |
| Mobile | React Native 0.81 / Expo SDK 54 / Expo Router 6 |
| Backend | Hono + Bun |
| Database | PostgreSQL + PostGIS via Drizzle ORM |
| Admin Web | Vite + React + shadcn/ui *(in progress)* |
| Shared | TypeScript types + Zod schemas |

## Structure

```
apps/
├── server/       # Hono API server (DB schema, migrations, endpoints)
└── web/          # Admin dashboard (scaffolded)
packages/
└── shared/       # Shared types and validation
```

## Getting Started

```bash
bun install
```

### Server

```bash
cd apps/server
cp .env.example .env    # configure DATABASE_URL
bun run db:migrate
bun run db:seed
bun dev
```
