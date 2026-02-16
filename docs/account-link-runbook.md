# Account Link Runbook (TG/VK)

## Быстрая проверка инварианта после `link/complete`

Подставьте реальные значения `telegram_external_user_id` и `vk_external_user_id`.

```sql
WITH tg AS (
  SELECT internal_user_id
  FROM user_identities
  WHERE platform = 'telegram' AND external_user_id = :telegram_external_user_id
),
vk AS (
  SELECT internal_user_id
  FROM user_identities
  WHERE platform = 'vk' AND external_user_id = :vk_external_user_id
)
SELECT
  (SELECT internal_user_id FROM tg) AS telegram_internal_user_id,
  (SELECT internal_user_id FROM vk) AS vk_internal_user_id,
  (
    (SELECT internal_user_id FROM tg) IS NOT NULL
    AND (SELECT internal_user_id FROM vk) IS NOT NULL
    AND (SELECT internal_user_id FROM tg) = (SELECT internal_user_id FROM vk)
  ) AS invariant_ok;
```

Ожидаемый результат: `invariant_ok = true`.

## Проверка записи merge-аудита

```sql
SELECT
  id,
  primary_user_id,
  secondary_user_id,
  source_platform,
  target_platform,
  selection_reason,
  created_at
FROM account_merge_audit
ORDER BY id DESC
LIMIT 20;
```

Проверяйте, что `selection_reason` заполнен и соответствует сценарию выбора primary.

## Проверка активных серверных сессий

```sql
SELECT
  user_id,
  platform,
  external_user_id,
  issued_at,
  expires_at,
  revoked_at
FROM user_sessions
WHERE revoked_at IS NULL
ORDER BY issued_at DESC
LIMIT 50;
```

## Rollout-подсказка

1. Старт: `AUTH_LOG_ONLY=1`, `AUTH_STRICT=0`.
2. Мониторинг 3-7 дней:
3. `auth-missing-or-invalid`
4. `auth-user-mismatch`
5. `bootstrap-platform-auth-invalid`
6. После стабилизации: `AUTH_STRICT=1` на staging, затем production.

## On-call checklist для strict-auth

1. Проверить флаги окружения:
2. `AUTH_STRICT=1`
3. `AUTH_LOG_ONLY=0`
4. `ALLOW_LOCAL_DEV_SESSION=0` (для production)
5. Снять выборку 4xx/401/403 по endpoint за последние 30 минут.
6. Проверить долю ошибок:
7. `auth_required`
8. `forbidden`
9. `platform_auth_invalid`
10. Прогнать smoke вручную:
11. bootstrap (TG/VK),
12. link/start + link/complete (TG->VK и VK->TG),
13. WS чат с валидной сессией.
14. При аномалиях временно вернуть `AUTH_LOG_ONLY=1`, `AUTH_STRICT=0` и зафиксировать причину в инциденте.

## Как поднять test DB

1. Скопировать env-шаблон:
2. `cp .env.test.example .env.test`
3. Поднять Postgres:
4. `npm run test:db:up`
5. Проверить, что контейнер healthy:
6. `docker compose -f docker-compose.test.yml ps`
7. Остановить и очистить:
8. `npm run test:db:down`

## Как прогнать integration security suite

1. Локальный полный цикл:
2. `npm run test:integration:local`
3. Только тесты (если БД уже поднята):
4. `npm run test:integration`
5. CI-режим (skip отключен, недоступная БД = fail):
6. `npm run test:integration:ci`

## Что делать при fail в strict-auth тестах

1. Проверить доступность БД и переменные (`DATABASE_URL`, `BOT_TOKEN`, `VK_APP_SECRET`).
2. Переподнять тестовую БД: `npm run test:db:down && npm run test:db:up`.
3. Повторно прогнать только integration suite.
4. Если падают сценарии `forbidden`/`auth_required`:
5. проверить `AUTH_STRICT=1`, `AUTH_LOG_ONLY=0`, `ALLOW_LOCAL_DEV_SESSION=0`.
6. Если падает link-race кейс:
7. проверить, что `account_link_challenges` обновляется через транзакцию и `used_at` выставляется атомарно.
8. После исправления обязательно прогнать gate:
9. `npm run deps:check && npm run test:integration && npm run build && npm run visual:gate`.
