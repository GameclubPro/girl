# Testing Matrix

## Local development

1. Quick static checks:
2. `npm run lint`
3. `npm run build`
4. Dependency safety:
5. `npm run deps:check`
6. Integration suite (with dockerized DB):
7. `npm run test:integration:local`

## CI / pre-merge gate

1. `npm run deps:check`
2. `npm run test:integration:ci`
3. `npm run build`
4. `npm run visual:gate`

## Pre-release smoke

1. `npm run test:db:up`
2. `npm run test:integration`
3. TG -> VK link smoke на реальных Mini App хостах.
4. TG -> MAX link smoke на реальных Mini App хостах.
5. VK -> MAX link smoke на реальных Mini App хостах.
6. MAX -> TG link smoke на реальных Mini App хостах.
7. SQL-инвариант для `user_identities` (одинаковый `internal_user_id` у TG/VK/MAX связки).
8. `npm run test:db:down`

## Maintenance (non-blocking)

1. Patch/minor dependency maintenance:
2. `npm run agent:maintenance`
3. Blocking quality gate (без auto-update):
4. `npm run agent:autopilot`
