# MenuApp — Fix & Feature Roadmap

> **Audience**: Claude Code (Opus) working on the MenuApp codebase.
> **Owner**: Julian.
> **Last updated**: 2026-04-28.
> **Stack**: Next.js 16 (App Router) + TypeScript + Tailwind + Supabase + Vercel.

---

## How to use this document

This is a **living document**. Bugs found during testing go into the `📋 BACKLOG` section at the bottom using the template provided. Items are organized in three layers:

1. **🐛 BUGS** — Things that are broken or behave incorrectly. Ship fixes ASAP.
2. **✨ IMPROVEMENTS** — Things that work but could be better (UX, performance, polish).
3. **🚀 FEATURES** — New capabilities to build, in priority order.

Each section is grouped into **Batches** (A, B, C…). Recommended workflow: pick one batch, finish it, open a PR, merge, move on. Don't mix batches in the same PR.

**Priority markers**:
- 🔴 Critical — breaks the app or core user flow.
- 🟡 High — visible bug or obvious UX problem.
- 🟢 Medium/Low — polish, edge cases.

---

## Repo conventions (read this first)

Notes from auditing `src/app/[slug]/page.tsx`:

- **Currency formatting**: a `formatoPrecio()` helper was added at the top of `page.tsx` to safely format prices (handles `null`/`undefined`). Use it everywhere instead of raw `.toLocaleString('es-CO')`. If you see raw `.toLocaleString()` calls, replace them.
- **Colombia timezone**: the codebase uses `new Date(new Date().getTime() - 5 * 60 * 60 * 1000)` to get UTC-5. Keep this pattern; don't introduce a TZ library unless approved.
- **Theme system**: the public menu uses CSS variables (`var(--theme-bg)`, `var(--theme-text)`, etc.) driven by a `themeClass` (`theme-claro`, `theme-oscuro`, etc.). Don't hardcode colors — use the variables.
- **Plan gating**: `esBasicoPublico` and `esProPublico` are derived from `restaurante.plan`. Pro features must be guarded by `esProPublico`.
- **Supabase client**: `createClient()` from `@/lib/supabase-browser` for client components.
- **Modal component**: `@/components/ui/Modal` is the reusable modal. Use it instead of building modals from scratch.
- **Inline styles**: the codebase uses heavy inline styles (`style={{ ... }}`) instead of Tailwind classes for theming. Match this style; don't refactor to Tailwind unless explicitly requested.

---

## Already fixed (for reference)

These were resolved in a working session before this document existed. Mentioned only so they don't get re-opened:

- ✅ Public menu crashed with `TypeError: Cannot read properties of null (reading 'toLocaleString')` at `page.tsx:1880`. Fixed by introducing `formatoPrecio()` helper and using it in the order modal.
- ✅ Promo badge showing `null% OFF` when discount value is missing. Fixed in promo card rendering.
- ✅ Invalid promos (with `null` or `0` value where required) appearing in public menu. Fixed by filtering them out in `promosVisibles`.
- ✅ Combos with `null` price appearing in public menu. Fixed in `combosVisibles`.
- ✅ Plato del día showing discounted price in card but full price when added to cart or opened in detail. Fixed by registering `precioEspecial` into `preciosPromo` state on add.

---

# 🐛 BUGS

## Batch A — Time-based visibility (Issues #3, #4, #8)

**Goal**: Categories, plato del día, and promos should respect their own visibility windows in the public menu.

### A.1 🔴 Plato del día respects its own time window
- **Symptom**: Plato del día appears in the public menu outside its configured `horaInicio`/`horaFin` window.
- **Where**: `src/app/[slug]/page.tsx`, around the `platoDiaVisible` computation.
- **Current code** only checks if the underlying plato is visible by category, not the plato del día's own schedule.
- **Acceptance criteria**:
  - When current Colombia time is **outside** `platoDia.horaInicio`–`platoDia.horaFin`, the plato del día block does NOT render.
  - When inside the window, it renders as today.
  - Edge case: if `horaInicio`/`horaFin` are missing, treat as "always visible".

### A.2 🔴 Category-level time visibility works independently of global toggle
- **Symptom**: A category with `hora_inicio`/`hora_fin` configured does not hide outside that window unless `config.menu_por_horario_activo` is `true`.
- **Where**: `categoriasPorHorario` filter in `page.tsx`.
- **Decision needed**: Should category-level schedules ALWAYS work, or only when the global toggle is on?
- **Recommended behavior**: Per-category schedules should always be respected if set. The global toggle should be repurposed as a "master kill switch" only.
- **Acceptance criteria**:
  - A category with a schedule set hides outside its window regardless of `menu_por_horario_activo`.
  - A category without a schedule always shows (current behavior).

### A.3 🔴 Promos respect day-of-week filter
- **Symptom**: Promos appear in the public menu on days that aren't in their `dias` array.
- **Where**: `promosVisibles` filter in `page.tsx`.
- **Acceptance criteria**:
  - If `promo.dias` is `['lun', 'mie']` and today is Tuesday, the promo does NOT render.
  - If `promo.dias` is empty or missing, treat as "every day" (current implicit behavior).
  - Day codes: `lun`, `mar`, `mie`, `jue`, `vie`, `sab`, `dom` (already used in the code).

### A.4 🟡 Refactor: extract a shared `isCurrentlyVisible()` utility
- After A.1–A.3 are working, extract the visibility logic into a single helper, e.g., `src/lib/visibility.ts`:
  ```ts
  isCurrentlyVisible({ schedule?, days? }): boolean
  ```
- Apply it consistently across plato del día, categories, and promos.
- Don't do this until A.1–A.3 are tested and merged. Avoid premature abstraction.

---

## Batch B — Form validation (Issue #7)

**Goal**: Combos, promos, plato del día, and platos in categories must not allow creation/update with empty required fields.

### B.1 🔴 Required field validation across creation forms
- **Affected forms**:
  - Combo creation/edit
  - Promo creation/edit
  - Plato del día config
  - Plato in category creation/edit
- **Symptom**: Clicking "Create" with empty required fields silently does nothing or saves invalid data (null prices, null discount values).
- **Required behavior**:
  - Required fields show a red border + error message when blank on submit attempt.
  - The "Create" / "Update" button is disabled until all required fields are filled.
  - The `descripcion` field remains optional everywhere.
- **Acceptance criteria**:
  - Submit with empty required field → red error appears, no API call made.
  - Submit with all required fields filled → succeeds.
- **Implementation hint**: Look at existing form patterns in the codebase first. If there's no shared validation hook yet, propose one (e.g., `useFormValidation`) but discuss with Julian before building it.

### B.2 🟡 Type-specific validation for promos
- "Descuento" type → `valor` is required and must be `1–100`.
- "Precio especial" type → `valor` is required and must be `> 0`.
- "Dos por uno" type → no `valor` needed.
- Should be reflected in the UI: hide/show the value input dynamically based on selected type.

---

## Batch C — Promo display & cleanup (remaining parts of Issue #5)

**Goal**: Promo lifecycle in the public menu is consistent with what the owner configured.

### C.1 🟡 Deleted promos disappear from public menu
- **Symptom**: Deleting a promo from the dashboard does not remove it from the public menu (until manual refresh / cache clear).
- **Where**: Likely a stale cache or missed re-fetch in the public menu.
- **Acceptance criteria**:
  - Delete promo in dashboard → public menu reflects the change within reasonable time (next page load, or sooner if real-time).
  - Investigate whether this is a Supabase row deletion issue, a soft-delete (`activo: false`) issue, or a client-side caching issue.

### C.2 🟢 Promo edits update the public menu
- Same investigation as C.1 but for edits (price changes, day changes, etc.). Probably solved by the same fix.

---

## Batch D — Native dropdown UX (Issues #10, #11)

**Goal**: Replace native `<select>` elements that break the design system with a custom select component.

### D.1 🟡 Plato del día — plato selector breaks UX
- **Symptom** (Image #7 in original report): Selecting a plato in "Plato del día" config opens a native browser select that breaks the app's visual style.
- **Solution**: Build or install a custom select component. Recommendations:
  - **Headless UI** (`@headlessui/react`) — Listbox component, well-supported.
  - **Radix UI** (`@radix-ui/react-select`) — also great.
  - Or a simple custom dropdown if the team wants zero new dependencies.
- **Acceptance criteria**:
  - Selector matches the app's theme (rounded corners, fonts, colors).
  - Mobile-friendly (no native select sheet).
  - Searchable when there are >10 options (nice-to-have).

### D.2 🟡 Onboarding "Tipo de negocio" selector — same problem
- **Symptom** (Images #8, #9): Native select opens the OS picker.
- **Solution**: Reuse the same custom component built in D.1.
- **Note**: This one will be hit during onboarding, so it's worth doing soon — affects first impressions.

---

## Batch E — Edit existing combos and promos (Issue #9)

**Goal**: Owners can edit combos and promos they've already created.

### E.1 🟡 Edit functionality for combos
- **Where**: Combos tab in dashboard.
- **Symptom**: There's no way to edit an existing combo. Only create + delete.
- **Acceptance criteria**:
  - Tapping an existing combo opens the same form used for creation, prefilled.
  - Saving updates the row (Supabase `update`, not `insert`).
  - Form respects the validations from B.1.

### E.2 🟡 Edit functionality for promos
- Same as E.1 but for promos. Probably shares the same component.

---

## Batch F — Auth noise in public menu

### F.1 🟢 Suppress `AuthApiError: Invalid Refresh Token` in public menu
- **Symptom**: Public menu page logs a Supabase auth error when there's no session (expected — it's a public page).
- **Where**: `src/app/[slug]/page.tsx`, top of `cargar()` `useEffect`.
- **Solution options**:
  - Use a Supabase client variant that doesn't auto-refresh sessions for public pages.
  - Or wrap the auth call in a try/catch and silently swallow `AuthApiError`.
- **Acceptance criteria**:
  - No `AuthApiError` in console when loading the public menu without an active session.
  - Logged-in admin viewing the public menu still works.
- **Priority**: Low. It's noise, not a real bug. Tackle when convenient.

---

# ✨ IMPROVEMENTS

## Batch G — Visual polish (Issues #1, #2)

### G.1 🟢 Logo on Config tab should be circular
- **Where**: Config tab → "Logo del negocio" preview.
- **Current**: Square preview (Image #1 in original report).
- **Fix**: `border-radius: 50%` on the preview container, ensure `object-fit: cover` is set.
- **Note**: The public menu already shows the logo as circular — this is just the config tab preview.

### G.2 🟢 Floating order bar truncates with ellipsis
- **Where**: Bottom-floating "Ver pedido" bar in the public menu.
- **Symptom** (Image #2 in original report): With many products, the item list deforms the layout.
- **Where in code**: `page.tsx`, around the floating bar div with `itemsPedido.map(i => '${i.cantidad} ${i.plato.nombre}').join(' + ')`.
- **Fix options**:
  - Show only the first 2–3 items + `"y X más"`.
  - Or apply `text-overflow: ellipsis` + `white-space: nowrap` + `overflow: hidden` to the description line.
- **Acceptance criteria**:
  - Bar height stays constant regardless of number of products.
  - Total price and "Ver pedido" button are always fully visible.

### G.3 🟡 Time picker shows natural-language interpretation
- **Found**: 2026-04-28
- **Symptom**: User configured "8:00 a.m. — 12:45 p.m." thinking "8am to 12:45 at midnight today". The actual interpretation is 08:00–12:45 (only morning). Confusion stems from the fact that "12:45 p.m." sounds late but is actually afternoon.
- **Affected forms**:
  - Plato del día time range
  - Category visibility time range
  - Restaurant opening hours
  - Promo time range (if applicable)
- **Acceptance criteria**:
  - Below each time-range picker, render a helper line in natural Spanish.
  - Examples:
    - 08:00–18:00 → "Visible de 8:00 a.m. a 6:00 p.m."
    - 08:00–00:45 → "Visible de 8:00 a.m. hasta las 12:45 a.m. del día siguiente"
    - 22:00–02:00 → "Visible de 10:00 p.m. hasta las 2:00 a.m. del día siguiente"
  - Detect overnight (start > end) and append "del día siguiente".
  - Build as a reusable React component, e.g. `TimeRangeHelper`, in `src/components/ui/`.
- **Priority**: 🟡 high — affects every owner configuring schedules.

---

## Batch H — Performance & data layer

### H.1 🟡 Add a query cache layer (SWR or React Query)
- **Why**: Currently every page does its own `supabase.from(...).select()` in `useEffect`. No caching, no deduplication, no automatic revalidation. Navigating between dashboard tabs re-fetches everything.
- **Recommendation**: **SWR** (lighter, simpler, by Vercel — pairs naturally with Next.js).
  - Alternative: TanStack Query (React Query) if Julian prefers more features.
- **Scope**:
  - Wrap Supabase queries in custom hooks (`useRestaurante(slug)`, `useCategorias(restauranteId)`, etc.).
  - Configure sensible `revalidateOnFocus`, `dedupingInterval`.
  - Keep public menu queries separate from dashboard queries (different cache keys).
- **Acceptance criteria**:
  - Navigating away from a tab and back is instant (no re-fetch unless data is stale).
  - Mutations (create/update/delete) trigger correct cache invalidation.
- **Out of scope**: Server-side data fetching migration. Keep client-side for now.

### H.2 🟡 Immediate loading states on navigation
- **Why**: When navigating between dashboard tabs (Inicio / Menú / QR / Config), there's a perceptible blank state.
- **Solution**:
  - Use Next.js App Router's `loading.tsx` files at the appropriate level.
  - Show skeleton loaders or shimmer effects matching the page layout (don't use generic spinners).
- **Acceptance criteria**:
  - Tab switch shows a skeleton within ~50ms.
  - No more blank white flashes.
- **Note**: H.1 (caching) reduces how often this matters. Do H.1 first.

---

# 🚀 FEATURES

> Numbered in execution order. Don't start a feature until all relevant bugs in the previous batches are merged.

## F1. 🚀 Menu preview before publishing
- **Goal**: Owner can preview the public menu (with current unpublished changes) before making them live.
- **Open questions** (decide before implementing):
  - Where does it live? (Modal in dashboard / dedicated `/preview/[slug]` route / split-view editor).
  - Does it show only saved data or in-progress edits too?
- **Recommended MVP**: Reuse `src/app/[slug]/page.tsx` rendering at a route like `/admin/preview/[slug]`, only accessible to the logged-in owner. Shows the same data as the public menu would.

## F2. 🚀 Refactor `src/app/[slug]/page.tsx`
- **Why**: This file is ~2000 lines and houses too many responsibilities (data fetching, all UI, all modals, all business logic).
- **Plan**:
  - Extract custom hooks: `useRestaurante`, `useMenuData`, `useOrder`, `usePromos`.
  - Extract atomic components: `PlatoCard`, `ComboCard`, `PromoCard`, `OrderBar`, `RestaurantHero`.
  - Extract modal components: `PlatoDetailModal`, `OrderModal`, `RatingModal`, `ComboDetailModal`, `PromoDetailModal`.
  - Keep the page as orchestration only.
- **Pair with H.1** — refactoring while introducing SWR keeps the work cohesive.
- **Acceptance criteria**:
  - `page.tsx` under 300 lines.
  - All extracted components live under `src/app/[slug]/_components/` (Next.js convention for colocated, non-routable components).
  - No behavior changes — pure refactor. Visual regression check before merging.

## F3. 🚀 Email integration with Resend
- **Use cases**:
  - Welcome email on signup.
  - Password recovery (currently using Supabase default — replace with branded Resend templates).
  - Transactional notifications (order received, plan upgraded, etc.).
- **Implementation**:
  - Resend account + verified domain (probably `menuapp.co`).
  - Templates as React Email components (`react-email` package — pairs naturally with Resend).
  - Server actions or route handlers for sending.
- **Pair with F4** since payment flows trigger transactional emails.

## F4. 🚀 Wompi (payments) + Electronic invoicing
- **Wompi**: Colombian payment gateway. Needed for premium plan upgrades and possibly orders in the future.
- **Electronic invoicing**: Required by Colombian regulation (DIAN). Options:
  - **Alegra** — most popular for SMEs, good API.
  - **Siigo** — more enterprise.
  - **Factus** — newer, simpler API.
  - **Recommendation**: Start with Alegra unless Julian has a strong preference.
- **Out of scope for first iteration**: Refunds, partial payments. Just upgrade-to-pro flow.

## F5. 🚀 Onboarding Phase 2 — Active referrals
- **Goal**: Existing owners can refer other restaurants and earn rewards (free month, discount, etc.).
- **Requirements** (to define):
  - Reward structure.
  - Tracking mechanism (referral codes? unique signup links?).
  - UX in the dashboard.
- **Note**: Pure design phase first — don't code until requirements are concrete.

## F6. 🚀 Landing page — `menuapp.co`
- Public-facing marketing site. Separate from the app.
- Likely a different repo or a subdomain split.

## F7. 🚀 Launch
- Final QA pass.
- Production smoke tests.
- Monitoring (Vercel Analytics + Sentry recommended).
- Marketing push (the social media automation pipeline previously discussed).

---

# 📋 BACKLOG

> Bugs and ideas found during testing. Add new items at the top using the template below. When promoting an item to a real batch, move it up and delete it from here.
>
> **Numbering**: BACKLOG items use the `BL.X` prefix (BackLog) to avoid colliding with active batch letters (Batch A, B, C…). When promoting to a real batch, renumber to that batch's prefix.

## Template (copy this for each new item)

```markdown
### BL.X 🟡 Short title here
- **Found**: 2026-MM-DD
- **Symptom**: What's wrong / what you observed.
- **Steps to reproduce**: 1. … 2. … 3. …
- **Where (suspected)**: file path or component name, if known.
- **Stack trace** (if applicable): paste here.
- **Acceptance criteria**: what "fixed" looks like.
- **Priority**: 🔴 critical / 🟡 high / 🟢 medium-low.
```

## Items

### BL.2 🟡 Remove menu_por_horario_activo from schema and UI
- **Found**: 2026-04-29 during A.2.
- **Status**: UI removal DONE 2026-04-29 (toggle no longer in config page). Remaining work below.
- **Symptom**: The field still exists in `config_restaurante` (DB), the TypeScript types (`src/types/index.ts:205`), and the config form state (`src/app/config/page.tsx:38, 106, 354`). Pre-launch, no users depend on it — clean it up.
- **Steps**:
  - Migration: drop column `menu_por_horario_activo` from `config_restaurante`.
  - Remove the field from `src/types/index.ts`.
  - Remove from `toggles` form state default + DB-load mapping in `config/page.tsx`.
  - Remove the `requiereBasico` plan-gate entry that references it.
- **Priority**: 🟡 high — visual cleanup once no production users have surprise dependencies on the legacy semantics.

### BL.1 🟢 Visibility windows don't auto-refresh
- **Found**: 2026-04-28
- **Symptom**: All time-based visibility (plato del día, categories, promos) is computed only at page load. A visitor with the menu open across a boundary sees stale state.
- **Where**: `src/app/[slug]/page.tsx` — `horaActual` is computed once at render, not reactive.
- **Acceptance criteria**: re-evaluate every 60s OR refresh on focus.
- **Priority**: 🟢 low (edge case).

---

# 📓 Notes for Claude Code

- **Always read this file first** at the start of a session.
- **Pick one batch per PR**. Don't mix batch A fixes with batch D fixes in the same commit set.
- **Visual regression**: when touching `src/app/[slug]/page.tsx`, screenshot before and after at mobile width (~390px) and desktop. Compare.
- **Tests**: there are currently no tests in the repo. Don't introduce a testing framework as part of a fix unless explicitly asked. Suggest it as a separate batch.
- **Commits**: small, focused. Conventional Commits format preferred (`fix:`, `feat:`, `refactor:`, `chore:`).
- **Branch naming**: `fix/batch-a-time-visibility`, `feat/menu-preview`, etc.
- **When in doubt about decisions** (e.g., "should category schedule always work or only with global toggle?"), ASK Julian before implementing. Don't guess.
- **Spanish vs English in code**: the codebase mixes both (variable names like `categoriasPorHorario`, `platoDia`, `mostrarPedido`). Don't translate existing identifiers. New code can use English, but match the surrounding style if extending an existing file.
