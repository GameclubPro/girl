# KIVEN GIRL — Telegram Mini App (Fullscreen)

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

## Fullscreen эмуляция Telegram Mini App
Все скриншот-скрипты уже используют параметры fullscreen и safe-area:
- `tgFullscreen=1`
- `tgTopInset=47`
- `tgBottomInset=34`
- `tgContentTopInset=47`
- `tgContentBottomInset=34`

Основной скрипт:
```bash
npm run screenshot:design-redesign -- --width 390 --height 844
```

## Visual Audit Pipeline
Подготовка:
```bash
npm run visual:setup
```

Полный цикл:
```bash
npm run visual:capture:baseline -- --session pro-cabinet --userId 5510721194
# ...внести изменения...
npm run visual:capture:after -- --session pro-cabinet --userId 5510721194
npm run visual:compare -- --session pro-cabinet
```

One-shot:
```bash
npm run visual:workflow -- --session smoke-pro --userId 5510721194
```

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

## Важно про sandbox-ошибки
Если `visual:doctor` показывает `sandbox_host_linux.cc:41` или crashpad `Operation not permitted`, это проблема окружения запуска Chromium (seccomp/sandbox), а не проблема UI-кода или Telegram fullscreen-параметров.

В таком случае visual-аудит лучше запускать в хостовой ОС или в менее ограниченном контейнере.
