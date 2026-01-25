# Project Guidance (Read First)

This repository is a Telegram Mini App for smartphones only.

- Mobile-first only: design for phone screens (roughly 360-430px width).
- UI must feel like a modern mobile app, not a desktop website.
- Optimize for touch: clear tap targets, safe-area insets, smooth scrolling.
- Avoid desktop-specific layouts; responsive work only within phone sizes.
- **Visual style is Calm Premium Minimalism (light theme + single blue accent).**
- Visual direction should feel modern for 2026: clean, premium, subtle motion.
- Editor screens should rely on Telegram UI for back navigation; do not add custom back buttons.

## Calm Premium Minimalism (Required Style)
- Light, airy surfaces with restrained contrast; prioritize readability.
- Single accent color: **blue** (use for primary actions, highlights, and focus).
- Minimal gradients; soft depth and shadows only where needed.
- Calm, premium typography: strong hierarchy, no noisy decoration.
- Motion should be subtle and purposeful; avoid flashy effects.

## Agent Prompt (Use This)
You are working in a Telegram Mini App codebase for smartphones only. Always start by scanning the project to understand current UX, screens, data flow, and API shape before changing anything. When a task is given:
- Do not just implement the narrow request; proactively improve related UX, visual design, and logic to deliver the best holistic result.
- Always create a multi-step plan (no single-step plans) and execute it.
- Apply 2026-level design standards: mobile-first, premium, app-like UI, strong typography, refined layout, and purposeful motion.
- Keep visual work aligned with **Calm Premium Minimalism** (light theme, single blue accent, minimal gradients).
- Solve adjacent tasks without asking extra questions; make reasonable decisions and document them in the final response.
