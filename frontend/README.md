# DeerFlow Frontend

Like the original DeerFlow 1.0, we would love to give the community a minimalistic and easy-to-use web interface with a more modern and flexible architecture.

## Tech Stack

- **Framework**: [Next.js 16](https://nextjs.org/) with [App Router](https://nextjs.org/docs/app)
- **UI**: [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/), [Shadcn UI](https://ui.shadcn.com/), [MagicUI](https://magicui.design/) and [React Bits](https://reactbits.dev/)
- **AI Integration**: [LangGraph SDK](https://www.npmjs.com/package/@langchain/langgraph-sdk) and [Vercel AI Elements](https://vercel.com/ai-sdk/ai-elements)

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10.26.2+

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Development

```bash
# Start development server
pnpm dev

# The app will be available at http://localhost:3000
```

### Build

```bash
# Type check
pnpm typecheck

# Lint
pnpm lint

# Build for production
pnpm build

# Start production server
pnpm start
```

## Site Map

```
├── /                    # Landing page
├── /chats               # Chat list
├── /chats/new           # New chat page
└── /chats/[thread_id]   # A specific chat page
```

## Configuration

### Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Backend API URLs (optional, uses nginx proxy by default)
NEXT_PUBLIC_BACKEND_BASE_URL="http://localhost:8001"
# LangGraph API URLs (optional, uses nginx proxy by default)
NEXT_PUBLIC_LANGGRAPH_BASE_URL="http://localhost:2024"
```

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes
│   ├── workspace/          # Main workspace pages
│   └── mock/               # Mock/demo pages
├── components/             # React components
│   ├── ui/                 # Reusable UI components
│   ├── workspace/          # Workspace-specific components
│   ├── landing/            # Landing page components
│   └── ai-elements/        # AI-related UI elements
├── core/                   # Core business logic
│   ├── api/                # API client & data fetching
│   ├── artifacts/          # Artifact management
│   ├── config/              # App configuration
│   ├── i18n/               # Internationalization
│   ├── mcp/                # MCP integration
│   ├── messages/           # Message handling
│   ├── models/             # Data models & types
│   ├── settings/           # User settings
│   ├── skills/             # Skills system
│   ├── threads/            # Thread management
│   ├── todos/              # Todo system
│   └── utils/              # Utility functions
├── hooks/                  # Custom React hooks
├── lib/                    # Shared libraries & utilities
├── server/                 # Server-side code (Not available yet)
│   └── better-auth/        # Authentication setup (Not available yet)
└── styles/                 # Global styles
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server with Turbopack |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix ESLint issues |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm check` | Run both lint and typecheck |

## Development Notes

- Uses pnpm workspaces (see `packageManager` in package.json)
- Turbopack enabled by default in development for faster builds
- Environment validation can be skipped with `SKIP_ENV_VALIDATION=1` (useful for Docker)
- Backend API URLs are optional; nginx proxy is used by default in development

## Multi-User Auth

The frontend now ships with a Prisma-backed auth layer for multi-user isolation.

Required environment variables in `frontend/.env`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/deerflow"
BETTER_AUTH_SECRET="replace-with-a-long-random-string"
DEER_FLOW_PROXY_SHARED_SECRET="replace-with-another-long-random-string"
```

Before first run:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

After any Prisma schema change, run:

```bash
pnpm prisma:generate
```

If you switch branches and the Prisma schema or generated types differ, restart the frontend after regenerating:

```bash
pnpm prisma:generate
pnpm dev
```

You can also enable the repo-managed Git hook from the repository root so branch switches regenerate Prisma automatically:

```bash
make install-hooks
```

That hook setup also covers `git merge` and `git pull`, so Prisma client is regenerated when merged frontend Prisma-related files change.

It also covers `git rebase` through `post-rewrite`, so the common history-rewrite path is included too.

Important:

- `DEER_FLOW_PROXY_SHARED_SECRET` must also be present in the backend process environment.
- `User.workSpace` is used as a logical workspace key, not a raw absolute path.
- Backend user data is isolated under `backend/.deer-flow/workspaces/<workspace>/...`

## License

MIT License. See [LICENSE](../LICENSE) for details.
