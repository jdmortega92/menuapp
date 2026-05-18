# MenuApp — Fix & Feature Roadmap

> **Audience**: Claude Code (Opus) working on the MenuApp codebase.
> **Owner**: Julian.
> **Last updated**: 2026-05-13.
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

## Batch A — Time-based visibility (Issues #3, #4, #8) ✅ CLOSED

**Status**: All four items shipped and verified in browser. Closed 2026-04-30.

**Goal**: Categories, plato del día, and promos should respect their own visibility windows in the public menu.

### A.1 ✅ Plato del día respects its own time window
- **Symptom**: Plato del día appears in the public menu outside its configured `horaInicio`/`horaFin` window.
- **Where**: `src/app/[slug]/page.tsx`, around the `platoDiaVisible` computation.
- **Current code** only checks if the underlying plato is visible by category, not the plato del día's own schedule.
- **Acceptance criteria**:
  - When current Colombia time is **outside** `platoDia.horaInicio`–`platoDia.horaFin`, the plato del día block does NOT render.
  - When inside the window, it renders as today.
  - Edge case: if `horaInicio`/`horaFin` are missing, treat as "always visible".

### A.2 ✅ Category-level time visibility works independently of global toggle
- **Symptom**: A category with `hora_inicio`/`hora_fin` configured does not hide outside that window unless `config.menu_por_horario_activo` is `true`.
- **Where**: `categoriasPorHorario` filter in `page.tsx`.
- **Decision needed**: Should category-level schedules ALWAYS work, or only when the global toggle is on?
- **Recommended behavior**: Per-category schedules should always be respected if set. The global toggle should be repurposed as a "master kill switch" only.
- **Acceptance criteria**:
  - A category with a schedule set hides outside its window regardless of `menu_por_horario_activo`.
  - A category without a schedule always shows (current behavior).

### A.3 ✅ Promos respect day-of-week filter
- **Symptom**: Promos appear in the public menu on days that aren't in their `dias` array.
- **Where**: `promosVisibles` filter in `page.tsx`.
- **Acceptance criteria**:
  - If `promo.dias` is `['lun', 'mie']` and today is Tuesday, the promo does NOT render.
  - If `promo.dias` is empty or missing, treat as "every day" (current implicit behavior).
  - Day codes: `lun`, `mar`, `mie`, `jue`, `vie`, `sab`, `dom` (already used in the code).

### A.4 ✅ Refactor: extract a shared `isCurrentlyVisible()` utility
- Helper lives at `src/lib/visibility.ts` with signature `isCurrentlyVisible({ horaInicio?, horaFin?, dias?, ahora? }): boolean`.
- All three call sites (categories, promos, plato del día) routed through it.
- HH:MM[:SS] normalization, overnight detection (`inicio > fin`), and `getDay()→lun/mar/...` mapping all centralized.
- Pure refactor — same browser behavior as A.1/A.2/A.3.

---

## Batch B — Form validation (Issue #7) ✅ CLOSED

**Status**: Closed. Implemented across 6 sub-batches (B.1.a–B.1.e + B.2).
All forms (combo, promo, plato del día, plato in category) now validate
required fields with red border + error message + disabled submit button.

### B.1 ✅ Required field validation across creation forms
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

### B.2 ✅ Type-specific validation for promos
- "Descuento" type → `valor` is required and must be `1–100`.
- "Precio especial" type → `valor` is required and must be `> 0`.
- "Dos por uno" type → no `valor` needed.
- Reflected in the UI: hide/show the value input dynamically based on selected type.

---

## Batch C — Promo display & cleanup ✅ CLOSED

**Status**: Resolved as a side effect of H.1.b (SWR migration).
SWR's revalidateOnFocus + 5s deduping means deletes/edits propagate to
the public menu within seconds of the next focus event. No additional
fix required. Closed 2026-05-06.

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

## Batch D — Native dropdown UX ✅ CLOSED

**Status**: Resolved 2026-05-06. New Select component at
src/components/ui/Select.tsx replaces native selects in registro,
completa-perfil, and plato del día config. Full keyboard + ARIA support.

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

## Batch E — Edit combos & promos ✅ CLOSED

**Status**: Closed 2026-05-06.
- E.1 (edit combos) and E.2 (edit promos) implemented in-place using
  the existing create form prefilled.
- Bonus: combos gained optional days/hours restrictions (like promos).
- Bonus: plato ganador's 2 native selects migrated to Select component.
- Bonus: search added to plato lists in combo and promo forms when
  >= 10 platos.
- Bonus: Lucide edit SVG replaces emoji ✏; auto-scroll on Edit.

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

## Batch G — Visual polish (Issues #1, #2) ✅ CLOSED

**Status**: Closed 2026-05-10.
- G.1: Logo upload thumbnail in /config now circular.
- G.2: Order bar shows first 2 items + "y N más" when items > 2, with ellipsis fallback for long names.
- G.3: No changes needed — already covered. (TimeRangeHelper present in plato del día, categorías, horarios restaurante, combos. Promos do not have horario fields — only `dias` — so the helper is not applicable there.)

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

## Batch H — SWR migration

### H.1 🟡 Add a query cache layer (SWR or React Query) — IN PROGRESS

**Status**:
- ✅ H.1.a: useRestauranteBySlug (closed 2026-05-04)
- ✅ H.1.b: 8 hooks for public menu data + useTick (closed 2026-05-06)
- ⏳ H.1.c: Dashboard SWR migration (in progress)
  - ✅ H.1.c.1: useAuth → SWR via useRestauranteByUserId (closed 2026-05-12)
  - ⏳ H.1.c.2: /menu + /config migration + parametrize public hooks (in progress)
    - ✅ H.1.c.2.a: parametrize 4 hooks (usePromos, usePlatoDelDia, usePlatoGanador, useCombos) + migrate /menu + BL.9 reorder fix (closed 2026-05-13)
    - ✅ H.1.c.2.b: migrate /config to SWR (closed 2026-05-17)
  - ⏳ H.1.c.3 / H.1.c.2.c: /dashboard, /referidos, /qr, /suscripcion mutate() (pending)

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

### H.1.c.2.b ✅ Migrate /config to SWR — CLOSED
- **Closed**: 2026-05-17.
- **Approach**: Same pattern as H.1.c.2.a (/menu). Replaced the big
  initial-load useEffect (L75-146 in /config/page.tsx) with SWR hooks.
  Three reads migrated:
  - config_restaurante → useConfigRestaurante (new consumer)
  - horarios → useHorarios (new consumer)
  - categorias → useCategoriasYPlatos (new consumer, reuses /menu cache)
- **useAuth extension**: Added mutateRestaurante to useAuth's return
  so /config (and future 2.c pages) can revalidate the restaurante
  row after profile updates. No existing useAuth consumer needs
  changes — the existing { usuario, restaurante, cargando } shape is
  preserved and mutateRestaurante is an additive field.
- **Mutations**: 5 write paths now call mutate() after the DB UPDATE:
  - guardarCambios (profile) → mutateRestaurante
  - handleToggle → mutateConfig
  - guardarSorprendemeCats → mutateConfig
  - guardarHorarios (DELETE+INSERT) → mutateHorarios
  - confirmarRecorte (logo/banner upload) → mutateRestaurante
- **eliminarCuenta**: NOT touched. The 16-table cascade is out of
  scope; left as inline supabase calls.
- **cropModal & storage upload**: NOT touched. The logo/banner crop
  logic and storage upload calls keep their existing flow; only the
  trailing `restaurantes.update` is followed by a mutateRestaurante().
- **Storage list for logo/banner URLs**: preserved as its own
  useEffect (not migrated to SWR). The URLs use `?t=Date.now()` for
  cache-busting at page load — that semantic doesn't fit SWR's
  stable-cache-key model.
- **Loading gate**: preserved. `cargandoConfig` is now derived from
  `!configData || !horariosData || !catsAndPlatosData`. Splash still
  blocks render until all 3 SWR queries resolve, matching pre-migration
  UX (no flash of empty fields).
- **State**: 32 form useStates preserved (form input state, not
  cached data). Removed 2 non-form useStates that became derived:
  `cargandoConfig` (now derived from SWR) and `categoriasDisponibles`
  (now derived via useMemo from useCategoriasYPlatos — was dead code
  in JSX but wiring preserved).
- **Where**: src/hooks/index.ts (Phase A), src/app/config/page.tsx
  (Phases B-E).
- **Benefits**:
  - Instant loads on revisits (SWR cache deduplication).
  - Sync between admin /config and public menu: profile, colors, logo,
    and toggle changes refetch on focus / revisit.
  - Consistent pattern with /menu.
  - Foundation laid for 2.c (dashboard, referidos, qr, suscripcion).

Closes H.1.c.2.b. Opens H.1.c.2.c (last migration phase).

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

## 💰 STRATEGIC DECISIONS

### STRATEGIC.1 💰 Pricing structure for launch (decision pending validation)

**Status**: Decision pending — to validate with 3-5 Popayán pilot restaurants before launch.

**Current state (in code)**:
- Plan gratis: $0
- Plan básico: $15.000 COP/mes (per UI references)
- Plan pro: $29.000 COP/mes (per UI references)

**Proposed change**:
- Plan gratis: $0
- Plan básico: $19.000 COP/mes (+$4.000)
- Plan pro: $39.000 COP/mes (+$10.000)

**Rationale**:
- Current $15k/$29k jump is too narrow ($14k difference) — Pro doesn't capture enough value premium.
- $19k/$39k has 2.05x ratio — psychologically clearer that Pro is "the big plan".
- $39k stays under $50k psychological threshold (above which Colombian small business owners perceive as "expensive").
- $49k+ may be sustainable later with proven case studies, not at launch.

**Action items before launch**:
1. Validate prices with 3-5 pilot restaurants in Popayán.
2. Update price references in `src/app/menu/page.tsx` (currently shows "Ver Plan Pro — $29.000/mes").
3. Update future landing page with final prices.
4. Consider launch promo: "Primeros 50 restaurantes en Popayán: Pro gratis 3 meses".

**Decision deadline**: Before starting marketing/landing page (F6 in roadmap).

---

### STRATEGIC.2 📸 Allow up to 5 photos on free plan (DECISION TAKEN)

**Status**: Decision taken — implement before launch as part of free plan refinement.

**Current state**: Free plan has no photo upload (gated by `esBasico` flag in src/app/menu/page.tsx).

**Decision**: Free plan allows up to 5 photo uploads total (global limit, not per category).

**Rationale**:
- Without photos, free plan feels "cold" — restaurant owners don't experience the visual emotional moment that drives investment in the product.
- 5 photos lets owners showcase their star dishes (the "wow moment") while creating organic upgrade pressure: as they add more dishes without photos, the visual contrast makes the limitation obvious.
- Conversion to Básico becomes self-evident: "si pago $19k puedo poner fotos a TODOS mis platos."

**Implementation notes**:
- Counter logic: count uploaded photos for the restaurant. When count >= 5 AND plan === 'gratis', disable upload + show upgrade prompt.
- Edge case 1: User downgrades from Básico to Gratis with 20+ photos. Default proposal: keep photos visible (don't punish downgrade), but block new uploads until count drops below 5.
- Edge case 2: User deletes a photo to free up a slot — should be allowed without restriction.
- UI: when limit reached, show prominent message: "Has alcanzado el límite de 5 fotos en plan gratis. Actualiza a Básico para fotos ilimitadas." with link to upgrade.

**Where**: src/app/menu/page.tsx — modify the `esBasico` photo upload gate.

**Acceptance criteria**:
- Free plan user can upload up to 5 photos across all dishes.
- 6th photo upload attempt blocked with clear upgrade message.
- Downgrade behavior is consistent and predictable (keep visible, block new uploads).

**Priority**: 🟡 important — should be done before launch to optimize conversion funnel.

**Effort estimate**: 2-3 hours.

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

### BL.17 ✅ Promo/combo name-match anti-pattern — CLOSED
- **Closed**: 2026-05-17.
- **Found**: 2026-05-17 during F8 (variantes) investigation. Tech
  debt that pre-dated current session; F8 would have amplified the
  bug.
- **Symptom**: Code in 3 places used plato.nombre as identifier
  for filtering instead of plato.id. Breaks silently when two
  platos share the same nombre (e.g., "Pizza Margarita" in two
  different categorias). Affected:
  1. Editing a promo (admin /menu): edit form would pre-select the
     wrong platos.
  2. detectarAfectados (admin /menu, setting categoria horario):
     false warnings about unrelated promos.
  3. combosVisibles (public /[slug]): combo visibility could be
     incorrectly computed.
- **Plus 1 dead fallback** in /[slug] L1446 that masked the bug
  behind defensive code.
- **Root cause**: The hooks already exposed platosIds and
  combo.platosIds (canonical ids), but the consuming code was
  written using the names array for matching. Pre-dates SWR
  migration.
- **Fix**: 4 edits in 2 files.
  - menu/page.tsx: added platosIds field to derived promos useMemo;
    replaced 2 name-match call sites with id-match.
  - [slug]/page.tsx: replaced 1 name-match call site in
    combosVisibles; cleaned up 1 dead fallback.
- **Where**: src/app/menu/page.tsx (L155-160, L578-593, L2051-2056),
  src/app/[slug]/page.tsx (L195-200, L1446).

### BL.15 ✅ Combos and promos jump positions after UPDATE — CLOSED
- **Closed**: 2026-05-17.
- **Found**: 2026-05-17 during BL.14 smoke test. User noticed that
  toggling a combo's activo status (e.g. "Día de la madre") caused
  the row to move to the bottom of the list.
- **Root cause**: Neither the public nor admin fetchers in
  useCombos/usePromos specify .order(). Postgres returns rows in
  implementation-defined sequential-scan order. Under MVCC, any
  UPDATE writes a new tuple that surfaces last in subsequent scans,
  making the row appear to "jump" to the bottom. This was a
  pre-existing latent bug that became noticeable only after BL.14
  eliminated the flicker that previously masked it. Affects all
  UPDATE operations (toggle, edit, etc.), not just toggles.
  Could also produce inconsistent ordering between admin and public
  views since both rely on Postgres default behavior.
- **Fix**: Added `.order('created_at', { ascending: false })` to
  all 4 fetchers (public + admin × combos + promos). Now:
  - Newest items appear first.
  - Order is stable: UPDATE doesn't change created_at.
  - Admin and public ordering consistent (apart from activo filter).
- **Future**: If owners want manual reordering (drag/drop or arrows),
  a future BL would add an `orden` column to combos/promos tables
  (mirroring BL.9 for categorias/platos) and switch the .order() to
  'orden' ASC.
- **Where**: src/hooks/data/useCombos.ts, src/hooks/data/usePromos.ts.

### BL.14 ✅ Toggle flicker in /menu (combos, promos, agotar plato) — CLOSED
- **Closed**: 2026-05-13.
- **Found**: 2026-05-13 during smoke test after H.1.c.2.a.
- **Symptom**: Clicking toggle switches for combos, promos, or the
  "Agotar" button on plato cards showed a brief visual flicker:
  the UI didn't update immediately, and during the revalidation
  window (~200-400ms) intermediate cache states could briefly
  render empty data.
- **Root cause**: After H.1.c.2.a, toggle handlers performed the
  DB UPDATE, then called invalidateAll(prefix) which forces a full
  re-fetch from DB. During the network round-trip, the SWR cache
  transitioned through intermediate states.
- **Fix**: Optimistic updates pattern. Each toggle now:
  1. Mutates the admin-variant SWR cache immediately with the new
     state (revalidate: false).
  2. Awaits the DB UPDATE.
  3. On success, invalidateAll to revalidate both admin and public
     variants.
  4. On DB error, calls invalidateAll to revert to DB truth.
  Same pattern as BL.9 reorder, proven reliable.
- **Where**: src/app/menu/page.tsx — toggleCombo, togglePromo,
  toggleDisponible.
- **Follow-up (2026-05-17)**: Initial optimistic update fix worked
  for the toggle state itself, but residual flicker remained because
  invalidateAll's revalidation passes the SWR cache through an
  undefined state briefly. The combos/promos JSX treated
  `combos.length === 0` as "empty state" even during revalidation.
  Updated the conditions to also require combosSwr !== undefined /
  promosSwr !== undefined before showing the empty state. Loading
  state now falls through to the populated branch (which renders
  empty gracefully).
- **Follow-up #2 (2026-05-17)**: The previous follow-up surfaced a
  deeper bug: clicking a toggle now showed a brief BLANK SCREEN
  instead of "Sin combos". Root cause: invalidateAll was defined as
  `globalMutate(matcher, undefined, { revalidate: true })`. The
  undefined second arg synchronously WRITES undefined into the
  cache before the refetch resolves, causing combosSwr to flicker
  through undefined for the ~200-400ms fetch window. The combos
  useMemo (`if (!combosSwr) return []`) returned [], and
  combos.map([]) rendered nothing, leaving a blank list.
  Fix: added `populateCache: false` to the invalidateAll mutate
  options. SWR now revalidates without clearing the existing cache,
  so subscribers see the stale (still-correct) data during the
  refetch. This one-line change benefits ALL ~22 callers of
  invalidateAll, not just the toggle handlers — any prior latent
  flicker in those flows is also eliminated.

### BL.13 🟡 Extract /menu form sections to separate memoized components — DEFERRED
- **Found**: 2026-05-13 during BL.12 fix (input lag remediation).
- **Symptom**: Even after BL.12's memoization fix (Level 1+2), some
  residual input lag may remain in form inputs because /menu is a
  monolithic 2500-line component holding 67 useStates. Every form
  keystroke still re-renders the full categoria × plato list and the
  unmemoized inline JSX of the open form section.
- **Proposed fix (Level 3)**: Extract each form into its own React
  component wrapped in React.memo:
  - <ComboForm />, <PromoForm />, <PlatoDelDiaForm />, <PlatoGanadorForm />,
    <CategoriaForm />, <PlatoForm />.
  - Each form receives only the props it needs (todosPlatos,
    horariosPorPlato, save/cancel handlers as stable useCallback refs).
  - The parent /menu component would no longer re-render the form on
    every keystroke; only the form component itself.
- **Estimated effort**: ~1.5-2 hours of refactor + extensive smoke
  test. High risk of subtle regressions (BL.3, BL.4, BL.8 validations;
  BL.9 reorder; BL.10 persistence).
- **Priority**: 🟡 medium — depends on whether residual lag is
  user-visible. Consider bundling with F2 (refactor [slug]/page.tsx)
  since both pages share similar monolithic patterns.
- **Status**: DEFERRED. Awaiting decision in a future session.
- **Where**: src/app/menu/page.tsx — form sections under tabActiva ===
  'combos' subtabs.

### BL.12 ✅ Input lag in /menu form inputs — CLOSED
- **Closed**: 2026-05-13.
- **Found**: 2026-05-13 during smoke test after H.1.c.2.a deploy.
- **Symptom**: Typing in form inputs (new category, new plato,
  combo name, promo name, plato del día precio especial, etc.)
  felt noticeably laggy. Search inputs were fluid.
- **Root cause**: Every keystroke re-rendered the full /menu
  component (2500 lines, 67 useStates). Inside the re-render,
  several expensive computations ran inline without memoization:
  - getHorarioPlato did O(categorias) linear scan per call.
    Form selector lists called it once per plato → O(totalPlatos²)
    per keystroke.
  - platoDiaOptions and platoGanadorOptions rebuilt the full plato
    list from scratch on every render.
  - precioIndividualCombo did flatMap + find inline per render.
  - categorias.flatMap(c => c.platos) appeared in ~10+ places,
    each O(totalPlatos).
- **Fix**: Level 1 — Precomputed horariosPorPlato Map via useMemo,
  making getHorarioPlato O(1). Level 2 — Memoized todosPlatos,
  precioIndividualCombo, platoDiaOptions, platoGanadorOptions via
  useMemo. Replaced ~10 inline categorias.flatMap usages with
  todosPlatos. Did NOT extract forms to separate components (left
  as deferred deuda técnica, would be ~2h refactor for marginal
  additional gain).
- **Where**: src/app/menu/page.tsx.

### BL.11 ✅ Plato ganador modal incorrectly applies plato del día discount — CLOSED
- **Closed**: 2026-05-13.
- **Found**: 2026-05-10 during Batch G smoke test (documented in
  sessions before this). Originally flagged as part of BL.8 but
  only the form-side validation was fixed there. The public menu
  rendering side remained broken when legacy data has the collision.
- **Symptom**: When the same plato is configured as both plato
  ganador and plato del día (only possible with legacy data from
  before BL.8 was shipped), clicking the "Recomendado del chef"
  card in the public menu opens the detail modal showing the
  "Plato del día" badge and discounted price, even though the
  card displayed full price.
- **Root cause**: platoDetalle state stored only the plato id, so
  the modal had no way to know which card opened it. The condition
  `platoDia.id === plato.id` was always true when the same plato
  served both roles, causing the modal to render plato del día
  behavior regardless of card source.
- **Fix**: Changed platoDetalle to carry source context:
  `{ id: string; modo: 'normal' | 'ganador' | 'platoDia' }`.
  All 5 call sites of setPlatoDetalle now pass the appropriate
  modo. The esPlatoDelDia condition (in modal badge/price and
  Agregar button logic) now requires modo !== 'ganador', so the
  ganador card path always renders the regular full-price view.
  Regular card and plato del día card paths preserve original
  behavior.
- **Where**: src/app/[slug]/page.tsx — platoDetalle state, 5
  setPlatoDetalle call sites, modal lookup, 2 esPlatoDelDia
  conditions.

### BL.10 ✅ Plato del día / ganador persistence broken after H.1.c.2.a — CLOSED
- **Closed**: 2026-05-13. Bundled with H.1.c.2.a commit.
- **Found**: 2026-05-13 via browser-automation smoke test.
- **Symptom**: After saving plato del día or plato ganador, the form
  appeared to save (INSERT returned 201) but on page reload, the
  form was empty. Button never changed from "Guardar" to "Actualizar".
  "Desactivar" button never appeared. No "Guardando..." / "✓ Guardado"
  visual feedback.
- **Root cause**: The mutation pattern was UPDATE all rows to
  activo=false, then INSERT new row with activo=true. This left
  multiple rows in DB for the same restaurante (1 active + N inactive
  historical). The admin variant fetcher uses .maybeSingle() which
  throws when multiple rows exist, causing SWR to return null. The
  seed useEffect saw null and reset platoDiaActivo to false.
- **Fix**: Replaced UPDATE+INSERT pattern with DELETE+INSERT.
  Now exactly 0 or 1 row exists per restaurante in plato_del_dia
  and plato_ganador tables. maybeSingle never throws. Also added
  explicit local setPlatoDiaActivo(true) / setPlatoGanadorActivo(true)
  immediately after successful INSERT to provide instant UI feedback,
  not waiting for SWR revalidation.
- **Where**: src/app/menu/page.tsx — guardarPlatoDia,
  guardarPlatoGanador, desactivarPlatoDia, desactivarPlatoGanador.

### BL.9 ✅ Category/dish reordering doesn't persist — CLOSED
- **Closed**: 2026-05-13. Implemented alongside H.1.c.2.a.
- **Found**: 2026-05-13 during H.1.c.2.a investigation.
- **Symptom**: Before H.1.c.2.a, moverCategoria and moverPlato only
  reordered local state (no DB write); after a page reload, the
  original order returned. During H.1.c.2.a these became no-ops
  entirely because the local state mirror was replaced by SWR.
- **Fix**: Both functions now perform an optimistic SWR mutate
  (visual reorder before DB confirms), persist the swap via two
  parallel UPDATE queries on the `orden` field, then revalidate.
  On UPDATE error, revalidates to revert to DB truth.
- **Where**: src/app/menu/page.tsx — moverCategoria and moverPlato.

### BL.8 ✅ Plato configurado como ganador Y plato del día simultáneamente — CLOSED
- **Closed**: 2026-05-12.
- **Fix applied**: Option A — validate in /menu form to prevent selecting the same plato for both slots. Validation extends validarPlatoDia and validarPlatoGanador to receive the other form's active state as a second argument; collision produces a red-bordered Select with explicit error message and disables the Guardar button. Pre-existing collisions (configured before this fix) are also surfaced immediately on render.
- **Found**: 2026-05-10 during Batch G smoke test.
- **Symptom**: When the same plato is selected for both "plato ganador"
  (recomendado del chef) and "plato del día":
  - The public menu shows TWO cards for the same plato: one as
    "Recomendado del chef" at full price, another as "Plato del día"
    with discounted price.
  - Opening the detail modal from EITHER card shows the "Plato del día"
    badge and discounted price, because the modal derives its state from
    `platoDia.id === plato.id` regardless of which card was clicked.
  - Adding to cart from the ganador card adds at full price; adding
    from the plato del día card adds at discounted price. Same plato_id,
    two different precioUnitario values, depending on the entry point.
- **Where**: src/app/[slug]/page.tsx
  - Card de plato ganador rendering (~line where `platoGanadorVisible` is checked)
  - Card de plato del día rendering (~line where `platoDiaVisible` is checked)
  - Detail modal's `esPlatoDelDia` derivation (~line 1545)
- **Possible fixes** (decide UX first):
  - A: Validate in /menu form — prevent selecting the same plato for both slots.
  - B: In public menu, hide the ganador card if its plato is also the plato del día.
  - C: Make the ganador card respect the discounted price when they coincide.
  - D: Merge into a single hybrid card.
- **Priority**: 🟡 high — confusing for end customers (sees same plato at
  two prices). Affects trust. Bug is preexisting, not introduced by Batch G.

### BL.7 🟢 Public menu cache feels stale to owners testing changes
- **Found**: 2026-05-08.
- **Symptom**: Owners creating combos/promos in /menu and watching the
  public menu in another tab perceive a 30-60s delay before changes
  appear (SWR revalidate-on-focus + 5s deduping).
- **Not a bug** — SWR is working as designed. But owners testing their
  own menu may not understand why.
- **Possible fixes** (not urgent):
  - Add "Open public menu" button that opens a fresh tab on each click
  - Add a one-time tooltip "Refresh the public menu to see changes"
  - Reduce dedupingInterval (trade-off: more Supabase requests)
- **Priority**: 🟢 low — only affects owners during initial setup/testing.

### BL.6 ✅ Combo/promo half-created visibility (race fix) — CLOSED
- **Found**: 2026-05-08 during user testing.
- **Closed**: 2026-05-08.
- **Symptom**: When creating or editing a combo/promo with platos in
  /menu, the public menu (SWR-cached in another tab) could fetch the
  parent row between the parent INSERT and the junction-table INSERT,
  showing "INCLUYE 0 PLATOS" for ~5s until the next revalidation.
- **Fix**: Activo-flip pattern in agregarCombo, agregarPromo,
  actualizarCombo, actualizarPromo (src/app/menu/page.tsx):
  1. INSERT parent with activo: false (invisible to useCombos/usePromos
     fetchers, which filter .eq('activo', true))
  2. INSERT junction rows (with rollback on failure)
  3. UPDATE parent SET activo: true (or wasActive on update path)
- **Where**: src/app/menu/page.tsx (4 handlers).

### BL.5 ✅ Categoria type drift (horario vs hora) — CLOSED
- **Found**: 2026-05-06 during H.1.b commit 2.
- **Closed**: 2026-05-08.
- **Symptom**: src/types/index.ts:60-61 declared Categoria.horario_inicio
  and Categoria.horario_fin, but the DB and all consuming code use
  hora_inicio / hora_fin. The mismatch was invisible because the public
  menu's useEffect read Supabase data as any[].
- **Where**: src/types/index.ts (Categoria interface), all reads of
  cat.hora_inicio / cat.hora_fin in src/app/[slug]/page.tsx and
  src/app/menu/page.tsx.
- **Fix**: Renamed Categoria fields in types to match DB; removed 11
  any-casts that existed solely to bypass the drift.

### BL.4 ✅ Plato del día / Plato ganador: warn when precio especial >= precio original — CLOSED
- **Closed**: 2026-05-10. Implemented in Plato del día form only — Plato ganador form has no `precioEspecial` field (state shape: `{ platoId, titulo, descripcion }`), so the original-price comparison does not apply there.
- **Found**: 2026-04-30 during B.1.e investigation.
- **Symptom**: Owner can configure a "special price" higher than or equal to the original plato price. While there are legitimate edge cases (premium feature dishes, etc.), in 99% of cases this is a configuration mistake.
- **Acceptance**:
  - Soft warning (non-blocking, yellow/amber background) shown below the precioEspecial input when state.precioEspecial >= selected plato's original precio.
  - Warning text: "El precio especial es igual o mayor al precio original. ¿Es correcto?"
  - Does NOT prevent saving. User can dismiss visually by adjusting the price or proceeding.
- **Where**: src/app/menu/page.tsx — plato del día form, plato ganador form (same logic, both forms).
- **Priority**: 🟢 nice-to-have UX guard. Plan to bundle with batch G alongside BL.3.

### BL.3 ✅ Promo form: show final-price preview per plato — CLOSED
- **Closed**: 2026-05-10.
- **Found**: 2026-04-30 during B.1.d testing.
- **Symptom**: When configuring a promo with valor (descuento or precio_especial), the user has to do mental math to figure out what the final price will be. Promos with multiple platos selected at very different price points (e.g., $5.000 and $50.000) can produce surprising results — owner may unintentionally configure a promo where one plato becomes effectively free or another costs more than original.
- **Acceptance**:
  - For each selected plato, render its calculated final price based on promo.tipo:
    - tipo='descuento' → "Plato X: $original → $final (-Y%)"
    - tipo='precio_especial' → "Plato X: $original → $valor (ahorro $Z)"
    - tipo='dos_por_uno' → single line "Compra 2 lleva 1 gratis (ahorro 50% en el segundo)"
  - Style: green block matching the combo "Ahorro" block (var(--color-green-light), padding 12px, border-radius 8px).
  - Render only when: tipo is set AND (valor is filled OR tipo='dos_por_uno') AND platoIds.length > 0.
  - Place AFTER the dias circles, BEFORE the existing horario warning IIFE.
- **Where**: src/app/menu/page.tsx — promo form.
- **Priority**: 🟢 nice-to-have UX polish. Plan to bundle with batch G (visual polish).

### BL.2 ✅ menu_por_horario_activo dead toggle — CLOSED
- **Found**: 2026-04-29 during A.2.
- **Closed**: 2026-05-08.
- **Symptom**: The field still existed in `config_restaurante` (DB), the TypeScript types (`src/types/index.ts:205`), and the config form state (`src/app/config/page.tsx:38, 106, 354`).
- **Fix**: Removed from types, config form state, hydration, and plan-gate. DB column to be dropped 1–2 days later after production stability check.

### BL.1 ✅ Visibility windows don't auto-refresh — CLOSED
- **Found**: 2026-04-28
- **Closed**: 2026-05-06 in H.1.b commit 2 (useTick(60_000) wired in [slug]/page.tsx).
- **Symptom**: All time-based visibility (plato del día, categories, promos) was computed only at page load. A visitor with the menu open across a boundary saw stale state.
- **Where**: `src/app/[slug]/page.tsx` — `horaActual` was computed once at render, not reactive.
- **Fix**: useTick(60_000) hook forces re-render every minute, recomputing `ahora` and downstream visibility.

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
