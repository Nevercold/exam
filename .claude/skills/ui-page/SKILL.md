---
name: ui-page
description: Build a page or component in the exam frontend (Nuxt UI v4). Use for teacher dashboard pages, student views and projector views so that layout, responsiveness and load time are right.
---

# Pages & components

## Which view?

| Audience | Layout | Rules |
|---|---|---|
| Teacher (management) | `definePageMeta({ layout: 'dashboard', middleware: 'auth' })` | `UDashboardPanel` with `#header` (`UDashboardNavbar` + `UDashboardSidebarCollapse`) and `#body`. Modals go **inside** the panel (single root node per page). |
| Admin | like teacher, `middleware: 'admin'` | The server checks again (`requireAdmin`). |
| Student (phone) | `default` | **Load time first:** no tables, charts, Shiki or big libs. Large touch targets (≥ 48px), suitable `inputmode`, one action per screen. |
| Projector | own layout (phase 5) | Very large type, high contrast, readable from the back of the room, keyboard controls. |

## Conventions

- UI text in **German**, informal "du", short and friendly; an emoji where it fits.
- Forms: `UForm` + Zod schema from `shared/utils/schemas.ts`; confirmation fields via `.extend().refine()` on the client.
- API errors: `toast.add({ title: errorMessage(err), color: 'error' })`.
- Icons: `i-lucide-*` only (bundled locally, no icon API).
- Colors via Nuxt UI tokens (`text-muted`, `bg-elevated`, `text-primary`, …), answer colors via `--color-answer-1..4`.
  Always add shapes (▲ ◆ ● ■) to answers; color alone isn't enough (color blindness).
- Dark mode must work (tokens, not fixed colors).
- Table cells with components: `resolveComponent('UBadge')` + `h(...)`.

## Check

- Click through at 360px (phone), 768px (tablet), 1920px (projector)
- Toggle dark mode
- `pnpm lint && pnpm typecheck`
