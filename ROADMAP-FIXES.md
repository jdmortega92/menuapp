# MenuApp — Fix & Feature Roadmap

> **Audience**: Claude Code (Opus) working on the MenuApp codebase.
> **Owner**: Julian.
> **Last updated**: 2026-06-01.
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
  - ⏳ H.1.c.3 / H.1.c.2.c: dashboard + páginas chicas
    - ✅ /referidos: hook useReferidos + codegen con mutateRestaurante (closed 2026-06-10, REFACTOR-F1)
    - ✅ /qr: sin reads que migrar (eran writes de onboarding) → mutateRestaurante tras cada write (closed 2026-06-10, REFACTOR-F1)
    - ✅ /suscripcion: await mutateRestaurante tras cambio de plan (closed 2026-06-10, REFACTOR-F1)
    - ⏳ /dashboard: único pendiente — diferido a Refactor Fase 4

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
  - Resend account + verified domain (probably `menuapp.com.co`).
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

## F6. 🚀 Landing page — `menuapp.com.co`
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

Decision 2026-07-03: Julian mantiene $15k/$29k mensual ($150k/$290k anual, ~2 meses gratis) por conocimiento del mercado Popayan — $19k/$39k se percibe alto para el segmento. Los pilotos validan ESTE precio; subir despues es mas facil que bajar. Fuente unica: lib/planes.ts.

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

**Where**: src/app/menu/page.tsx — modify the `esBasico` photo upload gate. (Nota post-F3 2026-06-12: el gate ahora se RENDERIZA en src/components/menu-admin/PlatoEditPanel.tsx — prop `esBasico` que la página computa y baja; el contador de 5 fotos tocaría la página y/o el panel.)

**Acceptance criteria**:
- Free plan user can upload up to 5 photos across all dishes.
- 6th photo upload attempt blocked with clear upgrade message.
- Downgrade behavior is consistent and predictable (keep visible, block new uploads).

**Priority**: 🟡 important — should be done before launch to optimize conversion funnel.

**Effort estimate**: 2-3 hours.

**Implementado 2026-07-01** (ver STRATEGIC.2-IMPL en Items) con regla mas estricta que la propuesta de arriba: el "downgrade keeps 5 uploads" del default proposal NO aplica — fue_pago bloquea toda subida nueva tras un downgrade.

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

### DOMINIO ✅ menuapp.com.co comprado + correo corporativo configurado — CLOSED
- **Closed**: 2026-07-20. menuapp.co (domain squatter, USD 1.450) y menuapp.app (tomado) NO disponibles — se compro menuapp.com.co en Cloudflare (USD 15/ano, renovacion estable, WHOIS privacy incluido). Correo corporativo: contacto@menuapp.com.co via Zoho Mail (plan Forever Free tras trial de Mail Premium sin tarjeta cargada — cero riesgo de cobro). MX/SPF/DKIM configurados via autenticacion de un clic Zoho-Cloudflare.
- **SPF actual**: `v=spf1 include:zohomail.com ~all` — NOTA para F3.c/futuro: cuando se verifique menuapp.com.co en Resend, este registro se EDITA (se agrega include:resend ahi mismo), nunca se duplica un segundo SPF.
- **Pendiente**: flip de PUBLIC_BASE_URL en lib/urls.ts (Fase 5b, cuando se lance desde este dominio en vez de vercel.app); verificar menuapp.com.co en Resend (desbloquea emails reales, hoy sandbox); recordatorio revisar plan Zoho antes/despues del 10 de agosto (esperado: cae solo a Forever Free, sin tarjeta no hay riesgo de cobro).

### COLOR-PICKER ✅ Paleta curada + picker nativo domesticado en /config — CLOSED
- **Closed**: 2026-07-17. Julian detecto que el <input type=color> nativo (dialogo del sistema, swatches RGB de 1995, cero conciencia de contraste) era la ULTIMA UI no-MenuApp de la app — viviendo justamente en la pantalla de estetica.
- **Solucion (alcance contenido: NO se construyo un picker completo)**: 17 swatches curados aptos para restaurantes y seguros en contraste sobre fondo claro (terracotas, olivas, azules profundos, vinos, ambares, neutros calidos — la paleta es data, comentada como tal), estado seleccionado con ring + Check con color por luminancia, campo hex validado con Vista previa en vivo, y el input nativo degradado a escape discreto "mas colores..." para casos borde. Ruta de persistencia intacta.
- **Verificado**: tsc limpio, tests verdes, smoke en telefono (el dialogo nativo fuera del flujo principal — EL check).
- **Commit**: bda142e.

### DASHBOARD-VISUAL-2 ✅ Dropdown de cuenta + cajas de diagnostico con restyle — CLOSED
- **Closed**: 2026-07-17. Del segundo lote de mockups de Julian. Dropdown del avatar: burbujas de icono naranja-suave uniformes (ExternalLink/Crown/FileText/UserPlus via Icono.tsx), items de dos lineas, chevrons, excepciones semanticas (beneficio verde, logout rojo), handlers identicos. Cajas del diagnostico BL.32 — CORRECCION al analisis previo: "Rendimiento bajo"/"Recomendacion" NO eran Capa 2 diferida, YA EXISTIAN sin restyle (lo detecto Julian con screenshots de produccion); TODOS los tipos del diagnostico (no solo los 2 visibles) reciben burbuja por severidad + tokens de card, copy y logica intactos (el PDF consume diagnostico.mensaje).
- **Commit**: 407dc01.

### DASHBOARD-VISUAL ✅ Restyle del dashboard desde mockups del fundador, paleta de la casa — CLOSED
- **Closed**: 2026-07-16. Capa 1: SOLO presentacion de datos existentes. Headers uniformes (burbuja + titulo + subtitulo + pildora), stat cards con badge de comparacion + sparklines naranjas (la serie por dia YA viajaba en los hooks), embudo en barras horizontales, actividad con franja de insight, heatmap con leyenda + pico, Descargar reporte como card oscuro. Azul/violeta de mockups traducidos a paleta de la casa (veto documentado). BL.13 y derivados intactos.
- **DIFERIDO POR EL FUNDADOR (Capa 2, items propios post-lanzamiento)**: PLATOS-SIN-VISTAS, MOTOR-INSIGHTS-UMBRALES (alertas nuevas con umbrales — distinto del diagnostico BL.32 existente), GATE-HEATMAP (desbloqueo a 20 visitas), selector mensual (toca computeDashboardWindow).
- **Commit**: d4e3d19.

### UI-SWEEP-2 ✅ Emojis en ramas condicionales, guard flex-shrink, +Plato tonal — CLOSED
- **Closed**: 2026-07-15. Grep por PATRON cazo emojis en ramas condicionales: empty states -> lucide grandes gris; /qr compartir -> MessageCircle/Instagram/Facebook/ExternalLink. Bug de Julian: titulos largos comprimian el Folder -> flexShrink:0 en iconos/chevrons/pildoras + minWidth:0+ellipsis en texto de usuario, guard donde iconos conviven con texto de usuario. Jerarquia (Julian, patron tonal canonico): +Plato tonal naranja, Agotar texto plano.
- **Commit**: 6f3b316.

### CONFIRM-DELETE ✅ Confirmacion antes de toda destruccion real — CLOSED
- **Closed**: 2026-07-15. Julian detecto usando la app que combos y promos eliminaban SIN confirmacion. Sheet de platos extraido como ConfirmarEliminar compartido, enrutado por toda eliminacion real del barrido; copy por tipo, peligro + secundario. Desactivaciones reversibles deliberadamente sin confirmacion.
- **Commit**: 09c20c3.

### UI-POLISH-MOCKUPS ✅ Polish del /menu desde mockups del fundador — CLOSED
- **Closed**: 2026-07-15. Julian diseno mockups propios (iPhone, alta fidelidad) marcando en rojo lo deseado; se implemento SOLO lo marcado.
- **Cambios**: iconos en tabs principales (Utensils/Tag/Sparkles 18px heredando color de tab) y en sub-pildoras (Tag/BadgePercent/ConciergeBell/Trophy 16px) dentro de scroll horizontal sin barra con active-into-view (4 pildoras icono+label desbordan 360px). Ver mi menu promovido a primario + ExternalLink (primario de region header, sin conflicto con + Categoria de region contenido). Fix de jerarquia (observacion original de Julian): + Plato = naranja-texto constructivo (excepcion consciente al gris-en-reposo: ES la accion de crecimiento del menu); Agotar con presencia naranja-texto; badge de estado Agotado igualado en peso visual a Disponible. Header de categoria: Folder 16px + contador en pildora suave.
- **DESCARTADO CON VETO EXPLICITO DEL FUNDADOR (no resucitar como "mejoras obvias"; si alguna vuelve, es feature de producto con su propio item)**: busqueda en header, campana de notificaciones (sistema inexistente — icono mentiroso), Ordenar, toggle lista/grid, FAB central de QR (jerarquia incorrecta: QR se genera una vez), menu hamburguesa/drawer, card Resumen rapido (feature con datos, no polish).
- **Nota de proceso**: durante la investigacion CC intento abrir Claude-in-Chrome para verificar tipografia en vivo — DENEGADO. Regla nueva: CC no abre superficies no pedidas por el prompt (navegador, red, credenciales); si cree necesitarlas, reporta y se decide. La medicion de wrap se hizo por aritmetica de strings con supuestos declarados.
- **Verificado**: tsc limpio, tests verdes, smoke en telefono vertical (360px).
- **Commit**: 96a25f2.

### UI-PUBLICO ✅ Fase B: menu publico profesional con iconos que heredan del tema — CLOSED
- **Closed**: 2026-07-14. Cierra el arco de UI iniciado en UI-ADMIN: admin y publico hablan ahora un solo idioma de diseno.
- **REGLA ESTRUCTURAL**: los iconos del publico heredan del TEMA ACTIVO via currentColor y variables CSS de tema — NUNCA el naranja de marca. La identidad visual que el restaurante eligio es la duena de la superficie publica; MenuApp no compite con ella.
- **Fundacion primero**: colores de tema hardcodeados por componente migrados al sistema de variables ANTES de tocar iconos (mismo output visual por tema, ahora mantenible — los temas futuros heredan gratis).
- **Iconos (via Icono.tsx, size 18 — mas discretos que el admin: en un menu la estrella es la comida)**: dado de Sorprendeme -> Dices; estrellas de rating -> Star fill/stroke; X de modales (PlatoDetalle, ComboDetalle, Calificar, Pedido) -> X con area 44px + aria-label; chevrons de categorias; Plus dentro de los circulos de agregar (el fondo acento de cada tema intacto); steppers de cantidad. La estrella del chef CONSERVA su dorado — el unico protagonista autorizado (es un badge: su trabajo ES destacar).
- **Consistencia geometrica sin tocar matices**: tokens universales (--radio-boton, --transicion-ui, minimos tactiles 44px) aplicados a pressables publicos sin alterar el color de ningun tema. :focus-visible verificado por tema.
- **Smoke multi-tema de Julian**: recorrido completo del menu publico rotando temas + prueba del camaleon (serif premium vs naranja: los iconos se sienten nativos de cada uno) + flujo real de comensal desde el celular. Veredicto: "mejoro mucho".
- **Verificado**: tsc limpio, tests verdes. 11 archivos (+90/-52).
- **Commit**: 21747f3.

### UI-ADMIN ✅ Sistema visual profesional del admin: iconos, botones, tokens, disciplina naranja — CLOSED
- **Closed**: 2026-07-13. Motivacion de Julian: el admin se veia amateur — emojis/glifos como iconografia, botones sin jerarquia, cuatro colores compitiendo (naranja, azul, negro, rojo).
- **Sistema de iconos**: lucide-react via puente src/components/ui/Icono.tsx ("cambiar libreria o trazo SOLO aqui"). Reemplazo TOTAL de emojis/glifos en las 6 superficies admin + onboarding: chevrons de reordenar (area tactil 44px + aria-labels), X, camara, checks, candados, target. Colores via currentColor — cero hex nuevos.
- **Sistema de botones**: src/components/ui/Boton.tsx sobre tokens nuevos (--radio-boton, --altura-boton, --altura-boton-sm, --transicion-ui), variantes primario/secundario/terciario/peligro/oscuro x 2 tamanos, estados completos. Pildoras de tabs (Combos/Promos/Plato del dia/Ganador) eran elementos crudos con negro hardcodeado fuera del sistema — migradas.
- **DECISION DE MARCA (Julian)**: el primario de accion es el naranja zapote, NO el negro (incoherencia historica resuelta). El azul ELIMINADO por completo del admin (tabs, links-accion, nav inferior).
- **Disciplina de color final (direccion de arte de Julian, iterada en vivo)**: UNA accion dominante naranja por pantalla + seleccion naranja (nav inferior estilo Facebook: solo el item activo encendido). Acciones de fila (Agotar, +Plato, chevrons, lapiz): gris neutro en reposo + naranja en hover. X de eliminar: gris en reposo + ROJO en hover (advertencia al acercarse). Acciones reversibles de desactivar (plato del dia, ganador): variante oscuro (negro sobrio) — peligro reservado para destruccion real de datos. Toggles checked = naranja.
- **A11y**: :focus-visible global (el foco de teclado era invisible), aria-labels en pressables de solo-icono, areas tactiles 44px.
- **Fixes colados**: (1) useFacturas ordenaba por creada_en pero la columna real es created_at — 400 silencioso enmascarado como empty state (mismo patron fantasma del incidente RLS), detectado en smoke visual; (2) warning React de border shorthand vs borderColor en el hover de Boton.
- **Proceso**: 5 sesiones de CC (2 muertas por limite a mitad de vuelo, reconciliadas contra git status/diff — protocolo de reanudacion ya estandar). Smoke visual de Julian ANTES de cada commit. La direccion de arte se itero con screenshots reales, no en abstracto.
- **PENDIENTE — UI Fase B**: menu publico [slug] + temas (dado de Sorprendeme, estrella del chef, coherencia de iconos con las paletas por tema). Es la cara que ven los comensales.
- **Verificado**: tsc limpio, tests verdes, smoke visual en dev + celular.
- **Commits**: 8587fa0, 007de72.

### PDF-MOVIL ✅ Reporte PDF del dashboard mobile-first + unificacion render/PDF — CLOSED
- **Closed**: 2026-07-08. Motivacion: los restauranteros abren el reporte desde WhatsApp en el celular; el layout A4 previo (tipografia chica, pares lado a lado) era ilegible a fit-to-width.
- **Layout**: A4 vertical conservado (imprime bien), UNA columna, escala tipografica grande (titulo ~20pt, secciones ~15-16pt, cuerpo 13-14pt, nada bajo 11pt), tarjetas de stats apiladas a lo ancho, saltos de pagina sin encabezados huerfanos. Multi-pagina esperado. Verificado por Julian en celular via WhatsApp (fit-to-width sin zoom).
- **Deuda AUDIT-DASH saldada (las 4 duplicaciones PDF-vs-render)**: el PDF consume diagnostico.mensaje directo (muerta la divergencia de wording que YA existia), y mejor-dia, umbrales de color del heatmap y etiquetas de antiguedad leen de los mismos derivados del render. El PDF ya no puede diferir de la pantalla.
- **Nota**: contrato de invocacion click-time (consts declaradas despues en el componente) ahora documentado en la funcion.
- **Verificado**: tsc limpio, tests verdes, smoke movil OK. 1 archivo (+330/-297).
- **Commit**: 48f6bac.

### F4.a-1 ✅ Fundaciones de pago: fuente unica de precios + tabla facturas — CLOSED
- **Closed**: 2026-07-06. Primera fase de F4.a (ver F4-DISENO); cero llamadas a Wompi — todo el terreno listo para que F4.a-2 sea SOLO integracion.
- **Precios (decision final de Julian, registrada tambien en STRATEGIC.1)**: Basico $15.000/mes, Pro $29.000/mes — se mantienen los vigentes; $19k/$39k de STRATEGIC.1 se percibe alto para el segmento Popayan. Anuales NUEVOS: $150.000/$290.000 (~2 meses gratis, ~17%, estandar de industria). Los pilotos validan ESTE precio; subir despues es mas facil que bajar.
- **lib/planes.ts**: fuente UNICA de verdad — PLANES (id/nombre/precios/features) + helpers precioDe, ahorroAnual, centavosDe (amount_in_cents listo para Wompi). Con tests. Barrido completo de precios hardcodeados: cards de /suscripcion, upsells de /menu y /dashboard, y hasta la metadata SEO de layout.tsx (decia "Desde $15.000/mes" fijo). payments.ts pierde sus constantes stale (144k/278.4k, 20% off viejo) y queda como esqueleto para F4.a-2.
- **Sinceramientos**: plan_expira ahora string|null en types (era required jamas escrita — el webhook de F4.a-2 sera su primer escritor). Factura alineada a la tabla real.
- **Tabla facturas (Supabase, manual)**: schema de CC con numero/monto/metodo_pago/periodo_mes/periodo_ano/fecha_pago. RLS: duenos SOLO select de sus filas; SIN policies de escritura para authenticated A PROPOSITO (escribe el service role desde el webhook). facturas/page.tsx lee real via useFacturas (SWR), empty state hasta el primer pago.
- **INCIDENTE 1 (empaquetado)**: la receta de commits se dicto sin ver el diff real — useFacturas.ts quedo huerfano y rompio el build de Vercel (module not found; produccion NO cayo: sirvio el deploy anterior). Fix: commit 6dcd98e + barrido de 3 modificados restantes. NUEVA REGLA: los prompts de implementacion exigen lista exhaustiva de archivos tocados como seccion final; los commits se escriben contra esa lista.
- **INCIDENTE 2 (SQL parcial silencioso)**: la tabla existia de una corrida previa que murio a mitad de bloque — RLS activado pero CERO policies (default deny). Indistinguible del empty state legitimo con tabla vacia: el dueno habria visto /facturas vacia DESPUES de su primer pago real. Detectado por verificacion pieza-por-pieza; policy creada y verificada. NUEVA REGLA: todo SQL multi-sentencia en Supabase se verifica pieza por pieza (tabla, RLS flag, policies, indices) — ya van dos corridas muertas a mitad de bloque.
- **Verificado**: tsc limpio, tests verdes (275 + planes), deploy Vercel verde, smoke: precios correctos en /suscripcion (toggle anual con badge de ahorro), upsells y SEO; /facturas con empty state y RLS funcional.
- **Commits**: 6bbe541, 64c1a2d, 1944e5e, 6dcd98e, + barrido final de menu/dashboard/layout.
- **Siguiente**: F4.a-2 — endpoint checkout con firma de integridad, widget en /suscripcion, webhook con verificacion + service role. Julian: intentar registro sandbox Wompi (pub_test_/prv_test_) antes de esa sesion.

### F4-DISENO 📌 Wompi: hallazgo clave + faseo de implementacion — NOTA
- **Registrado**: 2026-07-02, tras investigacion doble (mapa del repo por CC + docs actuales de Wompi). Complementa F4-DECISIONES.
- **HALLAZGO CLAVE**: Wompi Colombia NO tiene suscripciones gestionadas nativas. Ofrece tokenizacion + payment sources (el cliente ingresa tarjeta/Nequi UNA vez, con 3D Secure inicial y acceptance token obligatorio) y el comercio cobra via API cuando decide. La recurrencia (cuando cobrar, reintentos, dunning) la construye MenuApp — nuestro cron diario pasa de "red de seguridad" a MOTOR DE COBRO. Idempotencia por reference obligatoria para no cobrar doble.
- **Faseo**: F4.a checkout de pago unico + webhook (firma verificada, service role, escribe plan + plan_expira + inserta factura; LANZABLE solo — renovacion manual al vencer). F4.b diferido + cron (plan_programado/fecha_cambio_programado, banner de retencion, ejecutor COT; incluye extraer el envio de email a funcion server sin cookies — bloqueador detectado: api/emails exige sesion y webhook/cron no tienen). F4.c recurrencia (payment source + cobro automatico por cron; DIFERIBLE post-lanzamiento si los pilotos toleran renovar manual). F4.d facturacion DIAN via Alegra (consume las facturas de F4.a; independiente, al final).
- **Deudas pre-F4.a**: (1) unificar fuente de precios — payments.ts tiene $15k/$29k viejos vs planes hardcodeados en /suscripcion; decidir STRATEGIC.1 ($19k/$39k) al cablear la fuente unica; (2) sincerar plan_expira en types (declarada required, JAMAS escrita ni leida — el select('*') castea null); (3) payments.ts es codigo muerto total (crearPago sin call sites) pero su shape de 4 campos coincide con Checkout Web de Wompi — esqueleto reutilizable.
- **Infra nueva que F4 introduce**: SUPABASE_SERVICE_ROLE_KEY + lib/supabase-admin.ts (sin precedente en el repo), WOMPI_EVENTS_SECRET / WOMPI_INTEGRITY_SECRET / NEXT_PUBLIC_WOMPI_PUBLIC_KEY, CRON_SECRET, vercel.json con cron "0 5 * * *" UTC (= medianoche COT; Hobby plan: crons diarios, hora imprecisa dentro de la ventana — valido para ejecutor, no para nada time-sensitive).
- **Tramites paralelos (Julian, sin fecha)**: contador (persona natural vs SAS), dominio menuapp.com.co (ahora triple rol: email fiscal + Resend/F3.c + F6), cuenta bancaria, cuenta de comercio Wompi AL FINAL. Todo F4-codigo se construye contra sandbox de Wompi sin cuenta.

### F3-MVP ✅ Emails transaccionales via Resend (bienvenida + cambio de plan) — CLOSED
- **Closed**: 2026-07-02. MVP de F3 con sandbox de Resend (onboarding@resend.dev); el dominio menuapp.com.co queda como PREREQUISITO DURO de F7 (el sandbox solo entrega al email del dueno de la cuenta — verificado en smoke: cuentas de prueba con otros correos no reciben nada, comportamiento esperado).
- **Arquitectura**: segundo route handler del repo (src/app/api/emails/route.ts, POST) adoptando lib/supabase-server.ts (antes codigo muerto). Identidad NUNCA del body: 401 sin sesion, destinatario del auth.getUser(), restaurante leido por usuario_id. Modulo src/lib/email/ con EMAIL_FROM como constante unica (flip de una linea a menuapp.com.co, espejo de PUBLIC_BASE_URL), cliente Resend lazy (no rompe builds sin key), templates HTML inline-CSS en paleta MenuApp con escaparHtml y fallback texto plano. RESEND_API_KEY = primera env var server-only del repo (sin NEXT_PUBLIC_).
- **Emails**: bienvenida (al crear restaurante; idempotente via columna bienvenida_enviada, migracion manual Supabase, fail-closed si la lectura falla) y cambio_plan (upgrade/downgrade/periodo con copy propio por caso). Triggers fire-and-forget en registro (2 paths), completa-perfil y suscripcion — nunca bloquean la navegacion.
- **Fix post-smoke (35c5caf)**: el email era ciego al periodo — cambio pro mensual->anual no disparaba nada. Encontrado por Julian en smoke. Ahora el guard dispara por plan O periodo, copy dedicado para cambio solo-facturacion, y el periodo se nombra en subject/heading de planes pagos. Side fix en cambiarPlan: el error del update de restaurantes (antes ignorado) ahora gatea el email.
- **Diferidos explicitos**: F3.b (email de pedido al dueno) — requiere SUPABASE_SERVICE_ROLE_KEY (el comensal es anonimo; el server debe resolver dueno con privilegios), acoplar a F4 que probablemente trae el service role por webhooks. F3.c (signup confirmation + password reset con marca) — es SMTP custom de Supabase apuntando a Resend, config de dashboard no codigo, requiere dominio verificado: acoplado a la compra del dominio.
- **Verificado**: tsc limpio, 275/275. Smoke completo: bienvenida, upgrade, downgrade, periodo-solo en ambas direcciones.
- **Commits**: 8f60fdd, 24eefcf, 35ac3aa, 35c5caf.
- **Where**: src/lib/email/** (+sender, base, bienvenida, cambioPlan), src/app/api/emails/route.ts, src/app/{registro,completa-perfil,suscripcion}/page.tsx.

### F4-DECISIONES 📌 Modelo de suscripcion pre-decidido para F4 (Wompi) — NOTA
- **Registrado**: 2026-07-02. Decisiones de producto tomadas ANTES de F4 para que su investigacion pregunte COMO, no QUE:
- **Upgrade = ciclo nuevo**: paga el plan nuevo completo hoy, la fecha de renovacion se resetea. Sin prorrateo (evita cobros parciales en Wompi y montos raros; la complejidad DIAN real de F4 es la facturacion electronica en si, no los decimales).
- **Downgrade = diferido al fin del ciclo pagado**: el cambio se agenda, el cliente conserva lo que pago. Requiere columnas plan_programado + fecha_cambio_programado en restaurantes y un ejecutor.
- **Ejecutor hibrido**: webhook de Wompi como camino principal + Vercel Cron diario como red de seguridad. CONSTRAINT de huso (familia BL.29/BL.41): Vercel Cron corre en UTC — la logica temporal se ancla a COT (fechaColombia), nunca al reloj del servidor.
- **Bonus de retencion**: banner en admin "Tu plan cambiara a X el [fecha] — [Cancelar cambio]" sale casi gratis de las columnas.
- **Esquina a decidir en F4**: upgrade DURANTE un downgrade programado (casi seguro cancela el plan_programado, pero debe quedar escrito). Tambien: politica de pagos fallidos de renovacion (reintentos/gracia) sera manual en v1.
- **Efecto en F3**: cuando exista el diferido, el copy de downgrade de cambioPlan.ts cambia de "ya esta aplicado" a "cambiara el [fecha]".

### BL.42 🟢 Gates de foto no migrados a mostrarFotos (consistencia) + leak en CalificarModal — PENDIENTE
- **Found**: 2026-07-01 (implementacion de STRATEGIC.2).
- **Symptom**: (a) ComboDetalleModal.tsx:146 y PlatoGanadorHero.tsx:51 siguen gateando fotos de platos con esBasicoPublico en vez de mostrarFotos — hoy inerte (ambas superficies son Pro-only) pero es deuda de consistencia de la regla; (b) CalificarModal.tsx:123 renderiza plato.foto_url SIN gate de plan — una cuenta fue_pago en gratis con calificaciones activas filtraria sus fotos "ocultas" ahi. Hoy inalcanzable (calificaciones es Pro) pero es un leak latente si el gating de features cambia.
- **Fix sugerido**: migrar los 3 sitios a la prop mostrarFotos (misma mecanica que PlatoCard/PlatoDetalleModal).
- **Where**: src/components/menu-publico/ComboDetalleModal.tsx, PlatoGanadorHero.tsx, CalificarModal.tsx.
- **Priority**: 🟢 (inerte al gating actual; atacar en el proximo barrido del publico).

### STRATEGIC.2-IMPL ✅ Limite de 5 fotos en plan gratis (arquitectura fue_pago) — CLOSED
- **Closed**: 2026-07-01. Implementa STRATEGIC.2 con la regla FINAL de Julian: las 5 fotos son de cuentas NUNCA-pagas, no un derecho del plan gratis.
- **Arquitectura**: restaurantes.fue_pago boolean (latch one-way: cualquier upgrade lo deja true para siempre; el downgrade NO lo resetea). Migracion + backfill manuales en Supabase (cuentas pagas actuales -> true; gratis con fotos -> true por implicacion). Regla centralizada en lib/fotosGate.ts (puedeSubirFoto, mostrarFotosPublico, LIMITE_FOTOS_GRATIS=5) consumida por ambas superficies, con 8 tests (suite 267->275).
- **Semantica**: cupo VIVO, no presupuesto de por vida — borrar libera cupo; REEMPLAZAR una foto existente no lo consume (upsert al mismo path, regla de call-site en fotoBloqueada). fue_pago en gratis: cero subidas (incluso reemplazo) y fotos existentes ocultas en el publico (comportamiento previo preservado). Nunca-pago en gratis: hasta 5 fotos vivas Y visibles en el publico (comportamiento NUEVO). logo/banner excluidos (siguen con esBasicoPublico).
- **Superficies**: (1) /suscripcion setea fue_pago: true en el unico write de plan del repo (verificado por grep: registro/completa-perfil insertan gratis sin tocarlo); (2) admin: fotosUsadas + puedeSubirFoto computados en /menu y bajados via CategoriaSection a PlatoEditPanel con 3 estados (control + contador "X de 5" / limite con upsell card / fue_pago con aviso de fotos ocultas), guard fotoBloqueada en seleccionarFoto Y confirmarRecorte (re-chequeo al confirmar el crop), avisos via mostrarAviso; (3) publico: mostrarFotos computado UNA vez en [slug] y bajado como prop a PlatoCard, PlatoDetalleModal y el bloque sorprendeme.
- **Nota BL.13**: el guard vivo obligo a mover seleccionarFoto al patron liveHandlers (delegado estable useCallback [] + cuerpo vivo seleccionarFotoLive) para no romper el contrato de identidades estables de las secciones memoizadas.
- **Enforcement**: client-side (consistente con todo el gating de planes). Hardening RLS/storage policy queda como opcion post-lanzamiento.
- **Verificado**: tsc limpio, 275/275. 10 archivos (+~155/-~40). Commits: fa3976a, d33dea6, 8fe2a2b.
- **Where**: src/lib/fotosGate.ts (+test), src/types/index.ts, src/app/suscripcion/page.tsx, src/app/menu/page.tsx, src/components/menu-admin/{CategoriaSection,PlatoEditPanel}.tsx, src/app/[slug]/page.tsx, src/components/menu-publico/{PlatoCard,PlatoDetalleModal}.tsx.

### AUDIT-DASH ✅ Auditoria post-F4 del sistema dashboard + cleanup quirurgico — CLOSED
- **Closed**: 2026-07-01. Auditoria read-only de las 5 piezas (page 2.305 lineas + 3 hooks SWR + lib/dashboardWindow) tras cerrar F4/F5a, seguida de un chore de 1 commit.
- **Fixes**: borrados maxEscaneo, textoFiltro y embudoData.fuga (cero lectores; fuga quedo huerfana cuando BL.31 movio el embudo a 2 etapas). Flags esHoy/esFuturo anclados a window.hoyStr (fetch-time COT) en vez de una Date del render del memo — siempre describen el mismo "hoy" que las filas (keepPreviousData podia desincronizarlos cruzando medianoche COT).
- **Hallazgos documentados sin fix** (deuda dirigida): (a) inventario timezone completo alimenta BL.41, incl. comentario stale ~L250 que aun dice "-5h de fechaColombia"; (b) over-fetch en hooks alimenta BL.35 (ver nota alla); (c) duplicacion PDF-vs-render con potencial de divergencia: formula de mejor dia, copy del diagnostico (el PDF rearma el texto desde diagnostico.tipo en vez de usar .mensaje — wording YA difiere), umbrales de color del heatmap hardcodeados 2 veces, cadena ternaria de antiguedad duplicada; (d) sin UI de error SWR — fallos de fetch post-carga son silenciosos; (e) generarReportePDF referencia consts declaradas despues en el cuerpo — seguro SOLO porque el unico call site es el onClick (una llamada en render daria TDZ).
- **Verificado**: tsc limpio, 267/267 tests sin tocar. 1 archivo, +4/-5.
- **Where**: src/app/dashboard/page.tsx.

### REFACTOR-F5a ✅ Refactor Fase 5a: lib/fechas.ts a Intl America/Bogota — CLOSED
- **Closed**: 2026-06-30. Quinta fase (parte a) del plan de refactor. Reemplaza el offset absoluto -5h de lib/fechas.ts por manejo real de zona horaria vía Intl America/Bogota. Es un fix de CORRECTITUD/claridad, NO de comportamiento: Colombia es UTC-5 permanente sin horario de verano (desde 1993), así que el string 'YYYY-MM-DD' y el código de día son byte-idénticos al -5h para toda hora/fecha que la app maneja.
- **3 commits**: (1) test de caracterización (fechas.test.ts, 231 asserts: byte-parity de 24h x N fechas contra el oráculo -5h legacy inlineado, cruces de mes/año, prueba no-DST) + diaCodigoColombia hecho inyectable (param d = new Date()); (2) el swap: ambos cuerpos a Intl formatToParts con timeZone America/Bogota (formatToParts, NO toLocaleDateString, que varía separador entre versiones de ICU) + helper privado ymdColombia; (3) esta doc.
- **Byte-identidad probada**: los 231 asserts pasan contra la impl Intl SIN tocar el test; dashboardWindow.test.ts (que llama fechaColombia bajo TZ=UTC) sigue verde → cero ventanas del dashboard movidas. Sanity del borde BL.29: fechaColombia(2026-07-01T02:00Z) = '2026-06-30' bajo la nueva impl.
- **Fix incidental surfaceado**: el diaCodigoColombia viejo usaba .getDay() (local) mientras fechaColombia usaba UTC, así que el código de día viejo era sutilmente dependiente del huso y podía errar un día en un navegador real de Colombia cerca de medianoche. La versión Intl es tz-independiente-correcta: idéntica donde el viejo estaba bien, correcta donde estaba mal. Su único consumidor (nota informativa de PlatoDelDiaForm) no escribe ni bloquea → cero efecto de datos, solo la nota más correcta cerca de medianoche.
- **Suite 36 → 267** (los asserts de fechas). **Where**: src/lib/fechas.ts, src/lib/fechas.test.ts.
- **Deuda restante FUERA de este módulo** (mecánicas distintas, no tocadas): heatmap inline offset (dashboard horaColombia/diaColombia), lunesSemana getters locales (dashboardWindow.ts), y el reloj local de visibilidad → ver BL.41.
- **Estado plan maestro**: 1 fundaciones → 2 [slug] → 3 /menu → UI pass → 4 dashboard → 5a fechas (F5a) ✅ → queda SOLO 5b (dominio a menuapp.com.co, cerca del lanzamiento).

### REFACTOR-F4 ✅ Refactor Fase 4: migración de /dashboard a SWR (cierra serie H.1) — CLOSED
- **Closed**: 2026-06-30. Cuarta fase del plan de refactor. /dashboard era la ÚLTIMA lectura cruda (supabase.from en useEffect) de toda la app; ahora lee por SWR como el resto de páginas (/menu, /config, /referidos, /qr, /suscripcion, público [slug]). Cierra H.1.c.3 (el /dashboard "diferido a Fase 4" en la serie H.1) y por tanto la serie H.1 completa.
- **4 commits**, todos verificados (tsc --noEmit limpio + test suite verde + smoke en producción contra una línea base de números, periodo por periodo Hoy/Semana/Mes). La suite pasó de 28 a 36 tests (los 8 asserts del test de ventana). Commits:
  1. **computeDashboardWindow** (lib/dashboardWindow.ts): extracción VERBATIM de la matemática de ventana del dashboard (desde/hasta/desdeAnterior/hastaAnterior/lunesSemana/hoyStr) como función pura inyectable (periodo, ahora). Blindada con dashboardWindow.test.ts: 8 asserts pineando los 3 periodos contra fechas fijas bajo TZ=UTC (el entorno no-Colombia donde vivía el double-offset de BL.29) — el caso 2026-07-01T02:00Z resuelve 'mes' a JUNIO, probando que la rama 'mes' deriva de hoyStr (COT) y no de getters locales. Conserva la mezcla deliberada de mecánicas (lunesSemana con getters LOCALES de BL.30 vs el offset -5h absoluto de fechaColombia) sin "arreglarla" — ese fix es Fase 5a. + el hook useDashboardStats encima.
  2. **useDashboardLifetime + useDashboardAlertas**: lecturas INDEPENDIENTES del periodo (rating/reseñas lifetime, BL.32-B — en su propia cache key para que NO refetcheen al cambiar de periodo) y las alertas (par dependiente #13->#14: all-time solo si últimos-3-días da 0; #17 MTD gateada a plan gratis). Ventanas fijas replicadas verbatim. Sin test nuevo (fetchers delgados, sin lógica pura que pinear).
  3. **EL SWAP**: borrado del effect cargarStats (534 líneas) + los 12 useState de data; cableados los 3 hooks; TODAS las derivaciones post-fetch conservadas byte-for-byte (intersección de Sets del embudo BL.31, titular reconciliado vistasPlatosCurrent BL.32, rankings masVistos/interesBajo/sinVistas, heatmap+horariosPico, gráfico diasConFecha semana+mes, reseñas, statsAnterior, ensamblado de alertas) — solo cambió el ORIGEN de las filas (hooks en vez de supabase inline). 2 desviaciones reportadas y aprobadas: (a) mejorDia/peorDia eran ESTADO MUERTO (nunca renderizados; render/PDF recomputan mejorDiaSemana/mejorDiaResumen aparte) — eliminados, pero conservado el efecto observable del else (reset de platos a [] cuando no hay visitas-día); (b) keepPreviousData:true en useDashboardStats para que el toggle de periodo mantenga los números previos durante el refetch (replica el UX pre-migración, sin parpadeo a cero; mantiene el splash sin reaparecer en el toggle). Loading gate ahora deriva de los 3 isLoading. Verificado en producción: embudo 54->7 / 33 exploración, top 5, heatmap (lun 21-24h con 13, día muerto vie), gráfico (lun 1 con 16, prom 8/día) IDÉNTICOS a la base; el +1 de Hoy/Semana fue una visita real de Julian (no regresión — el embudo lo trató bien: contó la sesión menú pero no la de plato, porque no abrió detalle).
  4. **chore**: drop del import createClient huérfano (1 línea; tsconfig sin noUnusedLocals así que no rompía tsc, limpieza igual).
- **Forma SWR elegida** (Opción B, bundle): 3 hooks por granularidad de cache-key (stats por-periodo, lifetime, alertas) en vez de 1-hook-por-lectura (que duplicaría la matemática de ventana en 10 sitios y partiría la dependencia #6->#11). #6 (platos) se mantuvo DENTRO de useDashboardStats en vez de reusar useCategoriasYPlatos — autocontener la dependencia #6->#11 es más limpio que partirla entre 2 cache keys y evita arrastrar los joins de plato_variantes que el dashboard no necesita.
- **BL.35**: subsumido a MEDIAS — el Promise.all dentro de useDashboardStats convierte los ~13 awaits en serie en un batch concurrente (mitad "paralelizar" hecha). La mitad "índices DB" (Supabase) sigue ABIERTA, fuera de alcance de esta migración client-side.
- **Where**: src/lib/dashboardWindow.ts (+test), src/hooks/data/useDashboardStats.ts, src/hooks/data/useDashboardLifetime.ts, src/hooks/data/useDashboardAlertas.ts, src/app/dashboard/page.tsx.
- **Commits**: 441d063, ef59308, e52b39d, acdf109.
- **Estado del plan maestro**: 1 fundaciones (F1) → 2 [slug] (F2) → 3 /menu (F3) → UI pass (REFACTOR-UI) → 4 dashboard (F4) ✅ → queda SOLO Fase 5 (sweeps semánticos: 5a fechas con Intl/America-Bogota tocando solo lib/fechas.ts; 5b dominio a menuapp.com.co).

### REFACTOR-UI ✅ Pasada de UI senior: polish de menu-publico + menu-admin (entre Fases 3 y 4) — CLOSED
- **Closed**: 2026-06-22. El "UI pass" planificado en el plan maestro de refactor entre Fase 3 y Fase 4 (1 fundaciones → 2 [slug] → 3 /menu → UI pass → 4 dashboard → 5 sweeps). La condición era que la UI viviera en piezas chicas y tocables; tras REFACTOR-F2/F3 vivía así.
- **Alcance**: elevar la calidad visual de los componentes extraídos SIN tocar lógica, estado, data flow ni contratos de props. Inline styles + CSS variables (cero Tailwind/styled-components). Menú público validado a ~360px (donde viven los usuarios reales). Convención ajustada: las clases utility .tap-*/.tap-row en globals.css son el caso legítimo donde el CSS gana, porque los estilos inline no pueden expresar :active/:hover.
- **11 commits**, todos verificados (tsc --noEmit limpio + test suite verde) y en producción. La suite pasó de 14 a 28 tests (el helper brandTints trajo 14 asserts de parity). Lista de commits (en orden):
  1. **fix: CalificarModal sigue el tema activo** (swap de tokens globales a tokens de tema). Corrección, no polish: era la única superficie pública que no seguía el tema (caja clara sobre hoja oscura en oscuro/natural/premium). Incluye el textarea (bg+color).
  2. **tokens**: --color-rating, paleta --gold-* (placa fija del ganador), y --theme-radius-chip por tema (claro/oscuro 8px, natural 10px, premium 2px). Aditivo, consumido en commits siguientes.
  3. **fix: indicador "Abierto ahora"/"Cerrado" sigue el tema** (verde #2E7D32 hardcodeado → var(--color-green); --text-* globales del bloque meta → --theme-*). Header + landing.
  4. **refactor: helper lib/brandTints.ts** centraliza el patrón ${color}+alpha (14 sitios, 7 funciones: tintPlaceholder/washHero/washSutil/borderFuerte/borderSutil/glowBoton/gradientHeader). Pixel-idéntico por construcción, blindado con brandTints.test.ts. El #485 (border sólido sin alpha) quedó fuera a propósito (no es un tint).
  5. **polish: métricas de pastilla** de descuento/día unificadas con var(--theme-radius-chip) (16 pastillas). Context A (cards, filas apretadas) solo cambió radius → cero cambio de ancho en claro/oscuro; Context B (modal de detalle, full-width) 11px→10px + radius.
  6. **polish: tap-feedback en el menú público** via 4 clases CSS (.tap-card/.tap-cta/.tap-control/.tap-bar): transition + :active scale (+ shadow lift en cards, brightness en la bandeja fija). 22 elementos. Cero estado/handlers nuevos.
  7. **polish: paleta dorada del ganador tokenizada** a --gold-* + preview del admin emparejado con el hero real (antes usaba --color-warning-*). Placa fija en los 4 temas (decisión de diseño: es el elemento "signature").
  8. **polish: tap-feedback en botones bespoke del admin** (reusa .tap-control/.tap-cta del commit 6) + radios 8px → var(--radius-sm) (9 sitios). Sin tocar las utility classes globales .btn-*/.card/.input (consumidores fuera de alcance).
  9. **fix: QtyControl sigue el tema** (botón "-" usaba --border-light/--text-secondary globales → --theme-border/--theme-text-muted). Cierra el último leak de tema del público (abierto en el commit 1).
  10. **polish: hit-area de los botones +/- de cantidad** agrandada a ~40px via clase .tap-target (::before transparente con inset:-7px) en los 3 qty controls (extraído + 2 bespoke). Cero cambio visual de tamaño (los círculos siguen 24/26/28px), cero wiring. inset<gap para no solapar zonas (evita mis-taps).
  11. **polish: press feedback en las filas del menú ⋯ del admin** via .tap-row (cambio de fondo, no scale, porque scale en filas anchas se ve mal). 3 filas (Renombrar/Horario/Eliminar); Eliminar usa .tap-row-danger (--color-danger-light). Las 2 filas de toggle de combo/promo quedaron fuera: ya dan feedback via su estado seleccionado (--color-info-light).
- **Decisiones de diseño clave (senior)**: pastilla con radio por-tema en vez de fijo (coherencia con cada identidad, sobre todo premium afilado); placa dorada del ganador fija across temas (gastar la audacia en un solo lugar); brand-tint via helper (opción b), NO color-mix (opción c cambia la matemática del blend = delta visual). Reconcile de QtyControl evaluado y RECHAZADO para esta pasada (ver track pendiente).
- **Track pendiente** (deliberadamente afuera, para futuras sesiones):
  - Reconcile de los 3 QtyControl a un componente: refactor real, no polish. PlatoDetalleModal tiene una máquina de estados distinta (cantidadMostrar floored-a-1 + "-" guardado/disabled); absorberlo exige props nuevos (min/removeDisabled) y re-verificar los 4 consumidores.
  - Focus states de teclado (div→button en CTAs/controles): estructural, riesgo de comportamiento.
  - 6 → realmente 0 filas de toggle pendientes (las 2 de combo/promo ya tienen feedback por selección).
  - ::placeholder del textarea de CalificarModal a --theme-text-subtle exacto (requiere regla CSS).
  - Ritmo de lista del admin (A-4): rediseño, decisión de producto.
  - Unificar el tamaño visual de los 3 qty controls (24/26/28 → uno): mueve layout por consistencia que el usuario no percibe; descartado salvo rediseño de modales.
- **Where**: src/app/globals.css (tokens + clases .tap-*/.tap-row), src/lib/brandTints.ts (+test), src/components/menu-publico/* (todos), src/components/menu-admin/* (VarianteEditor, CategoriaSection, PlatoCard, PromoForm, PlatoEditPanel, PlatoDelDiaForm, PlatoGanadorForm, HorarioCategoriaModal), src/components/ui/DiasSelector.tsx, src/app/[slug]/page.tsx.

### REFACTOR-F3 ✅ Refactor Fase 3: descomposición de /menu/page.tsx (admin) — CLOSED
- **Closed**: 2026-06-12. Tercera fase del plan de refactor. La página pasó de 3.945 a ~1.420 líneas (−64%) y de 72 a 19 useState (solo punteros, búsqueda, warnings y UI de tabs) en 12 commits (18a909d → 09e53ca). Cierra BL.13 (criterio de aceptación verificado en dispositivo: cero lag de tipeo; una tecla en cualquier form re-renderiza SOLO el subtree de ese form).
- **Commits**: 18a909d (VarianteEditor compartido), 3e2e5c9 (CategoriaForm, form plantilla), 4b137e6 (PlatoForm), 5e23ed2 (PlatoEditPanel), d77ab8d (prep: día/ganador derivados de SWR), a2cc824 (PlatoDelDiaForm), d4f696b (PlatoGanadorForm), 59e976c (ComboForm), 5279827 (PromoForm), 468fa8f (CropModal + lib/imagen), 1462304 (/config adopta CropModal), 09e53ca (memo de filas/secciones + riders rename/horario).
- **VarianteEditor compartido** (components/menu-admin/): mata la duplicación ~95% entre filas de variantes de crear y editar que BL.40 tuvo que parchear DOS veces a mano. Modo allowPendingDelete parametriza el ✕ (filtrar directo vs marcar _pendingDelete con Deshacer); la validación min-2-sobrevivientes queda fuera (validarPlato del dueño). construirTextoVinculaciones se exporta desde aquí.
- **Plantilla de form fresh-mount** (establecida en CategoriaForm, copiada en PlatoForm/PlatoEditPanel/ComboForm/PromoForm + el CategoriaRenameForm privado de CategoriaSection y HorarioCategoriaModal): la página conserva SOLO el puntero (mostrar/editando) y monta condicional; el form posee borrador + cuarteto intento/touched/guardando/guardado, validador como export module-level, React.memo, onClose estable (useCallback) — el fresh-mount reemplaza TODOS los resets manuales de abrir/cancelar/timer. Combo/promo: un solo form para crear/editar, keyed en editandoXId ?? 'new', siembra desde xInicial en el initializer; wasActive del registro inicial (editar un combo/promo pausado lo deja pausado).
- **Día/ganador con keyed fresh-mount en el id del registro SWR** (key={swr?.id ?? 'new'}, gateado en swr !== undefined): los efectos de seeding murieron — una revalidación de fondo del MISMO registro ya NO pisa una edición en curso (mejora real vs antes). Como esos guardados son delete+insert (id nuevo → remount), el tick "✓ Guardado" se muestra ANTES y el invalidateAll corre dentro del timeout de 1.2s (reorden tick-before-invalidate; sin él, el remount mataba el tick).
- **Flush co-locado**: registro + espejo en ref + commits + guardado viven los CUATRO dentro de PlatoForm y PlatoEditPanel (un registro local cada uno); el registro de página se ELIMINÓ. El invariante de lectura sincrónica (flush → leer ref → validar) ya no puede romperse desde la página. cascadeWarning (estado + modal + continuación que reanuda doSave) vive entero en PlatoEditPanel — la continuación nunca cruza un límite de componente (nota: Modal no es portal y el panel tiene fadeInUp con transform; seguro porque el modal solo abre post-click de Guardar).
- **Commit 5 (prep SWR)**: platoDiaActivo/platoGanadorActivo pasaron de espejos locales a derives de SWR; todos los consumidores de página (borrados, warnings, detectarAfectados, cross-check día↔ganador) leen el registro GUARDADO. BONUS: arregla un bug latente — con un borrador de ganador sin guardar, el pre-delete FK de eliminarPlato/eliminarCategoria podía apuntar a la fila EQUIVOCADA (la del draft) y el DELETE de platos fallaba por FK; ahora siempre apunta a la fila guardada. Cambio semántico aceptado: un borrador sin guardar ya no bloquea ni marca nada.
- **PromoForm**: detectarConflictoPromo/validarPromo con parámetros explícitos (state, promos, excludeId, todosPlatos) — auto-exclusión vía promoInicial?.id, corre contra la PROP promos viva. Advertencia preservada en comentario: limpiarPromosVacias es SOLO de los handlers de borrado, nunca de un guardado/efecto (la ventana de junction vacío de actualizar se comería la promo en edición).
- **CropModal compartido (components/ui/) + lib/imagen.ts**: recortarImagen parametrizado (ancho/alto, JPEG 0.82); el modal posee crop/zoom/croppedAreaPixels y entrega el BLOB por onConfirm; upload/persistencia por página. /menu (platos 800×450 16:9) y /config (logo 400×400 redondo, banner 1200×400 3:1) usan el MISMO componente; react-easy-crop ahora tiene un solo importador.
- **Commit 12 (payoff BL.13)**: CategoriaSection + PlatoCard memoizados (components/menu-admin/) con contrato de props escalar-o-estable; callbacks de fila estables vía ref-delegation (liveHandlers.current re-asignado por render, wrappers congelados — sin closures viejos NI identidades cambiantes); riders CategoriaRenameForm (privado de la sección) y HorarioCategoriaModal (recibe afectados YA computados por detectarAfectados, que sigue en la página). Fix lateral: los conteos del warning de borrar categoría ahora se computan sobre `categorias` SIN filtrar (antes, con búsqueda activa, contaban solo los platos visibles aunque el borrado destruye todos).
- **Commit 13 (CampoTexto a combo/promo/categoría) evaluado y OMITIDO**: verificado en dispositivo cero lag de tipeo tras el commit 12 — con el estado form-local, una tecla solo re-renderiza el form; la necesidad medida nunca se materializó. Revisitable si un profiler futuro dice lo contrario (el costo residual sería la lista de selección de platos O(platos) dentro de ComboForm/PromoForm).

### REFACTOR-F2 ✅ Refactor Fase 2: descomposición de [slug]/page.tsx (menú público) — CLOSED
- **Closed**: 2026-06-11. Segunda fase del plan de refactor. La página pasó de 2.872 a 820 líneas (−71%); ahora es estados + SWR hooks + logging + derivaciones + 3 hooks de dominio + ~600 líneas de JSX estructural + 8 componentes. Smoke completo verificado en dispositivo real (matriz BL.27/BL.28, modal de detalle con preselección BL.17, calificar anidado, WhatsApp end-to-end, vistas_platos 1 por apertura).
- **Commits**: cb9255d+fix (vitest + lib/cart.ts con los primeros 14 unit tests del repo: codec round-trips incl. empty-middle 'a____dia', UUID safety, precioEfectivo, enriquecerComboPlatos), 95bec8f (useMenuVisibility), 1eef5cb (usePromoIndices), 8498dfc (useCart + fix BL.28), 6d2d1da (QtyControl/BandejaFlotante/RestaurantLanding), dd9c607 (PedidoModal/ComboDetalleModal), f563401 (heroes + PlatoCard), 3654c66 (PlatoDetalleModal + CalificarModal anidado).
- **Hooks nuevos**: useMenuVisibility (cadena entera de visibilidad; `ahora` como parámetro desde el useTick de la página, sin memoización — recompute-per-render por diseño), usePromoIndices (índices + gating choke-point como params explícitos), useCart (pedido/preciosPromo/nota + handlers + itemsPedido sin memoizar + totales + pedirPorWhatsApp + limpiarNoDisponibles(esVisible)).
- **Componentes nuevos** (src/components/menu-publico/): QtyControl, BandejaFlotante, RestaurantLanding, PedidoModal, ComboDetalleModal, PlatoDiaHero, PlatoGanadorHero, PlatoCard, PlatoDetalleModal, CalificarModal. Sin React.memo en ninguno (props derivadas de visibilidad cambian cada render por diseño del tick). PlatoCard NO unificado con la card de sorpréndeme (8+ diferencias estructurales — decisión documentada en el header del componente).
- **Decisiones de arquitectura**: orden de extracción corregido por inversión de dependencias (visibilidad antes que índices de promo); qtyProps builder en la página como única fuente de stopPropagation; CalificarModal anidado en PlatoDetalleModal con stackLevel 1, cal-fields locales y reset por mount fresco; derivación cartKeySource encapsulada en el modal; narrowing aliases (platoDiaVisible = platoDia && raw) para preservar el type narrowing de TS tras mover flags a hooks.
- **preciosPromo re-semantizado**: ahora significa exactamente "specials congelados (dia/ganador)" — las escrituras para keys sin source se eliminaron (cero lectores tras el fix BL.28).

### REFACTOR-F1 ✅ Refactor Fase 1: fundaciones (libs compartidas + migraciones SWR chicas) — CLOSED
- **Closed**: 2026-06-10. Primera fase del plan de refactor de 5 fases derivado del censo del codebase (62% del código en 4 archivos; plan: 1 fundaciones → 2 [slug] → 3 /menu → UI pass → 4 dashboard → 5 sweeps semánticos).
- **Commits**: 8608302 (lib/fechas), 7299adb (lib/precio + lib/dias), 39905da (lib/urls + delete lib/whatsapp muerto), 861e52e (lib/analytics + CampoTexto a components/ui), b932e16 (SWR /qr /referidos /suscripcion).
- **lib/fechas.ts**: patrón -5h centralizado desde 8 sitios en 3 archivos (fechaColombia, diaCodigoColombia). Behavior-preserving a propósito; el fix semántico con Intl/America-Bogota es Fase 5a y cambia SOLO este archivo. Heatmap helpers del dashboard intactos (mecánica distinta, BL.29).
- **lib/precio.ts + lib/dias.ts**: formatoPrecio barrido en 49 sitios de precio ([slug] 19, menu 24, facturas 3, suscripcion 3; dashboard diferido a su fase); formatDiasShort/Full unificados en formatDias(dias, style).
- **lib/urls.ts**: PUBLIC_BASE_URL única fuente del dominio externo (QR funcional + link de referido, output byte-idéntico); la migración a menuapp.com.co flipea una constante (Fase 5b). String cosmético menuapp.com.co del QR intacto (copy de marketing). lib/whatsapp.ts borrado (cero imports; la extracción real saldrá del inline de [slug] en Fase 2).
- **lib/analytics.ts**: getSessionId + guard BL.34 (visitaYaLogueada/marcarVisitaLogueada, orden set-before-insert preservado). CampoTexto promovido a components/ui (flush registry queda en /menu; contrato type-level).
- **SWR (cierra la parte S de H.1.c.2.c)**: /qr no tenía reads que migrar (eran 2 writes de flags de onboarding) → mutateRestaurante tras cada write (checklist refleja sin reload, guards ven flag fresco); /referidos → hook nuevo useReferidos + codegen imperativo con mutate (BONUS: arregla staleness real preexistente — el link se compartía con ?ref= vacío en la primera visita hasta un refocus); /suscripcion → await mutateRestaurante antes de navegar (el dashboard monta con el plan nuevo en cache). Queda SOLO /dashboard (Fase 4).
- **Verificado**: smoke test en producción (fechas/precios/días idénticos, QR decodifica bien, link referido byte-idéntico, plan sin reload, tipeo fluido).

### BL.41 🟡 Visibilidad usa el reloj LOCAL del navegador (bug de huso para visitantes fuera de Colombia) — PENDIENTE
- **Found**: 2026-06-30 (durante la investigación de Fase 5a).
- **Symptom**: la lógica de visibilidad (abierto/cerrado, plato del día por horario, promos por día) se calcula con el reloj LOCAL del navegador (getHours/getMinutes/getDay sobre new Date()), no con la hora del RESTAURANTE. Un comensal con el celular en otro huso (turista, reloj mal configurado) vería ventanas de horario equivocadas: un restaurante abierto a las 8am Colombia podría verse "cerrado" para alguien con el teléfono 4h adelante.
- **Where**: src/hooks/useMenuVisibility.ts (~L35), src/lib/visibility.ts (~L14, L21).
- **Causa**: usa el reloj local crudo en vez de anclar a la zona del restaurante. Principio: la lógica de NEGOCIO temporal debe anclarse SIEMPRE al huso del restaurante; el huso del visitante solo debe afectar el DISPLAY ("hace 2 horas"), nunca decisiones (abierto/cerrado, qué promo aplica). Es el patrón "business timezone vs viewer timezone".
- **Solución (3 niveles)**: (N1, atajo) hardcodear -5h Colombia como fechaColombia — funciona hoy pero es suposición no declarada; (N2, canónico, OBJETIVO) el restaurante declara su timezone IANA ('America/Bogota') como campo de perfil y la visibilidad usa Intl con esa zona (mismo patrón formatToParts que F5a dejó listo) → correcto para cualquier país, soporta expansión futura; (N3, matiz) defaultear a 'America/Bogota' (todos los restaurantes hoy en Colombia) con override en config avanzada, sin pedir al dueño que entienda de husos. La Fase 5a deja el patrón Intl listo → este fix es una extensión natural, no un proyecto desde cero.
- **Priority**: 🟡 high — bug real pre-lanzamiento, pero NO urgente al scope actual (todos los restaurantes y comensales en Colombia, mismo huso). Atacar al expandir fuera de Colombia o si aparece un caso real.

### BL.40 ✅ Admin: filas de variantes cortadas en móvil (~360px) — RESUELTO
- **Found**: 2026-06-10 (testing en dispositivo real de Julian: en el editor de variantes de crear/editar plato, los botones ▲ ▼ ✕ quedaban cortados fuera del card; la fila de una sola línea [nombre flex | precio 90px | ▲ | ▼ | ✕] no entra en ~360px de ancho útil).
- **Resuelto**: 2026-06-10 (commit a5a4751). Layout de DOS líneas por variante (Opción B elegida sobre mockups visuales): línea 1 = inputs (nombre flex:1 minWidth:0 + precio fijo); línea 2 = ▲ ▼ ✕ alineados a la derecha con touch padding ampliado (6px 14px, antes 4px 6px). Divider sutil (borderBottom var(--border-light)) entre variantes consecutivas, excepto la última. Aplicado idéntico en los DOS forms (crear + editar). En el edit, las filas _pendingDelete conservan inputs/flechas deshabilitados pero PIERDEN el spacer invisible del ✕ (solo existía para alinear columnas en el layout viejo de una línea); el bloque Deshacer + nota y los mensajes de error por fila quedaron intactos. Validadores, infra de flush/commit y save handlers sin tocar.
- **Where**: src/app/menu/page.tsx (filas de variante create ~L2102 y edit ~L2484).
- **Priority**: 🟡 (controles inutilizables en móvil; el admin se usa principalmente desde el celular).

### BL.39 ✅ Público: bandeja flotante "Ver pedido" deformada con totales anchos — RESUELTO
- **Found**: 2026-06-10 (testing en dispositivo real: con un total ancho tipo $10.060.000, el bloque derecho precio + botón "Ver pedido" se salía de pantalla o se aplastaba).
- **Causa**: el flex space-between de la bandeja no tenía higiene de shrink — el bloque izquierdo (contador + resumen) sin flex:1/minWidth:0 no cedía espacio, y el derecho sin flexShrink:0 se comprimía.
- **Resuelto**: 2026-06-10 (commit 2fda92c). Izquierda flex:1 + minWidth:0 (el resumen ya truncaba con ellipsis; su maxWidth 200px hardcodeado pasó a 100% del padre ahora correctamente acotado); derecha flexShrink:0 + whiteSpace nowrap (precio y botón siempre completos); gap 12px entre bloques. Solo higiene flex, sin rediseño — fonts/colores/posición/handler intactos.
- **Where**: src/app/[slug]/page.tsx (bandeja flotante ~L1998).
- **Priority**: 🟡 (la bandeja es el CTA de conversión del menú público).

### BL.38 ✅ Acceso directo "Ver mi menú" en el admin — RESUELTO
- **Found**: 2026-06-09 (pedido de Julian: abrir el menú público en un clic desde el admin, sin pasar por la sección del QR).
- **Resuelto**: 2026-06-09 (commit 6bb3f02). Dos ubicaciones: (1) header de /menu — anchor btn-outline en el slot derecho vacío del flex, "estoy editando → verlo en vivo"; (2) primera fila del dropdown de perfil del dashboard, con branch external en el handler (window.open '_blank' noopener; las otras filas siguen en router.push, byte-identical). URL RELATIVA '/' + slug (sin dominio hardcodeado): funciona hoy en menuapp-iota.vercel.app y sobrevive la migración futura a menuapp.com.co sin cambios — a diferencia de /qr y /referidos que hardcodean el dominio (ver BL.37). Render solo cuando rest?.slug existe (sin slug placeholder; mejor ausente que roto).
- **Where**: src/app/menu/page.tsx (header ~L1824), src/app/dashboard/page.tsx (dropdown items array + handler ~L1430-1438).
- **Priority**: 🟢 (comodidad de uso del admin).

### BL.37 ✅ Selector de idioma decorativo oculto (+ hallazgo: dominios hardcodeados) — RESUELTO
- **Found**: 2026-06-09. La fila "Idioma" del dropdown de perfil del dashboard era puramente decorativa: href '#', sin estado, sin contexto, sin librería i18n en el repo. Solo existe español.
- **Resuelto**: 2026-06-09 (commit 6bb3f02). Comentada in place (no eliminada) con nota, para reactivarla cuando llegue i18n real. El campo Restaurante.idioma de la DB y sus writes en registro/completa-perfil quedaron intactos (independientes de la fila).
- **Hallazgo lateral (PENDIENTE, sin BL propio aún)**: la investigación reveló que /qr usa DOS dominios hardcodeados — menuapp.com.co (cosmético, hoy daría 404) y menuapp-iota.vercel.app (el funcional: QR canvas, clipboard, WhatsApp/Facebook share). /referidos también hardcodea vercel.app. Cuando se migre a menuapp.com.co (F6/F7), hay que barrer estos puntos; considerar centralizar en una constante o usar window.location.origin.
- **Where**: src/app/dashboard/page.tsx (~L1434).
- **Priority**: 🟢 (limpieza UI).

### BL.29 ✅ Dashboard: bug de huso horario en fechaColombia (doble offset) — RESUELTO
- **Found**: 2026-06-06 (auditoría del dashboard de estadísticas).
- **Causa**: fechaColombia (dashboard/page.tsx) calculaba el ajuste con signos cruzados — offsetCol escrito a mano como -300 vs getTimezoneOffset() que devuelve +300 para UTC-5 → restaba 10h en vez de 5h. Resultado: las ventanas de fecha rodaban un día hacia atrás entre 00:00–04:59 COT, y "este mes" quedaba en cero el día 1 antes de las 05:00 (desde=1ro pero hasta=hoyStr sesgado al mes anterior → desde > hasta).
- **Resuelto**: 2026-06-07 (commit cd18c8a). Reemplazado por la MISMA convención con que el menú público ESCRIBE fecha: new Date(d.getTime() - 5h).toISOString().split('T')[0] — independiente del huso del navegador, sin getTimezoneOffset(). Una fila escrita con fecha=X cae siempre dentro de la ventana que incluye X. Además: el año/mes de la rama 'mes' y el primerDiaMes de la alerta-4 ahora se derivan de la fecha COT corregida (hoyStr) en vez de getters locales del navegador. Solo lectura (límites de query / flags de display), sin escrituras. Los helpers del heatmap (horaColombia/diaColombia) ya eran correctos (mecánica distinta que cancela el offset) y no se tocaron.
- **Where**: src/app/dashboard/page.tsx (fechaColombia, rama 'mes', alerta-4).
- **Priority**: 🟡 high (números equivocados en horas tempranas / día 1 del mes).

### BL.30 ✅ Dashboard: ventanas 'semana' asimétricas y dos definiciones de "esta semana" — RESUELTO
- **Found**: 2026-06-06 (auditoría del dashboard).
- **Causa**: 'semana' era asimétrica — actual = 8 días inclusive (hoy-7..hoy) vs anterior = 7 días (hoy-14..hoy-8), sesgando la variación. Y había DOS definiciones de "esta semana" en la misma pantalla: el titular usaba la ventana rodante de 8 días, pero el gráfico "Actividad por día" mostraba la semana calendario lun-dom → el número del titular no cuadraba con la suma de las barras, y la etiqueta "día X de 7" contradecía la ventana rodante.
- **Resuelto**: 2026-06-07 (commit 099c4b3). Model B-fair: actual = lunes..hoy; anterior = lunes-pasado..mismo-día-de-la-semana-pasada (mismos días transcurridos → variación como-con-como, arregla la asimetría 8-vs-7 Y el sesgo de inicio de semana). lunesSemana unificado/hoisteado (fuente única reusada por la ventana y el gráfico). Barras del gráfico construidas vía fechaColombia (COT). El titular ahora ES igual a la suma de las barras del gráfico. 'hoy' (1v1) y 'mes' (mes-a-hoy vs mes anterior completo, por diseño) sin tocar. Solo lectura; sin cambiar la longitud de otras ventanas.
- **Where**: src/app/dashboard/page.tsx (bloque de ventanas 'semana', array del gráfico).
- **Priority**: 🟡 high (variación sesgada + dos números de "esta semana" que no cuadran).

### BL.31 ✅ Dashboard: embudo de conversión real por sesión (3 capas) — RESUELTO
- **Found**: 2026-06-06 (auditoría: el embudo trataba 3 métricas no comparables como un funnel anidado — visitasMenu=eventos de menú-abierto, vieronPlatos=eventos de plato-detalle (uno abre muchos), pidieron=pedidos → tasas >100% ("320% continuó explorando"), fuga negativa, etapa 3 > etapa 2, veredicto falso).
- **Goal**: reemplazar el embudo basado en conteo-de-eventos por uno real basado en sesiones únicas (visitas distintas), distinguible de las stat cards (que cuentan eventos).
- **Capa 1 — Schema (Supabase SQL, manual)**: columna session_id text NULL añadida a visitas_menu, vistas_platos y pedidos_whatsapp. Aditiva, sin default, sin FK; filas viejas quedan NULL (el embudo arranca desde la activación, las visitas previas no se incluyen).
- **Capa 2 — Logging (commit b4052d8)**: helper getSessionId() (id por-visita, cacheado en sessionStorage, crypto.randomUUID(), guard SSR typeof window, módulo-scope) escrito en los TRES inserts del menú público, así una visita (pestaña) comparte el mismo id en menu-open + cada plato-view + el pedido. Nueva pestaña/re-escaneo = nueva sesión. Solo se llama en effects/callbacks (post-hidratación), nunca en render.
- **Capa 3 — Dashboard (commit ab27224)**: reemplazado el embudo de event-ratio por conteos de sesiones DISTINTAS vía intersección de Sets en cliente, con subconjuntos ANIDADOS para monotonía (toda sesión de plato/pedido contada ⊆ las que abrieron el menú). Embudo de 2 etapas menú→pedido (los pedidos NO se gatean en plato-views, así los pedidos directos de combo/promo cuentan); la exploración de platos se muestra como métrica de engagement aparte, no como etapa intermedia. Todas las tasas 0-100% por construcción. Eliminado el benchmark sin fuente "promedio del sector (10%)" del dashboard Y del PDF. Filas legacy NULL excluidas (.not is null); caption "desde la activación del seguimiento por sesión".
- **Capa 4 — Labels (commit 07fd170)**: etapas del embudo renombradas a "Sesiones que abrieron el menú" / "Sesiones que pidieron" para distinguirlas de las stat cards (que cuentan eventos: ej. card "Pedidos WhatsApp: 2" vs embudo "1" = una sesión que pidió 2 veces), con subtítulo "Cuenta sesiones únicas (una visita = una sesión), no pedidos totales". PDF actualizado a juego ("Sesiones que ...").
- **Where**: src/app/[slug]/page.tsx (getSessionId + 3 inserts); src/app/dashboard/page.tsx (queries de sesión, embudoData, render, PDF); schema en Supabase (3 tablas).
- **Commits**: b4052d8 (logging), ab27224 (dashboard), 07fd170 (labels).
- **Priority**: 🟡 high (el embudo mostraba números imposibles al tier Pro).

### BL.32 ✅ Dashboard: tres fixes medium (gráfico 'mes', rating histórico, platos vistos reconciliado) — RESUELTO
- **Found**: 2026-06-06 (auditoría del dashboard).
- **Resuelto**: 2026-06-07 (commit 619f9c8).
  - **(A) Gráfico "Actividad por día" period-aware**: bajo 'mes' mostraba solo la semana actual (array fijo de 7 lun-dom) aunque fetchaba todo el mes → el resto se fetchaba y se descartaba. Ahora: 'semana' sigue lun-dom (preserva el comportamiento del window fix); 'mes' arma una barra por día desde el 1ro..hoy (el mes descubre su nº de días del rango, sin futuros). Las barras comprimen sin scroll (flex:1, gap más fino en mes), etiquetas dispersas en mes (número solo en 1, múltiplos de 5 y hoy; sin nombre de día). Forma de day-object preservada → el PDF y el resumen "mejor día" siguen funcionando igual. Fechas ancladas a mediodía para que el -5h de COT no cruce el límite de día.
  - **(B) Rating/reseñas lifetime etiquetadas**: calData (promedio) y resenasData (últimas) no tienen filtro de fecha (son históricos) pero viven bajo el contexto del periodo. Se mantienen lifetime (las reseñas son escasas; un rating de 7 días sería ruidoso/vacío), solo se etiquetan: subtítulo "histórico · N reseñas" en el card de rating y caption "de todo el historial" en "Últimas reseñas".
  - **(C) Titular "Platos vistos" reconciliado**: contaba TODAS las filas de vistas_platos (incl. platos eliminados) vía un count separado, mientras el desglose "Platos más vistos" cruza contra platos actuales → no cuadraban. Ahora el titular = suma de vistas SOLO sobre platos actuales (derivado de vistasData + platosInfo ya fetchados, sin query nueva); el periodo anterior se filtra simétricamente con .in('plato_id', currentPlatoIds) y guard de array vacío (sin platos actuales → 0, no "todas las filas").
- **Where**: src/app/dashboard/page.tsx (build de escaneosPorDia + render del gráfico; cards de rating/reseñas; derivación de stats.visitas + periodo anterior).
- **Priority**: 🟡 (A) misrepresenta el mes / 🟢 (B,C) menores.

### BL.33 ✅ Dashboard: claridad del resumen del gráfico mensual — RESUELTO
- **Found**: 2026-06-07 (usuarios confundidos: los números del eje no se leían como "días del mes" y "prom. X/día" era críptico).
- **Resuelto**: 2026-06-07 (commit 6a99739). Subtítulo del gráfico period-aware: en 'mes' muestra "{Mes Año} · días 1–N" (reusa contextoTemporal.rango / el array meses, sin hardcode) para que los números del eje se lean como días. Removido el "prom. X/día" abreviado; añadida una línea explícita "Promedio: N visitas por día" (singular "visita" si N===1) junto al resumen de "mejor día". El "Horario pico" (hora pico) se preservó intacto (texto y valor), ahora arriba de la línea de Promedio. Solo copy/labels; sin cambios de datos/cálculo/query. 'semana' sin cambios.
- **Where**: src/app/dashboard/page.tsx (subtítulo + bloque resumen del gráfico "Actividad por día").
- **Priority**: 🟢 (claridad/copy).

### BL.34 ✅ Visitas con doble/triple logging (sin dedup) — RESUELTO
- **Diagnóstico**: el effect que inserta en visitas_menu no tenía guard de dedup (StrictMode en dev, remounts), así que escribía 2-3 filas por visita. El embudo por sesión se auto-cura vía COUNT(DISTINCT session_id), pero la stat card cruda "Visitas al menú" quedaba inflada.
- **Resuelto**: 2026-06-10 (commit 1da2179). Guard de inserción única por sesión: flag en sessionStorage scopeado POR RESTAURANTE (menuapp_visita_logged_<restaurante_id>) seteado SINCRÓNICAMENTE ANTES del insert — crítico porque StrictMode re-dispara el efecto antes de que el primer insert resuelva; un flag post-insert no previene el segundo. Scope por restaurante para que escanear un segundo menú en la misma pestaña sí loguee su visita. Trade-off aceptado: si el insert falla por red, la visita no se reintenta en esa sesión (perder 1 fila > contar 2-3). vistas_platos y pedidos_whatsapp intactos (disparan por-plato/por-pedido por diseño). Verificado en Supabase: sesiones post-fix con exactamente 1 fila en visitas_menu.
- **Found**: 2026-06-06 (auditoría del dashboard; confirmado al cablear el embudo por sesión, BL.31).
- **Where**: src/app/[slug]/page.tsx (effect de insert de visitas_menu ~L180).
- **Priority**: 🟡 (inflaba un número visible, aunque el embudo no se veía afectado).

### BL.35 🟢 Dashboard: performance al cambiar de periodo — PENDIENTE
- **[PENDIENTE]**: cambiar de periodo (Hoy/Semana/Mes) re-corre todas las queries en serie cada vez. Optimización futura: paralelizar con Promise.all, añadir caching SWR para cambio de periodo instantáneo, y crear el índice DB (restaurante_id, fecha) en las tablas de alto volumen (sobre todo vistas_platos) cuando el volumen crezca. Mejor hacerlo junto con el refactor planeado. Nota del audit post-F4 (2026-07-01): sobre-fetch detectado — query #7 trae una columna fecha sin uso; #8 es derivable de #7; #1/#3a comparten filtros con #7 (un solo select de visitas_menu podria reemplazar 4 queries); resenas lifetime usa select('*'); platosAgotados trae id/nombre que no lee. Atacar junto con los indices DB.
- **Found**: 2026-06-06 (auditoría del dashboard).
- **Where**: src/app/dashboard/page.tsx (cargarStats); índices en Supabase.
- **Priority**: 🟢 (no urgente al volumen actual, pre-lanzamiento).

### BL.36 🟢 Embudo: mejoras futuras (RPC distinct + visitor id persistente) — PENDIENTE
- **[PENDIENTE]**: (1) cuando el volumen de vistas_platos crezca, mover el COUNT(DISTINCT session_id) a un RPC de Postgres (hoy es dedup client-side con Sets, que transfiere una fila por evento). (2) Opcional: un visitor id PERSISTENTE (cross-visita, distinto del session_id por-visita) para una métrica de retención/visitantes recurrentes, separada del embudo por-sesión.
- **Found**: 2026-06-06 (diseño del embudo por sesión, BL.31).
- **Where**: src/app/dashboard/page.tsx (queries del embudo); src/app/[slug]/page.tsx (logging); schema/RPC en Supabase.
- **Priority**: 🟢 (mejora futura, no urgente al volumen actual).

### BL.27 ✅ Promo en canasta no se sincroniza al editar/eliminar — RESUELTO
- **Found**: 2026-06-01 (reportado por Julian: al editar o eliminar una promo, no se actualizaba/desaparecía de la canasta del menú público; platos y combos sí lo hacían, promos no).
- **Causa**: en el menú público, una línea con promo congelaba su precio con descuento/2x1 en preciosPromo al agregarse y nunca se recalculaba. Platos/combos "se sincronizan" porque itemsPedido los re-deriva de los datos vivos en cada render; las promos quedaban afuera de ese mecanismo (precio congelado en estado, leído verbatim).
- **Resuelto**: 2026-06-01 (commit f702a5b). itemsPedido ahora re-deriva la promo de las líneas normales contra los índices vivos (effDiscount/has2x1) en vez de leer preciosPromo, usando el mismo base/cómputo/orden que agregarAlPedido (sin drift de redondeo). Editar promo → el precio/etiqueta de la línea se actualiza; eliminar o fuera de ventana → vuelve al precio normal y pierde la etiqueta, manteniendo la línea (el plato sigue válido); la cantidad NUNCA se toca (un 2x1 revertido queda como N unidades a precio normal). Día/ganador (source-tagged) quedan congelados, excluidos del recálculo. totalPedido, el mensaje de WhatsApp y el insert a pedidos_whatsapp.productos leen la promo derivada, así que se corrigen los tres a la vez. Decisión de Julian: recalcular siempre.
- **Where**: src/app/[slug]/page.tsx (itemsPedido ~L486).
- **Priority**: 🟡 high (bug funcional que afecta al cliente final / precio cobrado).

### BL.28 ✅ Stepping de cantidad del 2x1 usaba el tag congelado de preciosPromo — RESUELTO
- **Diagnóstico**: los handlers de +/- (agregarAlPedido, quitarDelPedido) decidían si pasos de ±2 mirando preciosPromo[cartKey]?.etiqueta === '2x1' (congelado), no el valor recalculado. preciosPromo se escribía al agregar y no se limpiaba cuando una promo se re-derivaba away. Consecuencia: si un 2x1 se eliminaba en el admin mientras el cliente tenía esa línea, el precio/etiqueta/total quedaban correctos (re-derivados a normal, BL.27), pero futuros clicks +/- en esa línea seguían pasando de a 2 por el tag viejo. Caso de borde estrecho, display/precio-correcto, solo el stepping quedaba viejo.
- **Resuelto**: 2026-06-11 (commit 8498dfc, dentro de REFACTOR-F2). Ambos handlers deciden el stepping desde el índice VIVO: agregarAlPedido dejó el frozen-OR-live y quitarDelPedido (que nunca parseaba la key y estaba stale en ambas direcciones) ahora parsea; es2x1 = !parsed.source && has2x1(platoId, varianteId). BONUS encontrado en el fix: el guard !parsed.source era necesario — sin él, una línea día/ganador podía saltar ±2 si el mismo plato tenía un 2x1 activo (el índice es ciego al source); las líneas congeladas ahora siempre van de a 1. Edge aceptado y documentado: una línea agregada como 2x1 cuya promo se borra pasa a steppear ±1 (consistente con BL.27). Verificado en dispositivo: matriz {promo viva, borrada con línea en carrito, creada después} × {+, −}.
- **Found**: 2026-06-01 (flageado durante BL.27, no tocado: la tarea no modificaba comportamiento de cantidad).
- **Where**: src/hooks/useCart.ts (agregarAlPedido, quitarDelPedido — extraídos de [slug]/page.tsx en la misma fase).
- **Priority**: 🟢 normal (caso de borde estrecho).

### F8.8 Mejoras de borrado en el admin (aviso de plato, mark-for-removal de variantes, auto-borrado de promos vacías) — CLOSED
- **Closed**: 2026-06-01.
- **Goal**: cerrar los huecos de UX y correctitud en los borrados del admin que surgieron al terminar PIEZA 3. Tres piezas + un fix de FK.
- **Aviso de borrado de plato (commit 3565fd6)**: eliminarPlato borraba directo, sin confirmación, y se tragaba el error. Ahora SIEMPRE muestra un modal de confirmación (tapa el misclick) que enumera combos y promos ACTIVAS afectadas (vía helper compartido construirTextoVinculaciones) y una línea destacada cuando el plato es el Plato del Día o Ganador actual. Verificación FK (information_schema): combo_platos, promo_platos y plato_del_dia cascadean en plato_id, pero plato_ganador es NO ACTION → borrar el ganador actual fallaba en silencio (error tragado). eliminarPlato ahora borra la fila de plato_ganador primero (idempotente), chequea el error del delete de platos y aborta con aviso, y resetea el estado local de día/ganador. Conteos en memoria (sin queries).
- **Mark-for-removal + undo de variantes (commit ec27c4b)**: dar ✕ a una variante guardada ya no la hace desaparecer (lo que hacía creer que se borró permanentemente). Ahora la marca como pendiente: queda visible, tachada, con inputs y flechas deshabilitados, y debajo un botón Deshacer junto a una nota ("Se quitará al guardar" + referencias + línea destacada si es día/ganador). Una variante nueva sin guardar se quita directo. El borrado real sigue al guardar (modelo cancel-safe intacto), y el modal de cascade al guardar sigue disparando. El diff de guardado deriva "sobrevivientes" (no marcadas) como fuente única de inserts/updates/orden-contiguo/min-price (una variante tachada barata ya no arrastra el "desde"). Validación cuenta solo sobrevivientes para el mínimo de 2 y saltea las marcadas. Spacer no-focusable para evitar warning de aria-hidden. Solo el form de edición; el de creación intacto.
- **Auto-borrado de promos vacías + banner (commit 7e093f0)**: cuando un borrado de plato/variante/categoría deja una promo sin platos (cascade), la promo vacía se auto-elimina. Helper central limpiarPromosVacias (recuenta promos por restaurante_id, borra las de junction vacío reusando eliminarPromo, un solo refetch), llamado IMPERATIVAMENTE desde eliminarPlato/doSavePlatoEdit/eliminarCategoria — NUNCA desde un efecto global (eso dispararía en la ventana de junction-vacío transitorio de actualizarPromo y borraría una promo en edición). Limpieza oportunista (también barre vacías legacy), maneja múltiples a la vez. Banner efímero genérico nuevo (mostrarAviso(string): fixed bottom-center, auto-descarta 3.5s, ✕ manual, reusable) anuncia las promos borradas.
- **Decisiones de producto (Julian)**: modal de plato siempre (incluso sin referencias); borrado permitido tras confirmar; línea destacada para día/ganador actual. Variante: patrón marcar+deshacer (no modal al ✕), fila bloqueada, modal al guardar se mantiene. Promo vacía: auto-eliminar + toast/banner nombrando la promo, limpieza oportunista.
- **FK verificadas (information_schema)**: combo_platos.plato_id CASCADE, plato_del_dia.plato_id CASCADE, promo_platos.plato_id CASCADE, plato_ganador.plato_id NO ACTION.
- **Where**: src/app/menu/page.tsx.
- **Commits**: 3565fd6, ec27c4b, 7e093f0.

### F8.8 PIEZA 3c ✅ 2x1 en la card pública + label de botón promo-aware — CLOSED
- **Closed**: 2026-06-01.
- **Goal**: hacer visibles y funcionales las promos 2x1 (dos_por_uno) en el menú público, espejando lo que 3b hizo para descuento. Cierra el arco de promos (PIEZA 3 completa). Solo plan Pro.
- **Decisión de producto (Julian)**: en la card, el badge según el caso — solo-descuento mantiene "X% OFF"/"hasta X% OFF" (3b); solo-2x1 muestra pill "2x1" + texto "Lleva 2, paga 1" (Opción B, más explícita); MIXTO (2x1 + descuento conviviendo en distintas variantes del mismo plato, válido porque 3a no los hace chocar) muestra un pill genérico "Ofertas" como gancho, y el modal desglosa el detalle por variante. "Ofertas" aparece SOLO en el caso mixto, no para descuentos distintos entre variantes.
- **Sub-paso 3c-i (display, commit 9e3ea78)**: promo2x1Index (Map plato_id → entradas {varianteId}, paralelo y separado de descuentoIndex porque el 2x1 es un mecanismo, no un porcentaje) + readers has2x1 y has2x1Card, gateados igual que descuentoIndex (vacío si no Pro / promos off). Card: lógica de 4 casos en orden (mixto→"Ofertas" / solo-2x1→pill+texto / plano / solo-descuento sin cambios, solo reubicado). Modal: badge "2x1" por variante aplicable y en los bloques de precio. Día tiene precedencia. Carrito intacto en este sub-paso (a propósito). 3a (type-agnostic) garantiza ≤1 promo por (plato, variante, día), así que una variante nunca muestra dos badges.
- **Sub-paso 3c-ii (carrito + advertencia, commit 2ba30d5)**: agregarAlPedido aplica el mecanismo "lleva 2 paga 1". FIX CLAVE de secuenciación: parsear cartKey ANTES del incremento y derivar es2x1 del ÍNDICE (has2x1) además de la entrada de preciosPromo, para que el PRIMER add caiga en cantidad 2 (no 1 → evita cantidades impares y cobrar medio precio por una unidad suelta). Escribe { precioUnitario: round(base/2), etiqueta: '2x1' } → 2 uds = 1 precio base. Orden: día → descuento → 2x1 → nada. quitarDelPedido ya era 2x1-aware (resta de a 2, limpia al llegar a 0). Verificado punta a punta incluyendo WhatsApp. También: la advertencia de Plato del Día (menu/page.tsx) ahora cubre 2x1 además de descuento (cambio de una línea en el filtro de tipo; texto genérico sin cambios).
- **Arreglo del botón (commit 5f6f7fe)**: el label "Agregar $X" del modal de detalle ahora refleja el precio de la promo, no el de lista, espejando lo que cobra agregarAlPedido (mismo orden de gates, día usa esPlatoDelDiaPrecio = el gate del carrito). Descuento muestra el precio rebajado; 2x1 muestra "$base · 2x1" (precio plano, SIN multiplicar por cantidadMostrar para no sobreestimar si ya hay qty 2/4 en el carrito); día el precio especial; plano sin cambios. Solo display, onClick intacto. precioParaCalcular (sin otros usos) se inlineó y borró.
- **Bug insert-a-DB del pedido — RESUELTO (commit b83a7d9)**: el insert a pedidos_whatsapp grababa el precio de lista por ítem (ignorando promos) mientras el campo total ya era promo-aware → registro internamente inconsistente. El map de productos ahora escribe el precio cobrado (misma expresión que la línea del mensaje: i.promo ? i.promo.precioUnitario : regular) y agrega una key etiqueta (la etiqueta de la promo, o null) para que el registro sea autoexplicativo. Verificado en Supabase: los ítems guardan el precio con promo + etiqueta y suman al total. Sin consumidor de productos (queries del dashboard son count-only), sin migración (productos es JSON), mensaje/total/carrito intactos.
- **Where**: src/app/[slug]/page.tsx (display 2x1, carrito, label del botón); src/app/menu/page.tsx (advertencia Plato del Día ampliada a 2x1).
- **Commits**: 9e3ea78, 2ba30d5, 5f6f7fe.
- **PIEZA 3 COMPLETA**: 3a (validación conflictos) + 3b (descuentos en card) + 3c (2x1 en card) cerradas. Las promos viven ahora en la card/modal/carrito; la sección "Promos" separada fue eliminada.

### F8.8 PIEZA 3b ✅ Descuentos en la card pública (display + carrito + remoción) — CLOSED
- **Closed**: 2026-06-01.
- **Goal**: mover las promos de descuento de la sección "Promos" separada (con su propio modal) a la tarjeta del plato y el modal de detalle, integrándolas donde el cliente realmente mira. Solo descuento en esta fase (2x1 queda para 3c). Solo plan Pro.
- **Decisión de producto clave (Julian)**: aprovechar la lógica de conflictos de 3a. Como dos promos lockeadas a variantes distintas NO chocan, un mismo plato puede tener descuentos DISTINTOS por variante (ej. Grande 30%, Mediana 20%) el mismo día. La card recolecta todas las promos de descuento activas del plato y el modal las desglosa por variante. La card no debía desaprovechar esa lógica ya construida.
- **Sub-paso 3b-i (display, commit 2a689c0)**: descuentoIndex (Map plato_id → promos de descuento activas, gateado en el origen por esProPublico && config.promos_activo → no-Pro no ve nada) + helpers effDiscount y discountInfoCard. Tarjeta: tachado + precio con descuento + pill ("X% OFF", o "hasta X% OFF" cuando las variantes tienen descuentos distintos); variantizados muestran "desde $Y" descontado. Modal: desglose por variante (cada una con su tachado/descontado/%). Día tiene PRECEDENCIA sobre promo en ambas superficies. Carrito intacto en este sub-paso (a propósito). Sorprendeme card no tocada (superficie separada).
- **Advertencia Plato del Día (admin, commit 07c9e64)**: nota contextual inteligente — cuando el admin marca como Plato del Día un plato que ya tiene una promo de descuento activa HOY, aparece una nota explicando que el precio del Plato del Día tiene prioridad. Plato del Día es de un solo día (hoy), así que el cruce solo puede ocurrir hoy; mapea "hoy" a código de día con el mismo offset Colombia -5h del guardado. Booleano derivado, sin estado/fetch nuevo, no bloquea guardado. Solo descuento (2x1 excluido porque es invisible al público esta fase). Texto general (no nombra la promo) para cubrir el caso de varias promos.
- **Sub-paso 3b-ii-A (carrito, commit 3d15ba9)**: agregarAlPedido index-aware. Ramas mutuamente excluyentes: día primero (gana siempre), si no, busca effDiscount del plato+variante y escribe preciosPromo[cartKey] = { precioUnitario: round(base*(1-pct/100)), etiqueta: 'X% OFF' } usando el mismo effDiscount/precioEfectivo del display → precio del carrito == precio mostrado. quitarDelPedido ya limpia la entrada al llegar a cero. Total/bandeja/WhatsApp leen preciosPromo y recogen el descuento automático. Combos no afectados. Verificado punta a punta incluyendo el mensaje de WhatsApp.
- **Sub-paso 3b-ii-B (remoción, commit ad92daa)**: removida la UI vieja — chip de Promos, sección Promociones, modal de promo, estados (mostrarPromos/promoDetalle/promoSeleccion), handler agregarPromoAlPedido, y helpers huérfanos (algunaKeyEsDePlato, obtenerKeyDePlato, platosPromo). +3/-356. Conservados: promosVisibles/promosPublico, descuentoIndex/effDiscount/discountInfoCard, precioEfectivo, preciosPromo, agregarAlPedido/quitarDelPedido y el special-casing 2x1 (reusado en 3c). tsc verde, grep de símbolos borrados vacío.
- **Where**: src/app/[slug]/page.tsx (display, carrito, remoción); src/app/menu/page.tsx (advertencia Plato del Día).
- **Commits**: 2a689c0, 07c9e64, 3d15ba9, ad92daa.
- **Sigue**: 3c (2x1 en la card; los 2x1 quedan invisibles al público hasta entonces). En 3c, extender la advertencia de Plato del Día para que también cubra 2x1.

### F8.8 PIEZA 3a ✅ Validación de conflictos entre promos (admin) — CLOSED
- **Closed**: 2026-05-29.
- **Goal**: impedir que el admin cree o edite una promo que entre en conflicto con otra promo activa. Primer sub-trabajo de PIEZA 3 (la validación va ANTES de la card pública, para que la card asuma dato sin conflictos). Decisión de producto de Julian: en vez de resolver el solapamiento en la card (mayor descuento gana, etc.), se previene en el admin.
- **Regla de conflicto (confirmada)**: dos promos chocan si comparten >=1 plato Y >=1 día Y >=1 variante de ese plato. variante_id NULL (todas las variantes) cruza CUALQUIER variante específica y cruza otro NULL; dos variantes específicas cruzan solo si son iguales. El TIPO de promo (2x1 vs descuento) NO importa. Solo cuentan las promos ACTIVAS.
- **Casos de referencia**: 20% Grande lun + 15% Mediana lun = NO chocan (variantes distintas); 20% Grande lun + 2x1 Grande lun = chocan (tipo no importa); 20% Grande lun + 30% Grande mar = NO chocan (días distintos); Todas-variantes lun + Grande lun = chocan (NULL cruza cualquiera); Todas lun + Todas mar = NO chocan.
- **Implementación (pura client-side, sin DB/types/hook)**: helper detectarConflictoPromo en menu/page.tsx que lee `promos` y `editandoPromoId` del closure. validarPromo agrega e.conflicto. CRÍTICO: edit mode excluye editandoPromoId para que una promo no choque consigo misma. El mensaje nombra cada plato en conflicto (con su variante si está lockeada) + la promo con la que choca, listando TODOS los conflictos, no solo el primero. Nombres resueltos vía el lookup canónico todosPlatos (igual que el derive promos arma "Pizza (Grande)").
- **Ghost-flash fix**: el banner se gateó con !guardandoPromo && !guardadoPromo. Causa: al guardar, el refetch hace que la promo recién creada aparezca en la lista y, durante la ventana de ~1200ms del "Guardado", se detecta "chocando consigo misma" (en create mode editandoPromoId es null). El gate suprime el banner solo en esa ventana, sin afectar la validación normal ni el bloqueo del botón.
- **Limpieza de datos previa**: antes de implementar, se detectaron 43 pares en conflicto en la base (query de diagnóstico), casi todos promas de testing acumuladas (F8.4b, F8.6, Smoke Test, INVALID). Se borraron 7 promas de testing (junction-primero: promo_platos, luego promos), conservando 4 limpias para smoke. La validación es forward-only: no toca conflictos preexistentes, solo previene nuevos.
- **Smoke test (verde)**: conflicto singular y plural (mensaje lista todos los platos); tipo no importa (2x1 choca con descuento); días/variantes distintos no chocan; edición sin cambios guarda sin auto-conflicto (self-exclusion OK); ghost-flash ya no aparece al guardar válido; conflicto real se muestra y se queda.
- **Where**: src/app/menu/page.tsx (detectarConflictoPromo, validarPromo, banner de conflicto).
- **Commits**: feat 45045bb.
- **Sigue**: 3b (card pública con descuento, solo descuento; 2x1 en fase posterior). 3b CERRADO en ad92daa.

### F8.8 PIEZA 2 ✅ Variante locking en promos (lock opcional por plato) — CLOSED
- **Closed**: 2026-05-29.
- **Goal**: el admin puede lockear opcionalmente el descuento de una promo a una variante específica por plato, o dejar "Todas las variantes" (variante_id NULL) que aplica a todas. Patrón espejo de combos (F8.5b) pero con semántica de lock OPCIONAL, no forzado.
- **Decisión de producto**: confirmada contra competencia (Deal POS, Shopify, Lightspeed) — el admin decide la variante, no el cliente. A diferencia de combos, el lock es opcional: "Todas las variantes" es válido y es el default. Sin force-variante en validarPromo.
- **DB (migración manual aplicada, Supabase SQL Editor)**: ALTER TABLE promo_platos ADD COLUMN variante_id uuid NULL REFERENCES plato_variantes(id) ON DELETE CASCADE. Verificada idéntica a combo_platos (mismo tipo, misma FK rule CASCADE confirmada por query de constraints). Aditiva y forward-compatible: filas existentes quedan NULL = todas las variantes.
- **Cambios por capa**:
  - Fundación (commit 6989e09): PromoPlato gana variante_id; usePromos ambos SELECT traen variante_id; PromoPublica.promoPlatos y PromoAdmin.promo_platos cargan el lock crudo para edit-pop; cascade check de borrado de variante suma 4to count (promo_platos). Sin shape enriquecido (el modal resuelve precio inline desde categorias en memoria).
  - Admin form (commit a99d7a7): nuevaPromo.platoIds migrado de string array a PromoItem objetos (~16 sitios incluidos 5 reset literals); Select inline por plato con "Todas las variantes" como primera opción y default; toggle default NULL (no variantes[0], a diferencia de combos); preview y card admin muestran "(Variante)" cuando hay lock; edit-pop rehidrata desde promoPlatos crudo.
  - Público (commit a99d7a7): modal con branching — si hay lock, sin radios, variante pre-seleccionada con precio/key fijos; si NULL, comportamiento F8.4b intacto (cliente elige). Card "Aplica en: Pizza (Grande)" cuando hay lock. agregarPromoAlPedido sin cambios (keys ya cargan la variante; precioEfectivo resuelve el precio en ambos casos, locked y elegido por el cliente).
- **Implementación en 2 prompts**: fundación (tipos + hook + cascade count) primero para mantener TS verde, luego admin form + UI pública. Cada paso cerró con npx tsc --noEmit en cero errores.
- **Edge de borrado de variante**: una promo lockeada a una variante luego borrada queda con variante_id dangling; el modal lo guarda (lockVariante resuelve a null → fallback a todas-variantes) y ON DELETE CASCADE en promo_platos.variante_id lo deja NULL a nivel DB. Seguro por ambos lados.
- **Where**: src/types/index.ts (PromoPlato.variante_id), src/hooks/data/usePromos.ts (SELECT + PromoPublica/PromoAdmin), src/app/menu/page.tsx (PromoItem, validarPromo, form promo, cascade count), src/app/[slug]/page.tsx (modal promo + card "Aplica en").
- **Commits**: fundación 6989e09, feat a99d7a7.

### F8.8-prep ✅ Eliminación del tipo de promo precio_especial — CLOSED
- **Closed**: 2026-05-29.
- **Goal**: reducir los tipos de promo a dos (dos_por_uno y descuento), eliminando precio_especial por completo. Decisión de producto: descuento (proporcional) se conserva porque funciona con platos variantizados; precio_especial (fijo) no diferencia Mediana de Grande y fue justo lo que F8.6 tuvo que bloquear.
- **DB cleanup (manual, Supabase SQL Editor)**: borradas 13 filas precio_especial (todas del restaurante de prueba mi-restaurante-prueba / c8a8c0d2…b856bf) más sus filas en promo_platos. Orden junction-primero para evitar violación de FK. Verificado: 0 precio_especial restantes en toda la tabla, 0 promo_platos huérfanas.
- **Investigación previa**: mapeo de los 16 puntos de contacto en 3 archivos antes de tocar código. Clave: distinguir el tipo de promo precio_especial (eliminado) de la columna/estado precio_especial / precioEspecial del Plato del Día (intacta, feature distinta de F8.7).
- **Cambios por archivo**:
  - src/types/index.ts: TipoPromo pierde 'precio_especial' (queda dos_por_uno | descuento | gratis).
  - src/app/menu/page.tsx: eliminado el botón de tipo, el input condicional de valor, la rama force-variante de validarPromo (lógica muerta de F8.6), el flag filaConError + su styling de borde rojo + el tieneVariantes huérfano, la rama del preview IIFE, y el badge de la card admin colapsado a 2-way.
  - src/app/[slug]/page.tsx: simplificado el filtro promosVisibles, eliminada la rama de agregarAlPedido (+ comentario interim F8.4b D4), badge del modal y precio por fila colapsados a 2-way, eliminada la línea de helper text.
  - src/hooks/data/usePromos.ts: sin cambios (pasa tipo opaco, hereda el narrowing del type).
- **Smoke test (verde)**: form admin muestra solo 2x1 y % Descuento; crear/editar dos_por_uno y descuento OK; descuento con plato variantizado verifica matemática (Mediana 20k a 16k, Grande 30k a 24k); carrito y badges correctos en público; console limpio (errors AND warnings).
- **Methodology note**: el commit casi se hace con el body malformado por flechas Unicode en PowerShell; el subject entró bien. Para futuros commits con body largo, usar texto PowerShell-safe (sin flechas ni símbolos especiales).
- **Where**: src/types/index.ts (TipoPromo), src/app/menu/page.tsx (validarPromo + form promo), src/app/[slug]/page.tsx (modal + cart promo).
- **Commits**: refactor e235ef2.

### BL.23 ✅ Lag al tipear en formularios del admin (re-renders) — RESUELTO
- **Found**: 2026-06-01 (reportado por Julian: al escribir en los campos de crear/editar plato, el texto entraba con lag, no fluido).
- **Causa**: menu/page.tsx es UN componente de 4131 líneas con 73 useState arriba; todo el estado de los forms vive ahí, así que cada tecla disparaba setNuevoPlato/setEditPlato y re-renderizaba todo el árbol (el form de plato está incluso anidado dentro del map de categorías, peor aún). Los useMemo NO eran el problema (bien cacheados). El refactor por sí solo NO arreglaba esto — mover código a archivos es cosmético; el fix real es aislar el render-scope.
- **Resuelto**: 2026-06-01 (commit 9740f28). Componente reusable CampoTexto: mantiene el valor del input en estado LOCAL y confirma al padre con onCommit en blur, así cada tecla re-renderiza SOLO el input, no la página. Ref-mirror sincrónico (nuevoPlatoRef/editPlatoRef vía commitNuevoPlato/commitEditPlato) + registro de flush (camposFlushRef + flushCampos): los handlers de guardado llaman flushCampos() y leen el snapshot del ref ANTES de validar, así escribir-y-Guardar-sin-blur nunca pierde la última edición (corrección senior: el setState es async, no se podía leer el estado en el mismo handler). Re-sync focus-aware (useEffect[value], solo si no enfocado) reseedea en reset/abrir-edit/reorder de variantes sin pisar el tecleo. Contador interno opcional (usado en descripciones, vive del estado local). 10 inputs de plato convertidos (create+edit: nombre, precio, descripcion, variante nombre/precio). Validación/errores intactos (ya esperaban blur/submit). CampoTexto es genérico y sobrevive al refactor. Sharp edge pre-existente flageado: los botones de variante (▲▼✕＋) leen el estado del closure, no el ref — tipear en variante y clickearlos sin blur podría perder lo tecleado (no arreglado, estrecho).
- **Where**: src/app/menu/page.tsx (CampoTexto module-scope, flush registry + ref-mirror en MiMenuPage, 10 inputs de plato).
- **Priority**: 🟡 high (afecta la experiencia de uso directa; producto pre-lanzamiento).
- **Pendiente relacionado**: extender CampoTexto a los forms de categoría/combo/promo (anti-lag), y React.memo en las filas de listas — va con el refactor.

### BL.24 ✅ Sin límite de caracteres en nombres (rompe layout) — RESUELTO
- **Found**: 2026-06-01 (reportado por Julian: nombre de categoría y de variante sin límite causaban quiebre visual fuerte con texto largo).
- **Resuelto**: 2026-06-01 (commit 9740f28). maxLength silencioso (hard-stop, sin contador) en los 5 campos de nombre: plato 60, variante 30 (vía prop maxLength de CampoTexto), categoría 40, combo 50, promo 50 (vía atributo maxLength nativo de HTML en los inputs crudos, preservando su onChange/Enter/validación viva — recomendación senior de no convertirlos a CampoTexto para no tocar lógica que funciona). Límites dimensionados según dónde renderiza cada campo en el menú público (columna móvil ~500px). Descripciones mantienen sus contadores (150/100). Sin truncado retroactivo (maxLength solo limita tecleo nuevo; valores existentes cargan completos). Auditoría confirmó que validar* no dependen de length.
- **Where**: src/app/menu/page.tsx (8 ediciones: 4 CampoTexto + 4 inputs crudos).
- **Priority**: 🟡 (pulido pre-lanzamiento, evita quiebre visual).
- **Follow-up flageado**: los precios (type=number) no tienen techo de valor — un entero gigante rompe el formato. Guard de rango numérico, tema aparte (ver BL nuevo de precios).

### BL.25 ✅ Precios sin techo de valor (rompe formato) — RESUELTO
- **[PENDIENTE]**: los campos de precio (plato, variante, combo, precio especial del día) son type=number sin límite superior; un valor absurdo (ej. 999999999) rompe el formato/layout de precios. validarPlato/validarCombo/validarPlatoDia solo chequean > 0, sin techo. Fix sugerido: un guard de rango (ej. rechazar > 10.000.000 COP) en cada validador. Detectado durante BL.24 (Julian confirmó que hace falta).
- **Found**: 2026-06-01 (auditoría de BL.24 + confirmación de Julian).
- **Where**: src/app/menu/page.tsx (validarPlato, validarCombo, validarPlatoDia).
- **Priority**: 🟡 high (Julian lo confirmó como necesario).
- **Resuelto**: 2026-06-01 (commit 5420fa4). Constante MAX_PRECIO = 10.000.000 COP y un check de cota superior (else if espejando el check de > 0) en validarPlato (rama sin-variante y rama variante), validarCombo y validarPlatoDia. Rechaza y muestra mensaje (no clampea en silencio), reusando las keys de error existentes. El % de descuento de promos queda intacto (ya clampeado 1-100). Techo único para todos los campos (hasta un combo familiar grande ~250k está ~40x debajo). Decisión de Julian: 10M.

### BL.26 ✅ Errores de variante sin mensaje (solo borde rojo) — RESUELTO
- **Found**: 2026-06-01 (reportado por Julian: al pasar el techo de precio en una variante no aparecía ningún mensaje, en los demás campos sí).
- **Causa**: los errores por-campo de variante (variante_i_nombre, variante_i_precio) solo se cableaban al borderColor del input — NO había ningún JSX que renderizara el texto del mensaje, a diferencia de los otros campos de precio que sí tienen su <div>{errores.x}</div>. Hueco pre-existente: el 'Precio inválido' (check de <= 0) también era mudo; el techo de precio de BL.25 lo hizo visible.
- **Resuelto**: 2026-06-01 (commit 5420fa4). Bloque de mensaje en su propia línea debajo de cada fila de variante (create + edit), gateado en intentoPlato/intentoEditPlato (igual que el borde, sin flag touched que las variantes nunca setean), renderizando los errores de nombre y precio en líneas separadas. Display-only: validador, save handlers y gating del borde intactos. El espaciado entre filas del create se preservó moviendo el marginBottom a un wrapper nuevo. Las filas marcadas para borrar (_pendingDelete) no muestran error porque el validador las saltea.
- **Where**: src/app/menu/page.tsx (filas de variante create ~L2099 y edit ~L2465).
- **Priority**: 🟡 (validación muda confunde al usuario; pulido pre-lanzamiento).

### BL.19 ✅ Bug ganador NO ACTION en eliminarCategoria — RESUELTO
- **[PENDIENTE] Bug ganador NO ACTION en eliminarCategoria**: eliminarCategoria (~L1115) borra los platos de la categoría directo, sin el cleanup de plato_ganador que se agregó a eliminarPlato. Si una categoría contiene el plato que es el ganador actual, el delete podría chocar con la FK plato_ganador (NO ACTION) y fallar en silencio (mismo bug que se arregló en eliminarPlato en commit 3565fd6). Fix: replicar en eliminarCategoria el patrón de eliminarPlato — detectar si algún plato de la categoría es el ganador actual, borrar la fila de plato_ganador primero, chequear el error, resetear estado local. Detectado al cablear limpiarPromosVacias (7e093f0).
- **Found**: 2026-06-01.
- **Where (suspected)**: src/app/menu/page.tsx (eliminarCategoria ~L1115).
- **Priority**: 🟡 high.
- **Resuelto**: 2026-06-01 (commit b924188). eliminarCategoria ahora computa los plato ids de la categoría en memoria, detecta si el ganador (o día) actual está entre ellos, borra la fila de plato_ganador ANTES del delete de platos (evita el bloqueo NO ACTION), chequea el error del delete y hace early-return antes de borrar la categoría o resetear estado, y resetea el estado local de ganador/día con los mismos literales que eliminarPlato. limpiarPromosVacias sigue al final. Espejo del fix de eliminarPlato (3565fd6).

### BL.20 ✅ Sin confirmación al borrar categoría — RESUELTO
- **[PENDIENTE] eliminarCategoria borra directo, sin modal de confirmación**: el borrado de categoría se dispara directo desde el menú de la categoría (~L1793, onClick eliminarCategoria(cat.id)) sin ningún "¿estás seguro?". Una categoría arrastra TODOS sus platos (y posiblemente el ganador, el día, promos, combos), así que un misclick es mucho más destructivo que borrar un solo plato. Confirmado por Julian desde el uso real. Fix sugerido: un modal de confirmación como el de borrado de plato (platoDeleteWarning), enumerando lo que se va a borrar (N platos, y referencias afectadas). Reusar el patrón del modal de plato y el helper construirTextoVinculaciones.
- **Found**: 2026-06-01 (investigación BL.19 + reporte de Julian).
- **Where**: src/app/menu/page.tsx (eliminarCategoria ~L1113, trigger ~L1793).
- **Priority**: 🟡 high (Julian lo señaló como importante).
- **Resuelto**: 2026-06-01 (commit 5b08f00). El trigger de "Eliminar categoría" ya no llama eliminarCategoria directo: computa en memoria los conteos agregados (combos distintos y promos ACTIVAS que referencian cualquier plato de la categoría, + si el día/ganador actual está entre sus platos) y abre un modal categoriaDeleteWarning ("¿Estás seguro de eliminar esta categoría?") que muestra el conteo de platos (oculto si la categoría está vacía), las referencias vía construirTextoVinculaciones, y líneas destacadas para día/ganador. Cierra el menú ⋯ al abrir (z-index). Siempre confirma (incluso categoría vacía). eliminarCategoria intacto (incluye el fix de BL.19), solo gateado por el onConfirm. Estado separado de platoDeleteWarning. Completa el arco "ningún borrado destructivo sin confirmación" (plato, variante, categoría).

### BL.22 ✅ Plato fantasma en combos/promos tras borrado (vista stale) — RESUELTO
- **Found**: 2026-06-01 (reportado por Julian desde el uso: borró un plato de un combo de 3; el combo seguía mostrando 3, con el borrado renombrado a "Plato", hasta que desaparecía tiempo después).
- **Causa**: tras borrar un plato/variante/categoría, los combos/promos que SOBREVIVÍAN (combo con ≥2, promo con ≥1) no se invalidaban — limpiarCombosVacios/limpiarPromosVacias solo invalidaban si auto-borraban algo, y mutateCategoriasYPlatos solo refresca la key de platos, no las keys separadas de combos/promos. La useMemo de combos re-cruzaba las filas viejas de combo_platos contra la lista de platos ya podada, y el plato borrado caía al placeholder 'Plato' (page.tsx:808) hasta una revalidación por foco (revalidateOnFocus).
- **Resuelto**: 2026-06-01 (commit ce51be4). limpiarVinculosVacios ahora invalida combos + promos SIEMPRE (incondicional, aunque no se borre nada), así los vínculos que solo perdieron un plato refrescan al instante. Los dos helpers ya no invalidan internamente (el orquestador es dueño). Optimización en el mismo cambio: las dos limpiezas corren en paralelo (Promise.all, tablas/keys disjuntas), las invalidaciones se batchean, y el delete de plato_ganador en eliminarPlato se gateó en eraGanador (ahorra un round-trip cuando no es el ganador, preservando el orden NO ACTION). El mismo bug afectaba a promos y quedó cubierto.
- **Where**: src/app/menu/page.tsx (limpiarVinculosVacios, eliminarPlato).
- **Priority**: 🟡 (afectaba la confianza en la vista del admin).

### BL.21 ✅ Combos vacíos sin limpiar tras cascada — RESUELTO
- **[PENDIENTE] No hay limpieza de combos vacíos (simétrico a limpiarPromosVacias)**: cuando un borrado de plato/variante/categoría deja un combo sin platos (combo_platos cascadea en plato_id/variante_id), el combo queda vacío y colgando. Existe limpiarPromosVacias para promos pero NO un limpiarCombosVacios equivalente. Fix sugerido: replicar el patrón de limpiarPromosVacias para combos (recuento por restaurante, borrar los de junction vacío reusando eliminarCombo, banner). Detectado al investigar BL.19.
- **Found**: 2026-06-01 (investigación BL.19).
- **Where**: src/app/menu/page.tsx.
- **Priority**: 🟢 normal.
- **Resuelto**: 2026-06-01 (commit ce51be4, junto con BL.22). Se agregó limpiarCombosVacios (espejo de limpiarPromosVacias) que borra combos con junction < 2 platos (no solo vacíos: un combo de 1 plato está por debajo del mínimo de validarCombo y queda roto). Un orquestador limpiarVinculosVacios corre ambas limpiezas y compone UN solo aviso combinado (promos "sin platos", combos "incompleto" — wording veraz por tipo, ya que un combo de 1 plato no está vacío). Llamado desde los tres handlers de borrado (eliminarPlato, guardarEdicionPlato, eliminarCategoria). Imperativo, nunca efecto global (ventana transitoria de actualizarCombo). Decisión de Julian: borrar con < 2 (cubre el combo roto de 1 plato).

### BL.18 ✅ Literal 'gratis' muerto en TipoPromo — RESUELTO
- **Found**: 2026-05-29 durante la investigación de la poda de precio_especial.
- **Symptom**: TipoPromo incluye 'gratis' pero no se encontró ninguna referencia en menu/page.tsx, [slug]/page.tsx ni usePromos.ts. Parece tipo muerto nunca implementado.
- **Steps to reproduce**: grep 'gratis' en el código de promos → sin consumidores.
- **Where (suspected)**: src/types/index.ts (TipoPromo union).
- **Acceptance criteria**: investigar si 'gratis' se usa en algún lado no auditado (seeds, migraciones, otros componentes). Si está muerto confirmado, removerlo de la union. NO se tocó en la poda de precio_especial para mantener el batch enfocado.
- **Resuelto**: 2026-06-01 (commit pendiente). Verificado en todo el repo: 'gratis' no tenía ningún uso como tipo de promo — el selector solo ofrece dos_por_uno/descuento, ningún código escribe 'gratis', y las únicas referencias a TipoPromo son anotaciones + un cast sin chequear. Removido el member del type (cambio de una línea en src/types/index.ts, solo type-level, sin efecto en runtime). tsc verde.
- **Priority**: 🟢 medium-low — limpieza, no afecta funcionalidad.

### F8.7 ✅ Variantes de platos — Sesión 7 (variante selector para plato del día y plato ganador) — CLOSED
- **Closed**: 2026-05-27.
- **Goal**: el admin puede lockear una variante específica al plato
  del día y al plato ganador.
- **Changes by layer**:
  - Types (src/types/index.ts): variante_id?: string | null en
    PlatoDelDia y PlatoGanador.
  - Hooks (usePlatoDelDia, usePlatoGanador): los public mappers
    joinean plato_variantes(*) y resuelven la variante locked
    (varianteId + variante {id, nombre, precio}); los admin types
    exponen variante_id.
  - Admin (src/app/menu/page.tsx): Select de variante en ambos
    forms ('Sin variante específica' + lista; oculto si el plato no
    tiene variantes). Reset a variantes[0] al cambiar de plato.
    INSERT con variante_id. Seed desde SWR. validarPlatoDia rechaza
    variante inválida. Soft-warning de precio compara contra el
    precio de la variante locked. Vista Previa variante-aware
    (nombre · variante + precio de variante).
  - Consumer (src/app/[slug]/page.tsx): las cards de día/ganador
    muestran 'nombre · variante' + precio de variante; la de día
    muestra precio tachado + precio_especial. El modal pre-selecciona
    la variante locked; el descuento del día solo aplica si la
    variante seleccionada coincide con la locked. Cart key vía
    makeCartKey/parseCartKey con un 3er segmento "source" opcional
    que namespacea día/ganador (cb391da) — el composite de 2 args
    heredado de F8.4a quedó superado. Fallback 'desde $X' preservado
    para rows legacy sin lock.
- **Plan gating**: Pro-only (heredado de la superficie de render).
- **Methodology lesson — schema drift en una 4ta capa de consumer**:
  la detección de schema drift falló en una 4ta capa de consumer no
  auditada (la Vista Previa del admin). Había DOS consumers del
  precio — el público + el preview admin. Cazado en smoke test,
  fixeado en el mismo batch antes del commit.
- **Commits**: feat 91ec57e, docs 5533be9, fix cb391da, feat 6316fa0, feat 9b39352.
- **Follow-ups en backlog (no bloquean)**:
  - E1: el error 'Variante seleccionada inválida' del validator no
    tiene UI render → posible silent fail (verificar con devtools).
  - L1/L2: backward compat de rows legacy con variante_id NULL
    (verificar manual en Supabase Dashboard).

### F8.7-fix ✅ Cart-key namespacing para plato del día y ganador — CLOSED
- **Closed**: 2026-05-28.
- **Root bug**: el plato del día sin variante usaba platoDia.id pelado
  como cart key, idéntico al de la card normal del mismo plato →
  colisión. El "+1" caía en la card equivocada y los precios se
  mezclaban (last-writer-wins en preciosPromo).
- **Fix**: extendido makeCartKey/parseCartKey con un 3er segmento
  "source" opcional. Día/ganador generan keys tipo id____dia o
  id__varianteId__dia. Empty-middle parsea correctamente a
  varianteId: undefined. Combos (UUID sin __) y promos (keys
  intactas) no se tocaron — backward-compat byte-idéntico cuando
  source se omite.
- **Cambios atómicos en el mismo commit**: reemplazo del "+" custom
  del plato del día por <Qty> estándar; agregarAlPedido día-aware
  (detecta source === 'dia', registra precioEspecial en preciosPromo
  idempotentemente, sobrevive remove-to-zero/re-add); hoist de
  esPlatoDelDiaPrecio arriba de cartKey en el modal para que key y
  precio nunca diverjan; truncation line-clamp:1 en día y sorpréndeme
  descripcion, clamp:2 en ganador descripcionEspecial; reposición del
  <Qty> del día al nivel del precio.
- **Methodology lesson**: el cambio de DOM del <Qty> se intentó ANTES
  del namespacing y rompió el carrito (sumaba el plato normal en vez
  del día); después del namespacing fue inocuo. No tocar capas
  dependientes hasta resolver la dependencia subyacente.
- **Where**: src/app/[slug]/page.tsx — makeCartKey/parseCartKey,
  agregarAlPedido, modal cartKey/esPlatoDelDiaPrecio.
- **Commits**: fix cb391da.

### F8.7-fix ✅ Esconder día/ganador del listado normal cuando están destacados — CLOSED
- **Closed**: 2026-05-28.
- **Goal**: si el plato del día (o ganador) se está mostrando en su
  card destacada, el mismo plato no aparece duplicado en el listado
  normal.
- **Safety gate**: la condición de ocultamiento matchea EXACTAMENTE la
  condición de visibilidad de la card destacada (esProPublico &&
  plato_dia_activo && platoDiaVisible && !busqueda.trim()). Previene el
  edge "fuera de horario": la card destacada se desmonta fuera de
  horario, y si también lo escondiéramos del listado por la sola
  config, el plato quedaría invisible en el menú entero.
- **.filter(c => c.platos.length > 0)** para no dejar headers de
  categorías vacías.
- **NO se tocaron**: categorias base, categoriasPorHorario,
  platosVisiblesIds, pool de Sorpréndeme, validez de combos/promos,
  cleanup warning (leen de fuentes distintas a categoriasFiltradas).
- **Where**: src/app/[slug]/page.tsx — idsOcultarEnListado,
  categoriasListado.
- **Commits**: feat 6316fa0.

### F8.7-fix ✅ Precio + badge de día en cards de búsqueda y Sorpréndeme — CLOSED
- **Closed**: 2026-05-28.
- **Bug expuesto por el entry anterior**: al esconder del listado, el
  plato seguía visible vía búsqueda (que desactiva el ocultamiento con
  !busqueda.trim()) y vía Sorpréndeme, mostrando precio normal sin
  badge — contradictorio con el descuento ya visto.
- **Fix**: detección por plato (esEstePlatoElDia) en ambos surfaces.
  Card muestra "nombre · variante" (si hay variante locked), precio
  tachado + precio_especial + pill "Plato del día". Qty inline (solo
  no-variantizados) usa cart key sourced 'dia' → agrega al precio
  especial. Variantizados con lock: precio tachado de la variante +
  pill, sin Qty inline (delega al modal). Variantizados sin lock:
  "desde $X" + pill, sin Qty inline.
- **Ganador NO se tocó**: no tiene precio especial → no hay
  contradicción de precio. Mantenerlo afuera evitó scope creep.
- **Where**: src/app/[slug]/page.tsx — cards de búsqueda (listado) y
  filas de Sorpréndeme.
- **Commits**: feat 9b39352.

### UI-BUGS ✅ Description handling — multi-surface fix — CLOSED
- **Closed**: 2026-05-23.
- **Goal**: Fix 10 description-related bugs discovered during F8.6
  smoke testing. All bugs share schema drift between code and DB
  as their root cause.
- **Schema migration applied** (manual, via Supabase Dashboard SQL Editor):
  ALTER TABLE promos ADD COLUMN descripcion text;
  The column did NOT exist before today. Code was writing to it
  silently (NULL drop, no error) and reading from it (got NULL).
  This is the first manual DB migration documented in this roadmap.
- **10 bugs closed**:
  1. UI overflow on 9 description surfaces (spaceless strings broke layout).
  2. Combo descripcion had no char limit in admin form.
  3. Promo descripcion silently dropped on INSERT.
  4. Promo descripcion silently dropped on UPDATE.
  5. promos.descripcion column didn't exist in DB.
  6. Promo public modal had no descripcion render JSX.
  7. Admin promo input had no MAX_DESC guard + counter.
  8. Admin promo card descripcion had no overflowWrap.
  9. usePromos.fetchPromosPublic map silently dropped descripcion.
  10. Combo card on public list showed descripcion (visual noise).
- **Plus visual polish**: Plato card descripcion now truncates to
  1-line preview with ellipsis (WebkitLineClamp:1). Full text
  remains visible in the detail modal.
- **Files changed**: 3 — src/hooks/data/usePromos.ts,
  src/app/menu/page.tsx, src/app/[slug]/page.tsx.
- **Line delta**: ~+48 / -16 = +32 net.
- **Methodology lesson — schema drift detection across 4 layers**:
  When persisting a new field, verify all 4 layers in order:
  (1) DB schema, (2) SELECT query, (3) mapping/transformation,
  (4) consumer types. Inferring from one layer does NOT validate
  the others. Today's bug had to be caught at each of the 4
  layers separately.
- **Methodology lesson — console monitoring scope**: When asking
  Claude in Chrome to monitor console, explicitly request
  "errors AND warnings" — the default Chrome DevTools filter
  hides warnings. The read_console_messages tool captures all
  levels at runtime; the limitation was prompt wording.

### F8.6 ✅ Variantes de platos — Sesión 6 (admin promo validation) — CLOSED
- **Closed**: 2026-05-23.
- **Goal**: Block the invalid combination 'tipo === precio_especial
  + plato con variantes' at admin write time. Closes the F8.4b
  interim behavior comment in [slug]/page.tsx:1626 which deferred
  this validation to F8.6.
- **Math justification**:
  - dos_por_uno: base/2 — proportional per variante. ALLOWED.
  - descuento: base * (1 - valor/100) — proportional. ALLOWED.
  - precio_especial: fixed valor regardless of base — Mediana
    \$20k and Grande \$30k both cost the same special price.
    Non-proportional, semantically broken. BLOCKED.
- **Cheapest F8 session so far**: 1 file, ~35 lines net, ~1.5h
  total (investigation + implementation + smoke test + post-fix
  re-test). No new types, no shape migration, no reset literals,
  no cross-file touches. Compare to F8.5b (4 files, 23 reference
  sites, ~3h).
- **6 decisions locked from investigation**:
  1. Validation strategy: ON-SAVE (Option C) — banner + per-row
     red border. Mirrors F8.5b force-variante pattern exactly.
  2. Legacy promos: read-only on display (F8.4b interim continues),
     blocked at edit-save. Forward-only consistency.
  3. Cascade on variante-add: defer to F8.8.
  4. Banner copy: 'Las promos de precio especial no admiten
     platos con variantes. Elimina el plato o cambia el tipo
     de promo.' — actionable, imperative, no 'Por favor'.
  5. Stale touch reset on tipo switch: YES — clears stale red
     borders/banner immediately when admin changes type.
  6. Red border scope: only on SELECTED variantized platos
     (non-variantized platos in same form stay clean).
- **Changes** (src/app/menu/page.tsx):
  - validarPromo (L357+): new branch nested inside the else of
    platoIds.length === 0 check. Closure on todosPlatos for the
    variante lookup (same pattern as validarCombo at L754-760).
    Detects variantized platos via p.variantes?.length and
    triggers the banner copy when admin attempts save with
    tipo === 'precio_especial'.
  - Tipo radio click handler (L2562+): added platos: false to
    setTouchedPromo reset alongside valor: false. Clears stale
    visual state on type switch.
  - Row JSX (L2614+): added filaConError boolean computed at
    top of row map (intentoPromo && tipo === precio_especial
    && isSelected && tieneVariantes). Conditional styling:
    red border + light-danger background.
- **CSS variable reuse**: Claude Code grepped the codebase and
  found --color-danger and --color-danger-light already exist
  (paired in .badge-danger pattern at globals.css:289). Reused
  them instead of inventing new vars or hardcoding colors. This
  maintains visual coherence with the rest of the app.
- **Shorthand-border warning fix** (post-implementation):
  - Initial implementation used 'border: 1px solid var(--color-danger)'
    in the conditional spread, which conflicted with the existing
    'borderBottom: 1px solid var(--border-light)' during rerenders.
    React DevTools warned: 'Removing a style property during
    rerender (border) when a conflicting property is set
    (borderBottom)...'
  - Smoke test missed this because the Chrome DevTools console
    filter hides Warnings by default and the prompt asked for
    'console errors' specifically.
  - Fixed by replacing shorthand 'border' with 4 individual
    properties: borderTop, borderRight, borderBottom, borderLeft.
    Both add-path and remove-path now use non-shorthand form.
  - Re-test confirmed: visual behavior identical (all 4 sides
    red), 0 console messages on both paint and tipo-switch rerender.
- **Methodology lesson**: For future smoke tests, console
  monitoring must explicitly request 'errors AND warnings' (not
  just 'console errors'). The read_console_messages tool
  captures all levels at runtime — the limitation was the prompt
  wording, not the tooling. F8.7 and F8.8 prompts will use
  improved phrasing.
- **Smoke test passed 6/6**:
  1. Create dos_por_uno + variantized plato (Pizza Test F8.4b):
     saves. ✅
  2. Create descuento + variantized plato: saves. ✅
  3. Create precio_especial + non-variantized plato (jul only):
     saves. ✅
  4. Create precio_especial + variantized plato: BLOCKED con
     banner + red border. Per-row scope verified — adding jul
     to the same form did NOT add red border to jul row. ✅
  5. Tipo switch (precio_especial → descuento) on broken form:
     red border and banner disappear immediately, valor field
     clears. ✅
  6. Edit legacy precio_especial promo with variantized plato
     (Test Precio Especial F8.4b): clean open (no error yet)
     → click Guardar cambios fires error → cleanup (changed
     tipo to dos_por_uno) → second Guardar cambios succeeds.
     Legacy promo now stored as 2x1. ✅
- **Post-fix re-test (2/2 PASS)**:
  - Test 4 re-run: visual identical (DOM inspection confirmed
    all 4 individual border properties applied), 0 console
    messages.
  - Test 5 re-run (critical rerender path): tipo switch
    triggers filaConError true → false transition. 0 console
    messages. DOM inspection confirmed only the upstream
    borderBottom remains after switch (light-grey), the 3
    conditional borders cleanly removed.
- **Line delta**: +30 / -5 + 5 (border fix) = +30 net in
  src/app/menu/page.tsx. Within original +15 to +25 envelope
  for the validator + tipo handler + row JSX, plus 5 lines from
  the shorthand-to-individual replacement.
- **F8 progress**: 7 of 8 sessions complete. Customer-facing flow
  100% complete. Admin validation for variantes in combos
  (F8.5b force-variante) AND promos (F8.6 type compatibility)
  now both complete.
- **Next sessions**:
  - F8.7: plato del día / ganador admin form with variante
    selector. Smaller surface than F8.5b — single dropdown per
    item (no array migration). Estimated ~1.5-2h.
  - F8.8: polish — cascade warning copy enrichment (deferred
    from F8.5b + F8.6), legacy combo badge in admin list (if
    time), final WhatsApp / Sorpréndeme verification, edge
    case audit. Estimated ~1.5-2h.
- **Where**:
  - src/app/menu/page.tsx L357+ (validarPromo with force-variante
    branch), L2562+ (tipo radio handler with platos reset),
    L2614+ (filaConError + row red border with 4 individual
    border properties).

### F8.5b ✅ Variantes de platos — Sesión 5b (combos × variantes, admin write path) — CLOSED
- **Closed**: 2026-05-23.
- **Goal**: Wire the admin combo form write path so admin can
  lock a variante per plato when creating or editing a combo.
  F8.5a (display) was already in place; F8.5b activates the
  F8.5a display path with real data.
- **Most invasive F8 session**: 23 reference sites of
  nuevoCombo.platoIds migrated from string[] to ComboItem[],
  plus 6 reset literals where the entire nuevoCombo shape is
  hard-coded. Required two investigations (A: data model,
  B: UX) before implementation to avoid mid-implementation
  bugs from missed sites.
- **15 decisions locked across Investigations A and B**:
  - Shape: ComboItem[] (Option B) over cart-key strings.
    Compile-time type safety wins; F8.4a/b cart-key pattern
    not applicable here (admin form is typed editable record,
    not a Map key).
  - Custom Select component reused (project's @/components/ui/Select
    used at plato del día L2743 and plato ganador L2903, L2917).
    NO native select, NO radios. Maintains design system.
  - Auto-pick variantes[0] (orden ASC) on plato selection.
    Matches F8.4a/b cart pattern.
  - Force-variante validation on legacy combo edit. Accept
    friction — guarantees forward-only data consistency.
    Legacy combos with variante_id NULL trigger save block
    until admin picks a variante.
  - Admin combo list shows enriched names ('Pizza (Mediana) + Limonada')
    matching F8.5a public display.
  - Dropdown placement: inline below plato name (user-locked
    in F8.5 visual mockup review).
  - Label format: 'Mediana — \$20.000' (em-dash + tertiary)
    matching platoDiaOptions L658-665.
  - Label above dropdown: 'Variante:' (10px text-tertiary).
  - No live feedback on variante change beyond existing
    ahorro display + row right-side price.
  - Empty-state for non-variante platos: render nothing
    (presence/absence of dropdown IS the variante indicator).
  - Search input unchanged (no match against variante names).
  - Cascade warning copy enriquecido — RESUELTO (commit b5bb0f2): el modal de borrado de variante computaba promosCount (y gateaba el aviso vía refCount) pero solo renderizaba combos y destacados → borrar una variante referenciada SOLO por promos mostraba el engañoso "Vinculadas a 0 combos y 0 destacados". Ahora la frase se arma dinámicamente solo con las cláusulas con count > 0, con singular/plural por sustantivo y unión española natural (a; a y b; a, b y c), así un borrado solo-promos lee "Vinculadas a 1 promo". Solo display; flujo delete/save intacto. (Pendiente aparte, no relacionado: "legacy combo badge in admin list", línea siguiente.)
  - Legacy combo badge in admin list — WONTFIX: un combo legacy (combo_platos.variante_id NULL para un plato que ahora tiene variantes) ya queda guardado por validarCombo, que bloquea el guardado y pide elegir variante en el momento exacto del riesgo. La población de combos legacy es ~cero pre-lanzamiento tras las limpiezas de datos (F8.5b→PIEZA 3). Un badge solo pre-anunciaría un estado ya guardado al editar. En su lugar se atacó el hueco real (borrado de plato sin aviso) — ver el aviso de borrado de plato (entrada aparte).
  - Force-variante error copy: banner + per-row red border.
  - Implementation order: types → 6 reset literals (locking
    step) → consumers → UI. TS stays green between steps.
- **New type added** (src/app/menu/page.tsx L48-52):
  ComboItem = { plato_id: string; variante_id: string | null }.
  Local to menu/page.tsx (no cross-file consumer needed yet;
  if F8.7/F8.8 needs same shape, promote to types/index.ts).
- **6 reset literals migrated** to platoIds: [] as ComboItem[]:
  initial state (L147), agregarCombo cleanup, actualizarCombo
  cleanup, 2x '+Crear combo' buttons (empty-state L2214 +
  list header L2219), Cancel button.
- **23 reference sites migrated** (per Investigation A enumeration):
  - validarCombo (L744-762): typed signature + force-variante
    branch ('Selecciona una variante para cada plato con opciones').
  - precioIndividualCombo memo (L730-740): variante.precio
    lookup with fallback to plato.precio.
  - agregarCombo + actualizarCombo (L781-789, L849-857):
    insert variante_id into combo_platos rows.
  - Toggle handler (L2294-2303): auto-pick variantes[0] on
    add via p.variantes?.[0]?.id ?? null; discard variante_id
    on remove via filter on plato_id.
  - Row UI accessors (L2295, L2316): .includes →
    .some(i => i.plato_id === p.id) for selected style + check.
  - Horario warn map (L2412): extracts item.plato_id.
  - Edit-pop (L2465-2468): reads raw combo.combo_platos
    (not lossy derived platosIds), maps to ComboItem[].
  - Admin list derive (L605-622): enriches platos names with
    (VarianteName) suffix; also CARRIES combo_platos in the
    derived shape so edit-pop has access (Claude Code caught
    this dependency that the prompt missed).
- **New JSX added** (L2319-2348): per-row inline Select
  dropdown that renders when isSelected && tieneVariantes.
  Wrapped with onClick stopPropagation to prevent row
  re-toggle. Label 'Variante:' (10px text-tertiary) above
  Select. Options labeled 'Mediana — \$20.000' format.
  Error prop bound to intentoCombo && !!errores.platos &&
  !currentItem?.variante_id for per-row red border.
- **Row right-side price** (L2286-2292, L2315): IIFE checks
  currentItem?.variante_id → variante.precio; falls back to
  plato.precio. Live updates when admin changes dropdown.
- **Row container restructured**: outer onClick div lost
  flex layout; inner flex row hosts existing content; dropdown
  stacks as second child of outer. Same pattern as F8.4b
  promo modal. Without this, dropdown would have rendered
  beside the check circle instead of below the row.
- **Public side activates automatically**: F8.5a's
  enriquecerComboPlatos helper picks up the new variante_id
  values without any [slug]/page.tsx changes. The admin write
  → DB → hook → public display chain works end-to-end.
- **Smoke test passed 6/6**:
  1. Create combo without variantes — no spurious dropdowns,
     admin list shows 'jul + 3434'. Regression OK. ✅
  2. Create combo with variante — dropdown auto-shows Mediana,
     row price reflects variante \$20k, admin list shows
     'Pizza Test F8.4b (Mediana) + jul'. ✅
  3. Switch variante Mediana → Grande in dropdown — row price
     live-updates to \$30k, ahorro recalculates, admin list
     shows '(Grande)' after save. ✅
  4. Force-variante on Combo Test F8.5a (legacy NULL): empty
     placeholder + red border + banner block save; after
     selecting Mediana, save succeeds, list shows '(Mediana)'. ✅
  5. Toggle off variante plato: dropdown disappears, variante_id
     discarded; reopening edit confirms clean state. ✅
  6. Public end-to-end: card shows 'Pizza Test F8.4b (Grande) + ...',
     modal shows '(Grande)' name + \$30k precio individual,
     ahorro \$49.334 / -62% (math: \$79.334 individual - \$30k combo).
     F8.5a display path activated correctly with F8.5b-written
     data. ✅
- **Zero console errors** across admin and public routes during
  the full smoke test session.
- **Percentage rounding audit (bonus)**: user flagged a UX
  question on whether percentages might be incorrectly rounded
  (e.g., 88.7% as 88% instead of 89%). Full codebase audit
  confirmed all 10 calculated percentage sites use Math.round
  consistently. No bug found, no fix needed. The two F8.5b
  test cases (-53% for 53.367%, -64% for 64.286%) are
  mathematically correct.
- **Line delta**: +122 / -37 = +85 net in src/app/menu/page.tsx.
  Estimate was +75; actual +10 from outer container restructuring.
- **Deviations from spec** (both safer):
  1. Admin list derive carries combo_platos raw alongside the
     enriched names. Spec only said 'enrich names'. Without
     carrying combo_platos, the edit-pop (which reads from
     combo.combo_platos) would break. Claude Code identified
     the dependency.
  2. Row container restructured per the spec's anticipation
     (same pattern as F8.4b promo modal).
- **F8 progress**: 7 of 8 sessions complete. Customer-facing
  flow 100% complete (cards, detail modal, cart, drawer,
  WhatsApp, promos, combos). Admin write paths for variantes
  in combos complete.
- **Next sessions**:
  - F8.6: promos × variantes admin validation (block
    precio_especial for platos con variantes).
  - F8.7: plato del día/ganador admin form with variante
    selector.
  - F8.8: polish (cascade warning copy enrichment, legacy
    combo badge in admin list, final edge cases).
- **Where**:
  - src/app/menu/page.tsx L48-52 (ComboItem type), L147 + 5
    other reset literals, L605-622 (admin list derive +
    combo_platos carry), L730-762 (precioIndividualCombo memo
    + validarCombo with force-variante), L781-789 + L849-857
    (insert variante_id), L2282-2351 (row JSX with Select
    dropdown), L2412 (horario warn map), L2465-2468 (edit-pop).

### F8.5a ✅ Variantes de platos — Sesión 5a (combos × variantes, display) — CLOSED
- **Closed**: 2026-05-22.
- **Goal**: Extend public combo display to support variantes.
  Read-only foundation; F8.5b will wire the admin write path.
- **Scope split**: F8.5 was split into F8.5a (display) and
  F8.5b (admin form). Pattern mirrors F8.4a/F8.4b split.
  F8.5a is low-risk because all existing combos have
  combo_platos.variante_id = NULL — display behavior is
  byte-identical until F8.5b starts writing variante data.
- **Decisions locked**:
  1. Client-side variante resolution (no Supabase nested
     embed). Hook brings only variante_id from combo_platos;
     consumer resolves variante name + price from in-memory
     todosLosPlatos / categorias. Both surfaces already hold
     this data via useCategoriasYPlatos, so embed adds no
     value and adds first-try failure risk.
  2. Strategy B for precio_individual backward compat:
     recompute client-side from comboPlatos[].precioEfectivo.
     Stored column becomes best-effort cache, no longer used
     for display. Repairs legacy combos without migration.
  3. Bonus: combo card name join also enriched (not just modal).
     Combo card now shows 'Pizza (Mediana) + Limonada (500ml)'
     when variante_id is set, identical to what the modal
     would show.
- **Types added** (src/types/index.ts):
  - ComboPlatoRaw: hook output shape (plato_id, variante_id,
    nombre, precioBase).
  - ComboPlatoEnriquecido: display shape (+ varianteNombre,
    precioEfectivo).
  - ComboPlato extended with variante_id? + platos? (additive,
    safe; no callers rely on absent fields).
- **Hook updated** (src/hooks/data/useCombos.ts):
  - Both fetchCombosPublic and fetchCombosAdmin selects bring
    variante_id from combo_platos.
  - Public mapping builds comboPlatos: ComboPlatoRaw[]
    alongside existing platos: string[] (backward compat).
  - ComboAdmin.combo_platos shape extended.
- **Helper** (src/app/[slug]/page.tsx near F8.4b helpers):
  enriquecerComboPlatos(rawComboPlatos, todosLosPlatos)
  resolves variante_id against in-memory plato data.
  Defensive: if variante_id is set but variante was since
  deleted (shouldn't happen with ON DELETE CASCADE but
  defensive), falls back to plato.precio sentinel.
  Helper also carries foto_url + descripcion because modal
  rows render them — without these the modal would have
  regressed (spec'd shape would have dropped them; Claude
  Code caught this and added them).
- **Combo card display** (src/app/[slug]/page.tsx L1267-1271):
  Name join now reads from comboPlatosEnriquecidos with
  varianteNombre suffix in parenthesis. Falls back to
  combo.platos.join(' + ') for defensive empty case.
- **Combo modal display** (src/app/[slug]/page.tsx L1370-1547):
  - platosDelCombo from comboPlatosEnriquecidos with
    defensive fallback to categorias.flatMap.filter
    reconstruction.
  - precioIndividual recomputed client-side via reduce when
    enriquecidos present; falls back to stored value
    otherwise.
  - ahorro and porcentajeAhorro auto-updated since they
    derive from precioIndividual. Div-by-zero guard added.
  - Per-row name shows '(VarianteName)' when applicable.
  - Per-row precio uses precioEfectivo with sentinel fallback.
  - 'Comprando por separado' summary uses recomputed total.
- **Card click already passes enriched combo**: combosVisibles
  now filters combosEnriquecidos (instead of combosPublico),
  so the combo object passed to setComboDetalle on card click
  already carries comboPlatosEnriquecidos. No explicit
  Task 6-style wiring needed.
- **Smoke test passed 4/4 + 1 extra confirmation**:
  1. Regression: 6 existing combos render byte-identical to
     pre-F8.5a. ✅
  2. Manual variante_id injection via Supabase (Mediana into
     Combo Test F8.5a): card shows 'Plato (Mediana)', modal
     shows variante name + variante price, ahorro recomputed.
     Math correct: $70k individual / $25k combo / $45k ahorro
     / -64% badge.
  3. Other combos unaffected by injection: dos_por_uno combo
     and others remained unchanged. ✅
  4. Cleanup: variante_id reset to NULL, combo reverted to
     baseline state. ✅
  5. Extra confirmation with Grande variante ($30k != base
     $20k): modal showed 'Plato (Grande)' + precio individual
     $30k + total $80k + ahorro $55k (-69%). This
     unambiguously proved variante.precio path is correct
     (Mediana coincidentally equaled plato base price).
- **Deviations from spec** (both safer, both noted by Claude
  Code):
  1. Helper carries foto_url + descripcion (modal regression
     prevention).
  2. Card strikethrough price unchanged in F8.5a (per literal
     scope — only name join changed). F8.5b will extend this
     for consistency once variante_id is being written by
     admin form.
- **Line delta**: +101 / -17 = +84 net across 3 files.
- **F8 flujo cliente sigue 100% COMPLETO**: cards, detail
  modal, cart, drawer, WhatsApp, promos, AND combos display
  all work end-to-end with variantes.
- **Next sessions**:
  - F8.5b: admin combo form write path (23 platoIds reference
    sites including 6 reset literals, dropdown selector with
    'Variante:' label below plato name, force-variante rule,
    variante_id inserts in agregarCombo and actualizarCombo,
    edit pre-population, fix precioIndividualCombo admin memo).
  - F8.6: promos × variantes admin validation (block
    precio_especial for platos with variantes).
  - F8.7: plato del día / ganador admin form with variante
    selector.
  - F8.8: polish + edge cases.
- **Where**:
  - src/types/index.ts L107-132 (new interfaces + ComboPlato
    extension).
  - src/hooks/data/useCombos.ts L5, L15-16, L34, L41, L52-60,
    L71 (variante_id in selects + comboPlatos build).
  - src/app/[slug]/page.tsx L66-93 (enriquecerComboPlatos
    helper), L229-234 (combosEnriquecidos), L266
    (combosVisibles switch), L1267-1271 (card name join),
    L1370-1393 (modal precio recompute), L1467 (key),
    L1502 (name), L1523 (precio), L1546 (summary).

### F8.4b ✅ Variantes de platos — Sesión 4b (Promo modal) — CLOSED
- **Closed**: 2026-05-21.
- **Goal**: Extend the promo modal in /[slug] public page to
  support platos with variantes. Last pendiente del flujo
  cliente para F8. F8.4a (commit 31f31a3) dejó un TODO comment
  near agregarPromoAlPedido marking exactly where this work
  belonged.
- **3 helpers added at module level** (after parseCartKey):
  - precioEfectivo(plato, varianteId?) — returns variante.precio
    when applicable, else plato.precio. Fallback ensures
    byte-identical behavior for no-variante platos.
  - algunaKeyEsDePlato(seleccion, platoId) — replaces
    promoSeleccion.includes(plato.id) since selection now stores
    composite keys for variante platos.
  - obtenerKeyDePlato(seleccion, platoId) — gets the exact key
    (composite or bare) for a plato in the selection.
- **promoSeleccion data shape**: stays string[] but values are
  composite keys via makeCartKey for variantes. UUIDs don't
  contain '__' so the separator is safe (same pattern as cart).
- **UI per row (inline expand pattern)**:
  - When row checked + plato has variantes → inline variante
    selector renders below the row content with vertical radios.
  - Selector uses stopPropagation on label onClick to prevent
    triggering row toggle when changing variante.
  - Radio name unique per plato (variante-promo-${plato.id}) to
    avoid radio group collisions across rows.
  - Selector NOT rendered for non-variante platos (regression
    safe).
- **Auto-select (D2)**: when checking a row with variantes, the
  first variante (orden ASC) is auto-selected immediately. No
  "incomplete selection" state. CTA validation stays simple
  (just promoSeleccion.length > 0).
- **Row container restructured**: outer onClick div lost its
  flex layout; inner wrapper now does the flex row (image +
  name + price + check circle). The selector stacks below as
  a second child of the outer div. This is the only structural
  change to the existing row JSX.
- **Per-row price display**: 3 price branches (2x1, descuento,
  precio_especial) all swapped plato.precio → precioEfectivoPlato.
  For non-variante platos, precioEfectivo returns plato.precio,
  so behavior is unchanged. For variante platos, the math
  applies against the selected variante's price.
- **agregarPromoAlPedido refactor**:
  - Iterates over composite keys (was bare platoIds).
  - Parses each key via parseCartKey.
  - Defensive check: if varianteId is set but variante no
    longer exists, skip the entry silently (stale handling).
  - Math uses precioEfectivo as base.
  - Writes to pedido[key] and preciosPromo[key] using the
    composite key, ensuring distinct cart entries for variante
    vs non-variante items even in the same promo.
- **Promo types handled**:
  - dos_por_uno (2x1): +2 units, precioUnitario = round(base/2).
  - descuento: +1 unit, precioUnitario = round(base * (1 - valor/100)).
  - precio_especial: +1 unit, precioUnitario = valor (fixed,
    base unused — interim per D4).
- **D4 interim for precio_especial**: with variantes, the fixed
  promoDetalle.valor applies to whichever variante is selected.
  Semantically dubious (Grande and Mediana both cost the same
  special price), but F8.6 will block this configuration at
  admin level. F8.4b ships the interim behavior with a comment
  noting the deferral.
- **TODO(F8.4b) comment removed** from agregarPromoAlPedido.
- **Smoke test passed (8/8)**:
  1. Regression: 2x1 with non-variante plato — unchanged: ✅
  2. Regression: descuento with non-variante plato — unchanged: ✅
  3. Regression: precio_especial with non-variante plato — unchanged: ✅
  4. 2x1 with variante plato (Mediana pre-selected, cart key composite, $20k → $10k unit): ✅
  5. Switch variante in promo modal (Mediana → Grande, price updates, cart key updates): ✅
  6. Descuento with variante plato (30% off applied to variante price): ✅
  7. Precio especial with variante plato (interim — fixed valor regardless of variante): ✅
  8. Mixed promo cart (variante + non-variante in same promo, 2 distinct cart entries): ✅ CRITICAL
- **Deviations from spec** (both safer, both noted by Claude Code):
  1. Used --theme-border instead of --theme-border-subtle (the
     subtle variant doesn't exist in the codebase — would have
     rendered no border).
  2. Wrapped existing row content in inner flex div instead of
     keeping outer flex; without this, the selector would have
     rendered beside the check circle instead of below the row.
- **Line delta**: +101 / -23 = +78 net in src/app/[slug]/page.tsx.
- **Cleanest F8 session yet**: zero bugs found mid-implementation
  (vs F8.4a which had 2). The F8.4a foundation (composite keys
  + helpers) made F8.4b's changes mostly mechanical.
- **F8 flujo cliente COMPLETO**: with F8.4b done, the customer-
  facing flow for variantes works end-to-end (cards, detail
  modal, cart, drawer, WhatsApp, AND promos). Remaining F8
  sessions touch admin and edge cases.
- **Next sessions**:
  - F8.5: combos × variantes (variante_id lock at config time,
    admin form variant selector, public combo modal display).
  - F8.6: promos × variantes admin validation (block
    precio_especial for platos with variantes).
  - F8.7: plato del día/ganador admin form with variante
    selector.
  - F8.8: polish, edge cases, final WhatsApp/Sorpréndeme
    verification.
- **Where**: src/app/[slug]/page.tsx (helpers L49-64,
  agregarPromoAlPedido L1546-1576, row seleccion vars
  L1636-1644, row toggle handler L1647-1660, restructured
  row container L1664-1670, per-row price display L1693-1714,
  inline variante selector L1728-1774).

### F8.4a ✅ Variantes de platos — Sesión 4a (Public menu + cart refactor) — CLOSED
- **Closed**: 2026-05-20.
- **Goal**: Extend public menu (/[slug]) to support platos with
  variantes end-to-end. This is the MOST critical UX session of
  F8 (touches conversion-critical cart flow).
- **Critical projection fix**: public categorias projection in
  /[slug]/page.tsx L82-103 dropped variantes. Investigation
  caught this — first task added `variantes: p.variantes || []`
  with `.slice().sort()` by orden ASC. Without this fix, nothing
  else in F8.4a would have worked.
- **Cart key composite strings**: introduced
  CART_KEY_SEP = '__', helpers makeCartKey(platoId, varianteId?)
  and parseCartKey(key). UUIDs don't contain "__" so the
  separator is safe. Combos and platos without variantes use
  bare platoId; variantes use ${platoId}__${varianteId}.
- **Cart functions refactored**:
  - agregarAlPedido / quitarDelPedido signatures changed to
    (cartKey: string). All callers updated.
  - itemsPedido resolver: parses composite key, looks up plato +
    variante, attaches them to each item along with cartKey.
    Defensive filter drops items where varianteId references a
    non-existent variante (stale cart handling).
  - totalPedido uses effective price (promo → variante → plato).
- **UI changes**:
  - Card grid: "desde $X" prefix when plato has variantes; NO
    inline Qty button when variantes (force modal opening).
  - Detail modal: new "Elige una opción" section with vertical
    radio buttons, one per variante, first pre-selected by
    orden ASC.
  - Modal price block, qty stepper, and "Agregar $X" button
    react to varianteSeleccionadaId.
  - Same hide-Qty + price prefix logic applied to Sorpréndeme
    cards, ganador card, and plato del día card.
  - Cart drawer line items: "Pizza Margarita · Mediana" with
    item.variante?.nombre, item.cartKey used for key and +/-
    callbacks, variante.precio used for unit/line prices.
  - Floating tray summary: also includes "· Variante" suffix
    for consistency with drawer.
- **External integrations (D5)**:
  - WhatsApp message: lines now use "1× Pizza Margarita (Mediana)
    $25.000" with parenthesis format.
  - pedidos_whatsapp insert: productos[].nombre with parenthesis
    + productos[].precio = variante.precio.
- **Defensive fallbacks (D4)**:
  - Plato del día / ganador with variantes (variante_id always
    NULL today, will be wired in F8.7): card shows "desde $X"
    + no inline +, modal opens in 'normal' mode (ignores
    precioEspecial). Both card display and onClick handle this.
- **Out-of-hours cleanup**: parses composite keys via
  parseCartKey to get platoId, and also prunes preciosPromo.
- **Bugs found and fixed mid-smoke-test**:
  - **Bug 1**: useEffect for variante pre-select had
    [platoDetalle, todosLosPlatos] in dep array. todosLosPlatos
    is reconstructed on every render (not memoized), causing the
    effect to re-run and reset selection on every render. User
    couldn't change variante because state reverted immediately.
    Fix: dep array reduced to [platoDetalle?.id]. Same anti-
    pattern as BL.17 — non-primitive deps that change reference
    every render.
  - **Bug 2**: Plato del día card display did NOT apply D4
    defensive fallback. Showed precio tachado + precioEspecial
    visible + inline "+" button even when plato had variantes.
    The onClick was defensive (T8) but the visual was not.
    Same issue on Ganador card price (T6 added Qty-hide but
    missed "desde" prefix on price).
    Fix: wrapped both card render blocks in IIFE computing
    tieneVariantes once; conditional price ("desde $X" vs
    crossed-out + precioEspecial) and conditional button render.
  - Both bugs caught BEFORE commit. Validates exhaustive smoke
    testing.
- **Promo modal**: NOT touched (deferred to F8.4b). TODO comment
  added at agregarPromoAlPedido. Promos applied to variantized
  platos will produce incorrect math until F8.4b — acceptable
  for F8.4a deploy because admin F8.2/F8.3 validations don't
  yet block this configuration (will be added in F8.6).
- **Smoke test passed (10/10)**:
  1. Card "desde $X" prefix: ✅
  2. Inline + hidden when variantes: ✅
  3. Modal opens with radio selector + first variante pre-selected: ✅
  4. Change variante updates price reactively (PASS after Bug 1 fix): ✅
  5. Agregar variante creates cart line: ✅
  6. Agregar SAME plato + DIFFERENT variante = SEPARATE line items: ✅ (CRITICAL)
  7. WhatsApp message with parenthesis format and variant prices: ✅
  8. pedidos_whatsapp insert with parenthesis and variant prices: ✅
  9. Plato del día card + modal defensive (PASS after Bug 2 fix): ✅
  10. Stale cart filter when variante deleted in DB: ✅
- **Line delta**: +280 / -62 = +218 net in src/app/[slug]/page.tsx
    (includes both bug fixes applied mid-smoke-test).
- **Next**: F8.4b (promo modal per-row variant selectors +
  promo math against variante).
- **Where**: src/app/[slug]/page.tsx (helpers L34-47, projection
  L100, varianteSeleccionadaId state L66, pre-select effect
  L183-197, agregar/quitar L248-272, itemsPedido L274-291,
  totalPedido L292-297, Qty component L362-373, WhatsApp +
  insert L341-360, ganador card L973-984, plato del día card
  L990-1072, sorpresa card L1114-1116, grid card L1750-1754,
  promo TODO L1516-1517, cart drawer L1872-1933, detail modal
  selector L2283-2321, modal price block L2323-2336, modal
  stepper + add button L2497-2553).

### F8.3 ✅ Variantes de platos — Sesión 3 (Admin form EDIT) — CLOSED
- **Closed**: 2026-05-19.
- **Goal**: Extend "editar plato" expanded panel in /menu admin to
  support variantes (CRUD on existing variantes + toggle ON/OFF
  + reorder). Builds on F8.2 CREATE.
- **UI added in EDIT panel (expanded under plato card)**:
  - Same variantes editor pattern as F8.2 (toggle, rows of
    [nombre | precio | ▲ | ▼ | ✕], "+ Agregar variante").
  - Precio input wrapped in {!editPlato.hasVariantes && (...)}.
  - Toggle OFF on plato with existing variantes pre-populates
    precio input with min(variantes.precio), editable.
  - Cascade-warning modal: queries combo_platos.variante_id,
    plato_del_dia.variante_id, plato_ganador.variante_id BEFORE
    delete; if any references, shows modal asking confirmation.
- **Admin display change**: plato cards now show "desde $X" when
  plato.variantes.length > 0 (consistent with public F8.4 to come).
- **State**: editPlato widened with hasVariantes + variantes
  array with optional id per row. New originalVariantes state
  holds the DB snapshot at panel open for diff computation. New
  cascadeWarning state holds the modal data.
- **TRUE DIFF persistence (guardarEdicionPlato)**:
  - If hasVariantes ON: computes rowsToInsert (new, no id),
    rowsToUpdate (existing with id, where nombre/precio/orden
    changed vs originalVariantes), rowsToDelete (in original but
    not in form).
  - If hasVariantes OFF: rowsToDelete = ALL originalVariantes
    (forces deletion regardless of in-memory state).
  - Executes DELETE-IN ids, per-row UPDATE, bulk INSERT.
  - Wrapped in disponible: false → diff → disponible: true
    envelope (only when hasVariantes, to hide partial state).
  - Computes precioParaUpdate = min(variantes) if hasVariantes,
    else parseInt(precio).
- **UX decisions implemented**:
  - D1: TRUE DIFF persistence (preserves variante ids for F8.5+
    downstream references).
  - D2: Cascade-warning modal built now (defensive). Currently
    always returns 0 refs because F8.5/F8.6/F8.7 not implemented
    yet, but the code path is in place.
  - D3: Admin "desde $X" display when has variantes.
  - D4: Toggle OFF pre-populates precio with min(variantes),
    editable (user can override).
- **Bug found and fixed mid-implementation**:
  - Initial diff trusted editPlato.variantes (in-memory) to
    compute rowsToDelete. But F8.2's Q2 decision is "hide but
    keep state" — array stays populated even when toggle OFF.
    Result: toggling OFF + save left variantes in DB silently.
  - Fix: explicit branch on hasVariantes — if OFF, mark ALL
    originalVariantes for deletion.
  - This validates the decision to do exhaustive smoke testing
    before commit.
- **Drift fixes**: guardarEdicionPlato now uses nombre.trim() and
  descripcion.trim() || null (aligned with F8.2 agregarPlato).
- **Smoke test passed (13/13)**:
  1. Admin "desde $X" display when variantes present: ✅
  2. EDIT plato without variantes, no changes (regression): ✅
  3. EDIT plato without variantes, modify fields: ✅
  4. EDIT plato with variantes, seed correctly: ✅
  5. UPDATE selectivo (single variante modified, others untouched
     verified by updated_at timestamps in Supabase): ✅
  6. INSERT new variante (existing ones preserved): ✅
  7. DELETE selectivo via ✕ (other variantes' ids preserved): ✅
  8. Reorder ▲▼ persists with orden updates: ✅
  9. INSERT+UPDATE+DELETE combined in single save (ids preserved
     for unchanged rows, critical for downstream refs): ✅
  10. Toggle ON from plato without variantes, add + save: ✅
  11. Toggle OFF on plato with variantes (verified PASS after fix
      — variantes deleted from DB, card drops "desde" prefix): ✅
  12. Toggle OFF + override pre-populated precio: ✅
  13. Cancel discards all in-progress edits: ✅
- **Line delta**: +458 / -20 = +438 net in src/app/menu/page.tsx
  (UI duplication is acceptable; extracting to shared component
  is BL.13 deferred).
- **Next sessions**:
  - F8.4: public cards + modal + cart key composite (MOST critical
    UX-facing session; touches conversion-critical flow).
  - F8.5-F8.8: combos, promos, plato del día/ganador, polish.
- **Where**: src/app/menu/page.tsx (editPlato state ~L98-110,
  originalVariantes ~L111-116, cascadeWarning ~L117-123,
  guardarEdicionPlato + doSavePlatoEdit ~L1139-1291, panel
  seeding ~L1804-1820, variantes editor UI ~L1917-2101, cascade
  modal ~L3157-3214, admin "desde $X" ~L1858).

### F8.2 ✅ Variantes de platos — Sesión 2 (Admin form CREATE) — CLOSED
- **Closed**: 2026-05-19.
- **Goal**: Extend "crear plato" inline form in /menu admin to
  support variantes (e.g. Pizza chica/mediana/grande). Builds on
  F8.1 foundation.
- **UI added in /menu admin (crear plato inline form)**:
  - Toggle checkbox "Este plato tiene variantes (ej: tamaños,
    sabores)" between descripción and submit buttons.
  - When toggle ON: precio input hidden, variantes editor section
    appears with gray background.
  - Variantes editor: rows of [nombre input | precio input | ▲ | ▼
    | ✕] + "+ Agregar variante" button.
  - Reorder ▲▼ with disabled state at array boundaries.
  - Per-row error highlighting (red border) on validation failure.
  - Variantes-level error message (e.g. "Necesitas al menos 2
    variantes").
- **State**: nuevoPlato extended with hasVariantes: boolean and
  variantes: { nombre: string; precio: string }[].
- **Validation (validarPlato extended)**:
  - If hasVariantes: requires min 2 variantes, each with non-empty
    nombre and precio > 0.
  - If !hasVariantes: existing precio validation unchanged.
  - Function signature backwards-compatible with edit flow (F8.3).
- **Persistence (agregarPlato — 3-step transaction)**:
  - Step 1: INSERT plato with disponible: !hasVariantes,
    precio = min(variantes.precio) if hasVariantes else parseInt
    (precio).
  - Step 2: If hasVariantes, bulk INSERT plato_variantes with
    orden = array index. On failure: DELETE plato (rollback).
  - Step 3: If hasVariantes, UPDATE plato SET disponible = true.
  - Cache invalidation: mutateCategoriasYPlatos() (covers both
    plato and variantes embed).
- **UX decisions implemented**:
  - Q1: precio hidden when hasVariantes ON, auto-default to
    min(variantes) at submit.
  - Q2: Toggle OFF hides UI but keeps variantes array in state;
    if submitted with toggle OFF, variantes silently discarded.
  - Q3: Min 2 variantes required.
  - Q4: Placeholders "Ej: Pequeña" (nombre) and "$0" (precio).
  - Q5: Reorder ▲▼ enabled during create.
- **Smoke test passed (10/10)**:
  1. Create plato sin variantes (regression): ✅
  2. Create plato con 2 variantes: ✅
  3. Min 2 variantes validation: ✅
  4. Toggle ON → OFF → submit (silent discard): ✅
  5. Toggle ON → OFF → ON (keep state): ✅
  6. Reorder ▲▼ + boundary disabled: ✅
  7. Remove ✕: ✅
  8. Nombre vacío validation: ✅
  9. Precio inválido validation (0, negativo, alpha, vacío): ✅
  10. Cascade delete via plato deletion (variantes desaparecen
      automáticamente): ✅
- **Line delta**: +291 / -28 = +263 net in src/app/menu/page.tsx.
- **CSS variables**: used --bg-tertiary, --text-primary,
  --text-secondary, --border-light, --color-danger (matching the
  rest of menu/page.tsx; differed from initial prompt spec which
  referenced --theme-* tokens).
- **Next sessions**:
  - F8.3: admin form EDIT plato with variantes (similar UI in
    expanded edit panel).
  - F8.4: public cards + modal + cart key composite.
  - F8.5-F8.8: combos, promos, plato del día/ganador, polish.
- **Where**: src/app/menu/page.tsx (Plato interface L40-43,
  nuevoPlato state L73-85, categorias projection L562-567,
  validarPlato L964-996, agregarPlato L997-1079, form UI
  L1411-1612).

### F8.1 ✅ Variantes de platos — Sesión 1 (Schema + Types + Hook) — CLOSED
- **Closed**: 2026-05-19.
- **Goal**: Foundation for plato variantes feature (e.g. pizza
  chica/mediana/grande). Level 1 only — excluding variants by price.
- **Schema applied in Supabase (manual)**:
  - New table `plato_variantes` (id, plato_id FK, nombre, precio
    INT, orden, created_at, updated_at).
  - RLS enabled with 2 policies: "Variantes públicas" (SELECT, true)
    and "Variantes propias" (ALL, scoped by plato → restaurante →
    usuario_id).
  - Trigger for auto-update of updated_at.
  - Added nullable variante_id columns to combo_platos,
    plato_del_dia, plato_ganador (each with FK to plato_variantes,
    ON DELETE CASCADE).
- **Code changes (~ +15 lines)**:
  - src/types/index.ts: added Variante interface; extended Plato
    with variantes?: Variante[] and updated_at?: string (drift fix).
  - src/hooks/data/useCategoriasYPlatos.ts: select changed to
    `*, variantes:plato_variantes(*)` with nested ordering by
    foreign table.
- **Smoke test passed**: Verified via console log in /menu that
  each plato object has `variantes: []` field (23 platos, 0 with
  variantes since none created yet). No errors, no perf impact.
- **Next sessions**: F8.2 (admin form CREATE plato with variants),
  F8.3 (admin form EDIT), F8.4 (public cards + modal + cart key),
  F8.5 (combos × variants), F8.6 (promos × variants), F8.7
  (plato del día / ganador), F8.8 (polish: WhatsApp + Sorpréndeme).
- **Investigation report**: see this session's prompts for full
  context, UX decisions, and risk analysis.
- **Where**: src/types/index.ts (L66-90), src/hooks/data/useCategoriasYPlatos.ts (L17-20).

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

### BL.13 ✅ Extract /menu form sections to separate memoized components — RESUELTO
- **Resuelto**: 2026-06-12 por REFACTOR-F3 (ver entrada arriba; commits 18a909d → 09e53ca). Los 7 forms son componentes memoizados con estado local (más de lo propuesto acá: también VarianteEditor/CropModal compartidos, filas memoizadas y callbacks estables vía ref-delegation). Criterio de aceptación cumplido y verificado en dispositivo: una tecla en cualquier form re-renderiza SOLO ese form (el borrador ya no vive en la página), y los renders de página que quedan (búsqueda, punteros, aviso) saltan filas/secciones intactas por memo. Las regresiones temidas abajo (validaciones BL.3/BL.4/BL.8, reorder BL.9, persistencia BL.10) se cubrieron con smoke por commit.
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
- **Status**: RESUELTO (REFACTOR-F3; antes DEFERRED desde 2026-05-13).
- **Where**: src/app/menu/page.tsx — form sections under tabActiva ===
  'combos' subtabs. (Referencia histórica: post-F3 los forms viven en
  src/components/menu-admin/.)

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
- **Nota post-F3 (2026-06-12)**: la anatomía descrita acá (monolito de 2500
  líneas / 67 useState, getHorarioPlato en la página, precioIndividualCombo)
  ya no existe — REFACTOR-F3 movió forms y lookups a components/menu-admin/;
  los useMemo de este fix (horariosPorPlato, todosPlatos, options) siguen en
  la página y bajan como props.
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
