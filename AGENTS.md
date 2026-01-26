# Project Guidance (Read First)

## Product Snapshot
- Telegram Mini App, mobile-only (target width 360-430px).
- Two roles: client and master (pro).
- Core flows: discovery, requests, bookings, deposits, chat, reschedule, reviews, stories, trust.
- UI copy is primarily Russian; keep it calm, concise, and premium.

## Architecture and Source of Truth
- Frontend: React + TypeScript + Vite.
  - Screens live in `src/screens`.
  - Shared UI in `src/components`.
  - Styling primarily in `src/App.css` and `src/index.css`.
- Backend: Express + Postgres in a single file `server/index.js`.
- Types and contracts: `src/types/app.ts` must stay in sync with API payloads.
- API base: `VITE_API_URL` with fallback to `http://localhost:4000`.
- User identity comes from Telegram WebApp init data.

## UX and Visual System (Calm Premium Minimalism)
- Light theme, airy surfaces, restrained contrast.
- Single accent color: blue (primary actions, highlights, focus).
- Minimal gradients; soft depth and shadows only where needed.
- Modern 2026 feel: clean, premium typography, clear hierarchy, subtle motion.
- Mobile-only UI: touch-first, safe-area padding, smooth scrolling, no desktop layouts.
- Editor screens rely on Telegram back navigation; never add custom back buttons.

## Best Strategy (Always Follow)
1) Scan relevant screens, types, and API handlers before editing.
2) Update backend first (schema, queries, actions, system messages, validations).
3) Update frontend next (types, API calls, state, UI, optimistic updates).
4) Polish UX and visuals to match Calm Premium Minimalism.
5) Verify (at least TypeScript check) and document changes and follow-ups.

## Implementation Rules
- Do not just implement the narrow request; improve adjacent UX and logic.
- Keep client and master flows symmetric unless product requirements differ.
- Surface state changes in chat via system messages and update list cards/status.
- Handle loading, empty, error, and edge states explicitly.
- Avoid desktop breakpoints and oversized layouts; design for a phone screen only.
- Document decisions in the final response; avoid extra questions unless blocked.
- Always answer in Russian.
- If the user asks for a plan, first analyze the project and then provide a multi-step plan based on the best 2025-2026 strategy for this codebase.
- If the user asks for a plan, do not change any code. Provide the plan for approval and wait for the next user command before making edits.
