# KIVEN GIRL — Telegram + VK Mini App (Fullscreen)

## Multi-platform запуск (Telegram + VK)
- Приложение автоматически определяет хост по launch params:
  - Telegram WebApp -> работает в режиме Telegram Mini App;
  - VK launch params (`vk_*`) -> работает в режиме VK Mini App.
- Для share/deeplink в env:
  - `VITE_TG_APP_URL` — ссылка на Telegram-бота/mini app;
  - `VITE_VK_APP_URL` — ссылка вида `https://vk.com/app<APP_ID>`.
- При запуске в VK `userId` формируется как `vk_<vk_user_id>`, чтобы не конфликтовать с Telegram ID в одной базе.

## Account Link Runbook (TG/VK)
Проверка инварианта после успешного `POST /api/account/link/complete`:
- в `user_identities` должны быть 2 записи (`telegram` и `vk`) с одним `internal_user_id`.

SQL-проверка:
```sql
SELECT platform, external_user_id, internal_user_id
FROM user_identities
WHERE (platform = 'telegram' AND external_user_id = '<TG_ID>')
   OR (platform = 'vk' AND external_user_id = '<VK_ID>');
```

Ожидаемый результат:
- обе строки возвращены;
- `internal_user_id` одинаковый у обеих строк.

## Быстрый старт
```bash
npm install
npm run dev
```

Локальный запуск API:
```bash
npm run api
```

Сборка и линт:
```bash
npm run lint
npm run build
```

## Dependency контроль и автономность агента
Baseline зависимостей (root + bot):
```bash
npm run deps:baseline
```

Жесткая проверка зависимостей:
```bash
npm run deps:check
```
- `FAIL`, если есть доступные patch/minor (`wanted > current`) или high/critical уязвимости.
- `WARN`, если есть только major-долг (`latest > wanted` при `current == wanted`).

Safe-обновление зависимостей (root + bot + playwright chromium):
```bash
npm run deps:update:safe
```

Preflight перед итерацией:
```bash
npm run agent:health
```

Полный autopilot-проход после UI/infra изменений:
```bash
npm run agent:autopilot
```

## Fullscreen эмуляция Telegram/VK Mini App
Скриншот-скрипты поддерживают оба хоста:
- `--host telegram` (по умолчанию для одиночных скриншотов);
- `--host vk` для VK-профиля;
- visual-аудит поддерживает multi-host через `--hosts telegram,vk` (default).

VK dev-эмулятор включается только в DEV и только при `vkEmu=1`.
Поддерживаемые query параметры VK эмулятора:
- `vkEmu`, `vkPlatform=ios|android`, `vkWidth`, `vkHeight`;
- `vkTitle`, `vkSubtitle`;
- `vkTopInset`, `vkBottomInset`, `vkLeftInset`, `vkRightInset`;
- `vkContentTopInset`, `vkContentBottomInset`, `vkContentLeftInset`, `vkContentRightInset`.

Основной скрипт:
```bash
npm run screenshot:design-redesign -- --width 390 --height 844
```

VK-вариант:
```bash
npm run screenshot:design-redesign -- --host vk --width 390 --height 844
```

## Visual Audit Pipeline
Подготовка:
```bash
npm run visual:setup
```

Полный цикл:
```bash
npm run visual:capture:baseline -- --session pro-cabinet --userId 5510721194 --hosts telegram,vk
# ...внести изменения...
npm run visual:capture:after -- --session pro-cabinet --userId 5510721194 --hosts telegram,vk
npm run visual:compare -- --session pro-cabinet --hosts telegram,vk
```

One-shot:
```bash
npm run visual:workflow -- --session smoke-pro --userId 5510721194 --hosts telegram,vk
```

Smoke workflow для быстрых проверок:
```bash
npm run visual:workflow:smoke
```

Только VK:
```bash
npm run visual:workflow -- --session smoke-vk --userId 5510721194 --hosts vk
```

Жесткий visual gate (пороговый контроль):
```bash
npm run visual:gate
```
- по умолчанию проверяет оба хоста: `telegram,vk`;
- default thresholds: `mean <= 0.8%`, `max-screen <= 2.5%`.
- при превышении порога команда возвращает `exit 1`.

Дополнительно:
- `visual:workflow`, `visual:capture:*`, `visual:compare` поддерживают `--parallel` (default `2`) для ускоренного capture.
- `visual:capture:*`, `visual:workflow`, `visual:compare`, `visual:gate` поддерживают `--hosts` (`telegram`, `vk`).
- `visual:compare` поддерживает `--failOnDelta 1 --maxMeanDelta <n> --maxScreenDelta <n>`.

Очистка логов:
```bash
npm run visual:cleanup -- --maxAgeDays 7 --keepLatest 30
```

## Диагностика окружения
Если скриншоты не стартуют, сначала прогоните:
```bash
npm run visual:doctor
```

Строгий режим (упадет с кодом 1, если нет рабочего браузера):
```bash
npm run visual:doctor -- --strict 1
```

Сохранить JSON-отчет:
```bash
npm run visual:doctor -- --json .logs/visual-doctor.json
```

## Выбор браузера для Playwright
По умолчанию скрипты пробуют:
1. `PW_BROWSER_EXECUTABLE` / `--browserExecutable`
2. системный Chromium/Chrome (`/usr/bin/google-chrome`, `/usr/bin/chromium`, ...)
3. bundled Playwright Chromium

Можно явно указать браузер:
```bash
PW_BROWSER_EXECUTABLE=/usr/bin/google-chrome npm run screenshot:design-redesign -- --width 390 --height 844
```

Либо через аргумент:
```bash
npm run screenshot:design-redesign -- --browserExecutable /usr/bin/google-chrome --width 390 --height 844
```

Параметр `--browserExecutable` также поддержан в:
- `screenshot:miniapp`
- `screenshot:miniapp:matrix`
- `screenshot:booking-item`
- `screenshot:booking-item:matrix`
- `screenshot:deposit-sheet`
- `screenshot:deposit-sheet:matrix`
- `visual:capture:baseline`
- `visual:capture:after`
- `visual:workflow`

Host-параметры:
- `screenshot:miniapp`, `screenshot:miniapp:matrix`, `screenshot:booking-item*`, `screenshot:deposit-sheet*` поддерживают `--host telegram|vk`.
- `visual:*` и `visual:gate` поддерживают `--hosts telegram,vk`.

## Важно про sandbox-ошибки
Если `visual:doctor` показывает `sandbox_host_linux.cc:41` или crashpad `Operation not permitted`, это проблема окружения запуска Chromium (seccomp/sandbox), а не проблема UI-кода или Telegram fullscreen-параметров.

В таком случае visual-аудит лучше запускать в хостовой ОС или в менее ограниченном контейнере.
