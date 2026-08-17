# Digitalize — ERP + WAI assistant

A small business ERP dashboard (HRMS, CRM/Sales Pipeline, Projects, Accounting) with
**WAI**, an embedded AI assistant that answers natural-language questions about your
data — by text or by voice — inspired by the Digitalize product demo.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS
- PostgreSQL + Prisma ORM
- Anthropic Claude API (tool-calling over your live business data)
- Browser Web Speech API for voice (speech-to-text + text-to-speech)

## Getting started

1. **Start Postgres** (requires Docker Desktop running):
   ```bash
   docker compose up -d
   ```

2. **Install dependencies** (already done if you're reading this after setup):
   ```bash
   npm install
   ```

3. **Configure environment** — edit `.env`:
   - `DATABASE_URL` — already points at the docker-compose Postgres by default.
   - `ANTHROPIC_API_KEY` — get one from https://console.anthropic.com/ and paste it in.
     Without this, every module works except the WAI assistant.
   - `AUTH_SECRET` — change to a long random string before deploying anywhere real.

4. **Run migrations + seed sample data**:
   ```bash
   npx prisma migrate dev
   npm run db:seed
   ```

5. **Start the app**:
   ```bash
   npm run dev
   ```
   Open http://localhost:3000 and log in with:
   - Email: `admin@digitalize.app`
   - Password: `admin123`

## What's included

- **HRMS** — staff directory, daily attendance marking, leave requests (approve/reject).
- **CRM / Sales Pipeline** — clients, leads across pipeline stages (kanban board).
- **Projects** — projects with tasks, status tracking, assignment.
- **Accounting** — invoices (draft/sent/paid/overdue) and expense logging, with revenue/expense/net stat cards.
- **WAI assistant** — floating chat widget (bottom-right of the dashboard) with two modes:
  - **Chat**: ask things like "Who came in today?", "Any overdue invoices?", "What's in the sales pipeline?"
  - **Voice**: tap the phone icon to switch to a live voice call UI — speak your question, WAI answers out loud. Supports English and Tamil (language selector in the voice panel). Voice requires Chrome or Edge (Web Speech API support).

WAI answers by calling tools that query your real Postgres data (`src/lib/wai/tools.ts`) —
it never makes numbers up.

## Notes

- Voice STT/TTS runs entirely in the browser (no extra API key), so Tamil accuracy varies
  by browser/OS voice pack. For production-grade multi-language voice, swap in a dedicated
  service (e.g. Deepgram/ElevenLabs) behind `src/components/wai/WaiVoicePanel.tsx`.
- This is an MVP covering the four core modules from the demo video — modules like Cloud
  Services, Company Assets, Investments, and Media Library from the original product are
  not yet implemented.
