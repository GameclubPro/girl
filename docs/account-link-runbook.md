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
