# Appendix E · Styles (verbatim)

Source: `src/ui/styles/*.css`, copied **verbatim**. Each block below follows a `<!-- verbatim: … -->` marker, so `npm run spec:sync` rewrites it from the file and the tests fail if it drifts (10, Keeping the spec exact). Together with [06 UI](../06-ui.md) this is enough to rebuild the look exactly: create the same eight files with this content and import them from `src/app/layout.tsx` in this order (later files win the cascade):

```ts
import '../ui/styles/base.css';
import '../ui/styles/shell.css';
import '../ui/styles/cards.css';
import '../ui/styles/map.css';
import '../ui/styles/sheets.css';
import '../ui/styles/table.css';
import '../ui/styles/admin.css';
import '../ui/styles/responsive.css';
```

Plain CSS only: no CSS modules, no Tailwind, no CSS-in-JS. Class names are global and match the components in 06. Fonts come from `next/font/google` in `layout.tsx` (since 1 Oct 2026: Open Sans 400/600/700/800 as `--font-open-sans` and Barlow Condensed 500/600/700 as `--font-barlow-condensed` for the map labels only; before: Barlow 400/500/600/700 as `--font-barlow`, Barlow Condensed 500/600/700 as `--font-barlow-condensed`, both `display: swap`, subset `latin`) and are set as CSS variables on `<html>`.

| File | Lines | What it styles |
|---|---|---|
| `base.css` | 173 | tokens (RELX brand), reset, buttons, focus, screen-reader helper |
| `shell.css` | 533 | app grid, top bar (brand, site pill, clock with its PHT zone, buttons, user menu), assistant drawer, New chat, messages, composer (and its Ideas button), chips, banners, drawer reopen tab, the sign-in screen and loading state, suggestions and the Ideas panel |
| `cards.css` | 271 | assistant cards: results (green rank circles), who has the rooms, the schedule card (green Free tag), proposal / booked, cancel, draft, hand-off, countdown, status words, error line |
| `map.css` | 873 | map side: search bar, floor tabs, view toggle, result pill, map card, 2D plan (zoom buttons and grab cursor, plate, areas, furniture, rooms, states, badges, you-marker), legend (one row, Key row) and highlight, timeline, 3D view (grab cursor, focus ring, the 360° button `.b3d-spin` and the compass `.b3d-compass`) and its labels |
| `sheets.css` | 539 | sheets and the New booking modal, room sheet, My bookings, reservation form (BookingFields, TimeFields, repeat, the read-only Name of Requestor line), booking details, form errors, Connect an AI app and the consent screen, messages (the unread count, thread rows, threads) |
| `table.css` | 333 | Table view: tabs, toolbars, filters, table, sticky column, status chips (green, orange, red, blue like the map), row actions, pagination |
| `admin.css` | 585 | the Admin area: frame (top bar, side navigation, page, assistant column), page heads, row selection and status chips for every status, dashboard columns and lists, the Admin booking sheet (actions, inline forms, change form, swap preview), the one-time password box, the inbox, stat tiles, charts (bars, columns, donut, legend, heatmap, the data table under each), the Admin assistant, tablet and phone layouts, print |
| `responsive.css` | 177 | tablet (≤ 1199 px) and phone (≤ 767 px) overrides (brand name, site pill and the user's first name hidden on phones; schedule rows put the time on its own line; the 2D plan fits the width), reduced motion; imported last so it wins |

**After the low-text cleanup (26 Sep 2026)** these classes and their rules are gone: `.facts`, `.fact` (room-sheet fact chips), `.bf-ticket`, `.bf-readonly`, `.bf-after` (the form's ticket line, Division block and status block), `.composer__hint`, `.placeholder-tag` (legend "plan traced" tag), `.dt-count` (table count lines), `.legend__title` and the `<details>` summary rules of the plan key, `.topbar__chat` (top-bar hide button). New or changed: `.brand__name` (the brand text; `display: none` on phones), `.legend__plan` (the Key row, `padding-top: 2px`), and two classes with no rule of their own: `.legend__key` (the Key button, styled by `.btn--link.btn--small`) and `.bf-days` (the weekday checkboxes, styled by `.bf-radios`).

**Zoom and grab (26 Sep 2026).** New in `map.css`: `.floormap-wrap` (`position: relative`, so the buttons sit on the plan), `.floormap.is-zoomed` (`cursor: grab`; `:active` → `grabbing`), `.map-zoom` (absolute, 8 px from the top and right, a grid with gap 4 px) and `.map-zoom button` (34 × 34, `--surface`, 1 px `--line` border, radius 8, `--shadow`; hover `--page`; disabled at 40% opacity with the default cursor). `.building3d canvas` now has `touch-action: none`, `cursor: grab` and `outline: none`, with `:active` → `grabbing` and `:focus-visible` → `box-shadow: inset 0 0 0 3px var(--blue)`. Gone from the phone overrides in `responsive.css`: the map card's sideways scroll, `.floormap { min-width: 520px }` and the sticky legend; the phone rules for the map are now `.floormap { max-height: none; min-height: 0 }` and `.map-card { padding: 8px }`. (The `touch-action` of the 2D plan is set inline by `FloorMap`, not in CSS.)

**Sign-in, suggestions and the schedule card (28 Sep 2026).** New in `shell.css`: `.user-menu` (flex, a 1 px `--plate` line on the left), `.user-menu__name`, `.user-menu__avatar` (30 px round, `--blue-tint` / `--blue`); `.app-loading` (full-height `--page`); `.signin` (full-height grid, centred) and `.signin__card` (≤ 400 px, white, 1 px `--line`, 14 px corners, shadow, 28/28/24 px padding), `.signin__card h1` (Barlow Condensed 28 px), `.signin__lede` / `.signin__note` (15 px `--muted`), `.signin__submit` (full width), `.signin .brand__name` (shown on phones too); `.suggestions` (grid, 14 px gap), `.suggestions__topic` (13 px bold uppercase `--muted`), `.suggestions .chip` (14 px), `.ideas` (bordered `--page` panel), `.composer__ideas` (36 × 36 lightbulb button; `--blue-tint` / `--blue` on hover and `.is-on`). New in `cards.css`: `.schedule-room` (a `--plate` line between rooms), `.schedule-room__head`, `.schedule-list`, `.schedule-item` (grid `7.5em | 1fr | auto`, a `--plate` line between rows), `.schedule-item__when` (bold, tabular numbers), `.schedule-item__who`, `.schedule-item--mine` (name in `--blue`). New in `sheets.css`: `.requestor-line`, `.requestor-line__label`, `.requestor-line strong` (the read-only name in a `--page` box); `.mb-name` is gone. New in `responsive.css` (phones): `.user-menu` 6 px padding, `.user-menu__label` hidden, `.schedule-item` two columns with `.schedule-item__when` on its own row.

**AI apps over MCP (29 Sep 2026, P1-36).** New at the end of `sheets.css`: `.copy-row` (flex, 8 px gap, normal weight: the MCP URL and Copy), `.connect-list` and `.consent__list` (margin 6 px 0 12 px, 20 px indent, 15 px; `li` 6 px apart), `.connect-list code` (13 px, `overflow-wrap: anywhere`, `--page` background, padding 1 × 5 px, 6 px corners) and `.consent h1` (`overflow-wrap: anywhere`, for long app names). The consent screen reuses `.signin`, `.signin__card`, `.signin__lede`, `.signin__note` and `.form-error`.

**Availability colours (29 Sep 2026).** `base.css` drops `--taken` and adds `--green`, `--green-tint`, `--green-fill`, `--red`, `--red-tint`, `--red-hatch`. `map.css`: `.room--free` (halo and shape: `--green-tint` / 1.5 px `--green`), `.room--fits` (`--green-fill` / 2.5 px `--green`), `.room--taken` (halo `--red-tint`; shape `url(#hatch)` / 1.5 px `--red`), `.badge circle` `--green`, `.floor-tab__count` `--green`, `.b3d-label--fits` and `--free` dots green, `.b3d-label--fits` green border, `.b3d-label--taken` dot `--red`, `.b3d-label__rank` `--green`. `cards.css`: `.rank` `--green`, new `.fit-tag--green` (`--green-tint` / `--green`). `table.css`: `.dt-chip--fits` / `--free` green (`--green-fill`, `--green-tint`, text `#0f5a2b`), `.dt-chip--taken` `--red-tint` with text `#8a1f17`. `shell.css`: `.demo-clock__zone` (the "PHT" after the clock: no underline, 12 px, 600, letter-spacing 0.04em).

**Admin area and messages (30 Sep 2026, P1-39 … P1-46).** New file `admin.css` (imported after `table.css`, before `responsive.css`): the `.admin` grid (64 px top bar; 200 px navigation, page, `--assistant-w` assistant; `.admin--no-assistant` without it), `.admin-nav` and `.admin-nav__link` (44 px, `.is-active` in `--ink`), `.admin-main`, `.admin-assistant-slot`; page heads (`.admin-page`, `.admin-page__head`, `--row`), `.admin-scroll` (table height for the Admin pages), `.dt-row--link` focus, `.is-picked` rows (`--blue-tint`), `.dt-check-col`, `.dt--compact`, status chips for every status (`.dt-status--approved` green, `--cancelled` red, `--completed` and `--held` grey), `.admin-warn` (orange); dashboard `.admin-columns`, `.admin-card`, `.admin-list` (`__row`, `__main`, `__reject`, `--compact`), `.admin-activity`; the booking sheet `.admin-sheet` (two columns), `.admin-actions`, `.admin-inline` (a bordered `--page` box), `.admin-change` (two-column form), `.admin-swap-preview`, `.otp` (the one-time password box); `.admin-inbox`; stat tiles `.stats` and `.stat` (`--warn`, `--good`, `--bad` top edges; `.stat__value` Barlow Condensed 34 px); charts `.chart-grid`, `.chart` (`__title`, `__note`, `__empty`, `__data`), `.bars` (`__row`, `__label`, `__track`, `__bar` in `--blue`, `__value`, `__detail`), `.columns` (`__axis`, `__bar`, `__value`, `__label`), `.donut`, `.legend-list`, `.heat` (`__row` as `display: contents`, `__hour`, `__day`, `__cell`), `.log-booking`, `.log-user`, `.log-room` chips; the assistant `.admin-assistant` (`__head`, `__body`, `__compose`), `.card--admin`, `.card__textarea`; ≤ 1199 px (two columns, the assistant floating from the right, one-column sheet and dashboard) and ≤ 767 px (one column, sideways navigation) layouts; print (only the page, charts without shadows or data tables). New at the end of `sheets.css`: `.count-badge` (a round red count; `--muted` grey), `.thread-list`, `.thread-row` (`--unread` blue border, `--active` `--blue-tint`; `__title`, `__last`), `.thread`, `.thread__about`, `.thread__list`, `.thread-msg` (`--mine` right in `--blue-tint`, `--system` dashed; `__head`, `__text`), `.thread__compose textarea`, `.topbar__messages`.

**RELX branding and a compact scale (1 Oct 2026).** At the owner's request the look follows reedelsevier.com.ph and everything is smaller. `base.css`: the tokens above (`--brand*`, `--font-map`, neutral greys instead of the green-grey ones, `--ink` `#18181a`); body 14 px; `.btn` 36 px high and 14 px (`.btn--small` 30 px, 13 px); `.btn--blue` renamed **`.btn--primary`** (RELX orange with ink text); `.btn--link` and `:focus-visible` in `--brand-text`. Every other stylesheet: font sizes one step down (34→28, 32→26, 28→22, 24→20, 20→17, 18→16, 16→14, 15→14, 14→13, 13→12, 12→11; the SVG `.badge text` and chart column labels unchanged) and fixed control sizes down (48→40, 44→36, 40→34, 38→32, 36→30, 34→30, 32→28 px, width and height alike); the top bar rows 64 → 52 px; old-ink shadows `rgb(34 48 58 / …)` → `rgb(24 24 26 / …)`; accents from `--blue` to the brand tokens except "yours", checked-in and info (`.card--selected`, `.result-card:hover`, `.fit-tag`, `.proposal-card`, focused fields, `.legend__state.is-on`, `.timeline__slot`, the selected table tab, hover and selected rows, `.dt-now`, `.bf-help a`, thread rows, the avatars, chips, the composer and its Ideas button, picked rows, chart bars). `shell.css`: `.topbar` gets `border-top: 3px solid var(--brand)`; `.brand__mark` 28 px in `--brand` with ink text; new `.brand__text` (grid), `.brand__name` (16 px, 700), `.brand__org` (11 px, 600, `--muted`), `.brand-link`; `.signin` on a charcoal gradient with a RELX-orange diagonal band; `.chip` 30 px, 13 px. `map.css`: `.room .label`, `.badge text` and `.b3d-label__rank` use `--font-map`; tighter search fields (36 px), floor tabs and view toggle (30 px), map side padding. `admin.css`: the navigation 184 px, the active item with an inset 4 px orange edge, compact stat tiles (24 px values, 150 px minimum) and dashboard rows (118 px time column, one line). `responsive.css`: phones hide `.brand__text` (was `.brand__name`).

## Design tokens (`:root` in `base.css`)

| Token | Value | Used for |
|---|---|---|
| `--font-ui` | `var(--font-open-sans), system-ui, sans-serif` | All UI text (Open Sans from next/font, as on reedelsevier.com.ph) |
| `--font-display` | `var(--font-open-sans), system-ui, sans-serif` | Headings, brand, big numbers |
| `--font-map` | `var(--font-barlow-condensed), sans-serif` | Only `.room .label`, `.badge text` and `.b3d-label__rank` (names must fit inside the rooms) |
| `--ink` | `#18181a` | Main text, dark buttons, text on orange, you-marker |
| `--muted` | `#5c5e61` | Secondary text, labels, help lines, the brand's company line |
| `--page` | `#f5f5f5` | Page background, subtle fills (chips, pills, hover) |
| `--surface` | `#ffffff` | Cards, sheets, inputs |
| `--plate` | `#e8e8e9` | Floor plate fills, dividers, unsuitable rooms, table stripes |
| `--plate-dark` | `#d8d8da` | Lift and stair core on the plan |
| `--line` | `#c4c5c7` | Borders of inputs, rooms, buttons |
| `--brand` | `#ff8200` | RELX orange: `.btn--primary` (with `--ink` text), the top strip, the brand mark, selected tabs, legend and cards, selected rows, the Admin nav edge, chart bars and the heatmap, unread thread borders |
| `--brand-hover` | `#e87500` | `.btn--primary:hover` |
| `--brand-text` | `#a85400` | Orange text on white (`.btn--link`, the avatar initials, fit tags, help links, "now"), focus rings and focused field borders |
| `--brand-tint` | `#fff1e3` | Hover rows, picked rows, focus glow, pressed legend state, chip hover, avatars, fit tags |
| `--blue` | `#1f5fd6` | "Yours" (map, 3D, timeline, table chips and rows, booked card), checked-in status |
| `--blue-tint` | `#dce7fb` | Info banners, your own messages, "yours" tints |
| `--orange` | `#b54c08` | "partly free", countdown under 30 s |
| `--orange-tint` | `#fce3cf` | "partly free" fill |
| `--green` | `#15803d` | "free" and "fits": edges, dots, rank badges (map, 3D labels, chat), floor-tab counts, green tags |
| `--green-tint` | `#dcf5e3` | "free" fill, the Free chip and tag |
| `--green-fill` | `#b5e8c4` | "fits" fill (stronger than free), the Fits chip |
| `--red` | `#c0352b` | "taken": room edge, 3D label dot, legend swatch edge |
| `--red-tint` | `#fbe4e1` | "taken" hatch base, the Taken chip |
| `--red-hatch` | `#f0bcb6` | "taken" hatch lines |
| `--danger` | `#b42318` | Errors: form-error alert, invalid field borders, cancel buttons |
| `--radius-btn` | `8px` | Buttons and inputs |
| `--radius-card` | `12px` | Cards and map card |
| `--shadow` | `0 1px 2px rgb(24 24 26 / 6%), 0 4px 16px rgb(24 24 26 / 6%)` | Cards and floating panels |
| `--assistant-w` | `400px` | Assistant column width (340 px at ≤ 1199 px) |

Other fixed colours used directly in the stylesheets (not tokens): plan plate `#f7f7f4` with walls `#4e585e`; area fills office `#eeeeea`, lift/stairs `#dfe3e0`, restroom `#e5edf0`, service `#e6e7e3`, amenity `#e7f0e8`, unlisted `#f7f0cf` (dashed `#c9b35a`); desks `#ffffff` / stroke `#aab2ae`; chairs `#c3cac6`; form-error background `#fef3f2`. Dark theme: not built (Phase 2).


## `src/ui/styles/base.css`

<!-- verbatim: src/ui/styles/base.css -->
```css
/* Design tokens from docs/spec/06-ui.md: RELX | Reed Elsevier branding, a compact scale. Dark theme is Phase 2. */
:root {
  --font-ui: var(--font-open-sans), system-ui, sans-serif;
  --font-display: var(--font-open-sans), system-ui, sans-serif;
  /* The map's room labels stay narrow so names fit inside the rooms (FloorMap measures them). */
  --font-map: var(--font-barlow-condensed), sans-serif;

  --ink: #18181a;
  --muted: #5c5e61;
  --page: #f5f5f5;
  --surface: #ffffff;
  --plate: #e8e8e9;
  --plate-dark: #d8d8da;
  --line: #c4c5c7;
  /*
   * RELX | Reed Elsevier branding (reedelsevier.com.ph): RELX orange for fills and accents, always with --ink text on
   * it (7.1:1; white on it would be 2.5:1); --brand-text for orange text and focus rings on white (5.3:1).
   */
  --brand: #ff8200;
  --brand-hover: #e87500;
  --brand-text: #a85400;
  --brand-tint: #fff1e3;
  /* Blue means "yours" (map, table, threads) and information. */
  --blue: #1f5fd6;
  --blue-tint: #dce7fb;
  --orange: #b54c08;
  --orange-tint: #fce3cf;
  /* Room availability (06 Room states): green = free, orange = partly free, red = taken, blue = yours. */
  --green: #15803d;
  --green-tint: #dcf5e3;
  --green-fill: #b5e8c4;
  --red: #c0352b;
  --red-tint: #fbe4e1;
  --red-hatch: #f0bcb6;
  --danger: #b42318;

  --radius-btn: 8px;
  --radius-card: 12px;
  --shadow: 0 1px 2px rgb(24 24 26 / 6%), 0 4px 16px rgb(24 24 26 / 6%);
  --assistant-w: 400px;
}

* {
  box-sizing: border-box;
}

html,
body {
  height: 100%;
}

body {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink);
  background: var(--page);
  -webkit-font-smoothing: antialiased;
}

button,
input,
select,
textarea {
  font: inherit;
  color: inherit;
}

:focus-visible {
  outline: 2px solid var(--brand-text);
  outline-offset: 2px;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: absolute;
  left: 12px;
  top: -48px;
  z-index: 100;
  background: var(--ink);
  color: #fff;
  padding: 8px 14px;
  border-radius: var(--radius-btn);
  text-decoration: none;
}
.skip-link:focus {
  top: 12px;
}

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 16px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--ink);
  background: var(--ink);
  color: #fff;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, opacity 0.15s;
}
.btn:hover {
  background: #2e2e32;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn--secondary {
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line);
}
.btn--secondary:hover {
  background: var(--page);
}
.btn--primary {
  background: var(--brand);
  border-color: var(--brand);
  color: var(--ink);
}
.btn--primary:hover {
  background: var(--brand-hover);
  border-color: var(--brand-hover);
}
.btn--danger {
  background: var(--danger);
  border-color: var(--danger);
}
.btn--danger:hover {
  background: #9a1e14;
}
.btn--small {
  min-height: 30px;
  padding: 0 12px;
  font-size: 13px;
}
.btn--link {
  background: none;
  border: none;
  color: var(--brand-text);
  padding: 0 4px;
  min-height: 36px;
}
.btn--link:hover {
  background: none;
  text-decoration: underline;
}
.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
```

## `src/ui/styles/shell.css`

<!-- verbatim: src/ui/styles/shell.css -->
```css
/* App shell: top bar, two-column layout and the assistant drawer. */

/* ---------- App shell ---------- */
.app {
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr);
  height: 100dvh;
}

/* The RELX orange strip along the top, as on reedelsevier.com.ph. */
.topbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  background: var(--surface);
  border-top: 3px solid var(--brand);
  border-bottom: 1px solid var(--line);
}
.brand {
  white-space: nowrap;
  font-family: var(--font-display);
  display: flex;
  align-items: center;
  gap: 10px;
}
/* The RELX logo (Brand.tsx), 22 px high; the symbol alone is for phones (responsive.css). */
.brand__logo {
  display: block;
  width: 85px;
  height: 22px;
}
.brand__symbol {
  display: none;
  width: 31px;
  height: 22px;
}
.brand__text {
  display: grid;
  line-height: 1.15;
  padding-left: 10px;
  border-left: 1px solid var(--line);
}
.brand__name {
  font-size: 16px;
  font-weight: 700;
}
.brand__org {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--muted);
}
.brand-link {
  color: inherit;
  text-decoration: none;
}
.topbar__spacer {
  flex: 1;
}
.demo-clock {
  font-size: 13px;
  color: var(--muted);
}
.demo-clock__zone {
  text-decoration: none;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
/* The signed-in person and Sign out (demo sign-in). */
.user-menu {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-left: 12px;
  border-left: 1px solid var(--plate);
}
.user-menu__name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}
.user-menu__avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--brand-tint);
  color: var(--brand-text);
  display: grid;
  place-items: center;
  font-weight: 700;
}
.site-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--page);
  font-size: 13px;
  font-weight: 500;
}
.site-pill select {
  border: none;
  background: transparent;
  font-weight: 600;
  cursor: pointer;
  max-width: 180px;
}

.main {
  display: grid;
  grid-template-columns: var(--assistant-w) minmax(0, 1fr);
  min-height: 0;
}

/* ---------- Assistant panel ---------- */
.assistant {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
  border-right: 1px solid var(--line);
}
/* Drawer: the column collapses to 0 and the panel clips while it slides, so its text never reflows. */
.main {
  position: relative;
  transition: grid-template-columns 0.3s ease;
}
.main--chat-hidden {
  grid-template-columns: 0 minmax(0, 1fr);
}
.assistant {
  min-width: 0;
  overflow: hidden;
}
@media (min-width: 768px) {
  .assistant > * {
    width: var(--assistant-w);
    flex-shrink: 0;
  }
  .assistant > .assistant__scroll {
    flex-shrink: 1;
  }
  .main--chat-hidden .assistant {
    visibility: hidden;
    border-right-color: transparent;
    transition: visibility 0s linear 0.3s;
  }
}
.assistant__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 10px 16px;
  border-bottom: 1px solid var(--plate);
}
.assistant__title {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 700;
  text-align: left;
  pointer-events: none;
}
.assistant__grip {
  display: none;
}
.icon-btn {
  flex: none;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
}
.assistant__new {
  flex: none;
  gap: 6px;
}
.icon-btn:hover {
  background: var(--page);
}
@media (max-width: 767px) {
  .icon-btn__collapse {
    transform: rotate(-90deg);
  }
}
.chat-reopen {
  position: absolute;
  left: 0;
  top: 16px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 9px;
  border: none;
  border-radius: 0 12px 12px 0;
  background: var(--ink);
  color: #fff;
  font-weight: 700;
  font-size: 13px;
  cursor: pointer;
  box-shadow: 0 4px 16px rgb(24 24 26 / 25%);
  animation: fade-in 0.2s ease-out 0.2s both;
}
.chat-reopen:hover {
  background: #2e2e32;
}
.chat-reopen__label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}
.chat-reopen__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--orange);
  box-shadow: 0 0 0 2px var(--ink);
}
@media (min-width: 768px) {
  .main--chat-hidden .mapside {
    padding-left: 56px;
  }
}
.assistant__scroll {
  flex: 1;
  overflow-y: auto;
  padding: 24px 20px 12px;
  scroll-behavior: smooth;
}
.assistant__composer {
  padding: 12px 16px 16px;
  border-top: 1px solid var(--plate);
  background: var(--surface);
}
.composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 6px 6px 6px 14px;
  background: var(--surface);
}
.composer:focus-within {
  border-color: var(--brand-text);
  box-shadow: 0 0 0 3px var(--brand-tint);
}
.composer textarea {
  flex: 1;
  border: none;
  resize: none;
  outline: none;
  padding: 8px 0;
  max-height: 140px;
  background: transparent;
  line-height: 1.4;
}
.composer__send {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--ink);
  color: #fff;
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: none;
}
.composer__send:disabled {
  opacity: 0.35;
  cursor: default;
}
.welcome h1 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.15;
  margin: 0 0 8px;
}
.welcome p {
  margin: 0 0 16px;
  color: var(--muted);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  min-height: 30px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.chip:hover {
  border-color: var(--brand);
  background: var(--brand-tint);
}

.msg {
  margin-bottom: 22px;
}
.msg__who {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 6px;
}
.msg__avatar {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--brand-tint);
  color: var(--brand-text);
  display: grid;
  place-items: center;
}
.msg--user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}
.bubble {
  max-width: 85%;
  font-size: 14px;
  line-height: 1.45;
  background: var(--ink);
  color: #fff;
  padding: 10px 14px;
  border-radius: 16px 16px 4px 16px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.request-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 6px;
}
.request-chip {
  font-size: 12px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--page);
  border: 1px solid var(--plate);
  color: var(--muted);
}
.assistant-text {
  font-size: 14px;
  line-height: 1.55;
  max-width: 62ch;
}
.assistant-text p {
  margin: 0 0 10px;
}
.assistant-text strong {
  font-weight: 700;
}
.assistant-text ul {
  margin: 0 0 8px;
  padding-left: 20px;
}
.assistant-text li {
  margin-bottom: 4px;
}
.typing {
  display: inline-flex;
  gap: 4px;
  padding: 8px 0;
}
.typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--line);
  animation: blink 1.2s infinite ease-in-out;
}
.typing span:nth-child(2) {
  animation-delay: 0.15s;
}
.typing span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes blink {
  0%,
  80%,
  100% {
    opacity: 0.3;
  }
  40% {
    opacity: 1;
  }
}

.banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  font-size: 13px;
  margin-bottom: 12px;
}
.banner--error {
  background: #fdecea;
  color: #7a1a12;
  border: 1px solid #f5c2bc;
}
.banner--info {
  background: var(--blue-tint);
  color: #173f8c;
  border: 1px solid #b9cdf3;
}
.banner__text {
  flex: 1;
}

/* ---------- Sign-in ---------- */
.app-loading {
  height: 100dvh;
  background: var(--page);
}
/* Charcoal with the RELX orange band, like the reedelsevier.com.ph banner. */
.signin {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: 24px 16px;
  background:
    linear-gradient(118deg, transparent 0 62%, var(--brand) 62% 67%, transparent 67%),
    linear-gradient(135deg, #34343a 0%, #18181a 70%);
}
.signin__card {
  width: min(400px, 100%);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
  padding: 28px 28px 24px;
}
.signin__card h1 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  line-height: 1.15;
  margin: 18px 0 0;
}
.signin__lede,
.signin__note {
  margin: 0;
  color: var(--muted);
  font-size: 14px;
}
/* The cards keep the whole lockup on phones too. */
.signin .brand__logo {
  display: block;
}
.signin .brand__symbol {
  display: none;
}
.signin .brand__text {
  display: grid;
}
.signin__submit {
  margin-top: 6px;
  width: 100%;
}

/* ---------- Suggestions (welcome and the Ideas panel) ---------- */
.suggestions {
  display: grid;
  gap: 10px;
}
.suggestions__topic {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
}
.suggestions .chip {
  font-size: 13px;
  padding: 0 14px;
}
.ideas {
  margin: 4px 0 16px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  background: var(--page);
}
.composer__ideas {
  width: 30px;
  height: 30px;
  margin: 0 0 4px -8px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--muted);
  display: grid;
  place-items: center;
  cursor: pointer;
  flex: none;
}
.composer__ideas:hover,
.composer__ideas.is-on {
  background: var(--brand-tint);
  color: var(--brand-text);
}
```

## `src/ui/styles/cards.css`

<!-- verbatim: src/ui/styles/cards.css -->
```css
/* Cards in the assistant panel (results, proposal, booked, cancel, draft, hand-off). */

/* ---------- Cards ---------- */
.appear {
  animation: rise 0.22s ease-out both;
  animation-delay: var(--delay, 0ms);
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
.floor-layer {
  animation: fade-in 0.25s ease-out;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}

.card {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 12px 14px;
  margin: 10px 0;
  box-shadow: var(--shadow);
}
.card--selected {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--brand-tint), var(--shadow);
}
.card--muted {
  opacity: 0.6;
}
.card h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}
.card__eyebrow {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 6px;
}
.card__meta {
  font-size: 14px;
  color: var(--muted);
  margin-top: 2px;
}
.card__row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.card__body {
  flex: 1;
  min-width: 0;
}
.card__note {
  font-size: 13px;
  color: var(--muted);
  margin-top: 8px;
}
.result-card {
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.result-card:hover {
  border-color: var(--brand);
}
.rank {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  display: grid;
  place-items: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
}
.fit-tag {
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--brand-tint);
  color: var(--brand-text);
  margin-top: 6px;
  margin-right: 4px;
}
.fit-tag--green {
  background: var(--green-tint);
  color: var(--green);
}
.fit-tag--orange {
  background: var(--orange-tint);
  color: var(--orange);
}
.owner-line {
  font-size: 14px;
  margin-top: 8px;
}
.owner-line strong {
  font-weight: 600;
}
.taken-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--plate);
}
.taken-row:first-of-type {
  border-top: none;
}
/* Who has the room (room_schedule): bookings and free times in time order. */
.schedule-room + .schedule-room {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--plate);
}
.schedule-room__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.schedule-list {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
}
.schedule-item {
  display: grid;
  grid-template-columns: 7.5em minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px 10px;
  padding: 8px 0;
  border-top: 1px solid var(--plate);
  font-size: 14px;
}
.schedule-item:first-child {
  border-top: none;
}
.schedule-item__when {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.schedule-item__who {
  min-width: 0;
}
.schedule-item__who .card__meta {
  display: block;
  font-size: 13px;
  margin-top: 0;
}
.schedule-item__who .fit-tag {
  margin-top: 0;
}
.schedule-item--mine .schedule-item__who strong {
  color: var(--blue);
}
.alt-times {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.more-link {
  font-size: 14px;
  color: var(--muted);
  margin-top: 4px;
}

.proposal-card {
  border-color: var(--brand);
}
.proposal__grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 14px;
  font-size: 14px;
  margin-top: 10px;
}
.proposal__grid dt {
  color: var(--muted);
}
.proposal__grid dd {
  margin: 0;
  font-weight: 500;
}
.countdown {
  flex: none;
  position: relative;
  width: 40px;
  height: 40px;
}
.countdown svg {
  transform: rotate(-90deg);
}
.countdown__label {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.booked-card {
  border-color: var(--blue);
}
.booked__check {
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--blue);
  color: #fff;
  display: grid;
  place-items: center;
}
.ticket {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 17px;
  letter-spacing: 0.02em;
}
.status-word {
  display: inline-block;
  font-size: 13px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--blue-tint);
  color: var(--blue);
}
.status-word--waiting {
  background: var(--orange-tint);
  color: var(--orange);
}
.status-word--done {
  background: var(--plate);
  color: var(--muted);
}
.error-line {
  font-size: 13px;
  color: var(--danger);
  margin-top: 8px;
}
.draft-text {
  width: 100%;
  min-height: 96px;
  margin-top: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 10px 12px;
  resize: vertical;
  line-height: 1.45;
}
```

## `src/ui/styles/map.css`

<!-- verbatim: src/ui/styles/map.css -->
```css
/* Map side: search bar, floor tabs, 2D map, 3D view and its labels, legend. */

/* ---------- Map panel ---------- */
.mapside {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
  min-height: 0;
  overflow-y: auto;
}
.mapside > * {
  flex-shrink: 0; /* the panel scrolls; its rows never squash */
}
.map-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.floor-tabs {
  display: inline-flex;
  padding: 3px;
  background: var(--plate);
  border-radius: 12px;
  position: relative;
}
.floor-tab {
  position: relative;
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-height: 30px;
  padding: 0 12px;
  border: none;
  background: transparent;
  border-radius: 9px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  color: var(--muted);
  z-index: 1;
}
.floor-tab {
  transition: background 0.2s ease, color 0.2s ease, box-shadow 0.2s ease;
}
.floor-tab[aria-selected='true'] {
  color: var(--ink);
  background: var(--surface);
  box-shadow: 0 1px 3px rgb(24 24 26 / 15%);
}
.floor-tab__name {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 700;
  align-self: center;
}
.floor-tab__count {
  font-weight: 600;
  color: var(--green);
  align-self: center;
}
.map-toolbar__spacer {
  flex: 1;
}
.slot-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.searchbar {
  display: flex;
  flex-wrap: wrap;
  align-items: stretch;
  gap: 8px;
  padding: 5px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
}
.searchbar .slot-controls {
  display: contents;
}
.searchbar .btn {
  min-height: 36px;
  padding: 0 16px;
  font-size: 14px;
}
.field {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-height: 36px;
  padding: 2px 10px;
  border: 1px solid var(--plate);
  border-radius: 10px;
  background: var(--page);
}
.field label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
}
.field select,
.field input {
  border: none;
  background: transparent;
  outline: none;
  font-weight: 600;
  font-size: 14px;
  min-height: 28px;
  padding: 0;
  cursor: pointer;
}
.field input[type='number'] {
  width: 56px;
}
.field:focus-within {
  border-color: var(--brand-text);
}
.search-note {
  font-size: 14px;
  color: var(--muted);
  padding: 6px 12px;
  border-radius: 10px;
}
.search-note--A {
  background: var(--blue-tint);
  color: #173f8c;
}
.search-note--B {
  background: var(--orange-tint);
  color: #7a3305;
}
.search-note--C,
.search-note--none {
  background: var(--plate);
  color: var(--ink);
}
.search-note strong {
  color: var(--ink);
}
.search-error {
  font-size: 13px;
  color: var(--danger);
}

.map-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 10px 10px 8px;
  box-shadow: var(--shadow);
}
.floormap {
  display: block;
  width: 100%;
  height: auto;
  max-height: calc(100dvh - 428px);
  min-height: 240px;
}
/* Zoom (FloorMap + mapZoom.ts): buttons top right; once zoomed, the plan is grabbed and dragged. */
.floormap-wrap {
  position: relative;
}
.floormap.is-zoomed {
  cursor: grab;
}
.floormap.is-zoomed:active {
  cursor: grabbing;
}
.map-zoom {
  position: absolute;
  top: 8px;
  right: 8px;
  display: grid;
  gap: 4px;
}
.map-zoom button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  box-shadow: var(--shadow);
  cursor: pointer;
}
.map-zoom button:hover:not(:disabled) {
  background: var(--page);
}
.map-zoom button:disabled {
  opacity: 0.4;
  cursor: default;
}
.floormap .plate {
  fill: #f7f7f4;
  stroke: #4e585e;
  stroke-width: 4;
  stroke-linejoin: round;
}
/* Everything that is not a bookable room, drawn like the appendix layouts: walls, symbols and small labels. */
.area {
  stroke: #8d9692;
  stroke-width: 1.4;
  fill: #eeeeea;
}
.area--core {
  fill: var(--plate-dark);
  stroke: #6f7975;
  stroke-width: 2.5;
}
.area--lift,
.area--stairs {
  fill: #dfe3e0;
}
.area--restroom {
  fill: #e5edf0;
}
.area--service {
  fill: #e6e7e3;
}
.area--amenity {
  fill: #e7f0e8;
}
.area--unlisted {
  fill: #f7f0cf;
  stroke: #c9b35a;
  stroke-dasharray: 5 3;
}
.area-symbols {
  fill: none;
  stroke: #9aa39f;
  stroke-width: 1;
}
.area-label {
  fill: #5f6965;
  font-weight: 600;
  letter-spacing: 0.02em;
  pointer-events: none;
  paint-order: stroke;
  stroke: #f7f7f4;
  stroke-width: 3px;
  stroke-linejoin: round;
}
.area-label--open {
  stroke-width: 4px;
  fill: #7d8783;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.furniture__desks {
  fill: #ffffff;
  stroke: #aab2ae;
  stroke-width: 0.8;
}
.furniture__tables {
  fill: #ffffff;
  stroke: #9ea7a3;
  stroke-width: 1;
}
.furniture__chairs {
  fill: #c3cac6;
}
.room__furn {
  fill: none;
  stroke: currentColor;
  stroke-width: 1;
  opacity: 0.28;
  pointer-events: none;
}
.room__chairs {
  fill: currentColor;
  opacity: 0.2;
  pointer-events: none;
}
.room--yours {
  color: #fff;
}
.shape--unplaced {
  stroke-dasharray: 6 4;
}
.unplaced text {
  fill: var(--muted);
  font-weight: 600;
}
.room {
  cursor: pointer;
  outline: none;
  color: var(--ink);
}
.room .shape {
  transition: fill 0.35s ease, stroke 0.35s ease;
  stroke-width: 1;
  fill: var(--surface);
  stroke: var(--line);
}
.room .label,
.room .sub {
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--halo, var(--surface));
  stroke-width: 4px;
  stroke-linejoin: round;
  transition: fill 0.35s ease, stroke 0.35s ease;
}
.room .label {
  font-family: var(--font-map);
  font-weight: 700;
  fill: var(--ink);
}
.room .sub {
  font-weight: 600;
  fill: var(--muted);
}
.room--free {
  --halo: var(--green-tint);
}
.room--fits {
  --halo: var(--green-fill);
}
.room--yours {
  --halo: var(--blue);
}
.room--partial {
  --halo: var(--orange-tint);
}
.room--taken {
  --halo: var(--red-tint);
}
.room--unsuitable {
  --halo: var(--plate);
}
/* Available rooms are green: free a lighter green, a search's fitting rooms a stronger one with a thicker edge. */
.room--free .shape {
  fill: var(--green-tint);
  stroke: var(--green);
  stroke-width: 1.5;
}
.room--fits .shape {
  fill: var(--green-fill);
  stroke: var(--green);
  stroke-width: 2.5;
}
.room--yours .shape {
  fill: var(--blue);
  stroke: var(--blue);
  stroke-width: 2;
}
.room--yours .label,
.room--yours .sub {
  fill: #fff;
}
.room--partial .shape {
  fill: var(--orange-tint);
  stroke: var(--orange);
  stroke-width: 2;
}
.room--taken .shape {
  fill: url(#hatch);
  stroke: var(--red);
  stroke-width: 1.5;
}
.room--unsuitable .shape {
  fill: var(--plate);
  stroke: var(--line);
  stroke-dasharray: 4 3;
}
.room--unsuitable .label,
.room--unsuitable .sub {
  fill: #6b777d;
}
.room:hover .shape {
  stroke: var(--ink);
}
.room:focus-visible .focus-ring,
.room--selected .focus-ring {
  stroke: var(--ink);
  stroke-width: 3;
  fill: none;
}
.focus-ring {
  fill: none;
  stroke: none;
}
.badge {
  animation: pop 0.2s ease-out 0.35s both;
  transform-box: fill-box;
  transform-origin: center;
}
@keyframes pop {
  from {
    transform: scale(0.8);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}
.badge circle {
  fill: var(--green);
}
.badge text {
  fill: #fff;
  font-family: var(--font-map);
  font-weight: 700;
  font-size: 15px;
}
.you-marker circle {
  fill: var(--ink);
}
.you-marker .halo {
  fill: rgb(24 24 26 / 15%);
}
.you-marker text {
  font-size: 14px;
  font-weight: 700;
  fill: var(--ink);
  paint-order: stroke;
  stroke: var(--plate);
  stroke-width: 4px;
  stroke-linejoin: round;
}

.legend {
  display: grid;
  gap: 4px;
  font-size: 13px;
  color: var(--ink);
  padding: 8px 6px 2px;
  border-top: 1px solid var(--plate);
  margin-top: 4px;
}
.legend__row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
}
.legend__item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.legend svg {
  display: block;
  flex: none;
}
/* Room states are buttons: hover or focus previews them on the map, a click keeps them highlighted. */
.legend__state {
  min-height: 28px;
  padding: 0 10px 0 6px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.legend__state:hover,
.legend__state:focus-visible {
  background: var(--page);
  border-color: var(--plate);
  outline: none;
}
.legend__state.is-on {
  background: var(--brand-tint);
  border-color: var(--brand);
}
.legend__count {
  min-width: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--plate);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}
.legend__count.is-zero {
  color: var(--muted);
  background: none;
}
.legend__item--plan {
  min-height: 28px;
  padding-right: 10px;
  font-size: 12px;
  color: var(--muted);
}
.legend__plan {
  padding-top: 2px;
}
.legend__spacer {
  flex: 1;
}
.legend .btn--link {
  min-height: 28px;
}

/* Legend highlight: rooms (2D) and labels (3D) in other states fade back. */
.floormap .room,
.b3d-label {
  transition: opacity 0.2s ease;
}
.floormap[data-highlight='fits'] .room:not(.room--fits),
.floormap[data-highlight='yours'] .room:not(.room--yours),
.floormap[data-highlight='partial'] .room:not(.room--partial),
.floormap[data-highlight='taken'] .room:not(.room--taken),
.floormap[data-highlight='free'] .room:not(.room--free),
.floormap[data-highlight='unsuitable'] .room:not(.room--unsuitable),
.b3d-labels[data-highlight='fits'] .b3d-label:not(.b3d-label--fits),
.b3d-labels[data-highlight='yours'] .b3d-label:not(.b3d-label--yours),
.b3d-labels[data-highlight='partial'] .b3d-label:not(.b3d-label--partial),
.b3d-labels[data-highlight='taken'] .b3d-label:not(.b3d-label--taken),
.b3d-labels[data-highlight='free'] .b3d-label:not(.b3d-label--free),
.b3d-labels[data-highlight='unsuitable'] .b3d-label:not(.b3d-label--unsuitable) {
  opacity: 0.18;
}

/* ---------- 2D / 3D ---------- */
.view-toggle {
  display: inline-flex;
  padding: 3px;
  background: var(--plate);
  border-radius: 12px;
}
.view-toggle__btn {
  min-height: 30px;
  min-width: 40px;
  padding: 0 12px;
  border: none;
  border-radius: 9px;
  background: transparent;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
}
.view-toggle__btn[aria-pressed='true'] {
  background: var(--surface);
  color: var(--ink);
  box-shadow: 0 1px 3px rgb(24 24 26 / 15%);
}
.building3d {
  position: relative;
  width: 100%;
  aspect-ratio: 940 / 550;
  max-height: calc(100dvh - 428px);
  min-height: 240px;
  margin: 0 auto;
  border-radius: 10px;
  overflow: hidden;
  animation: fade-in 0.3s ease-out;
}
.building3d canvas {
  touch-action: none;
  cursor: grab; /* drag turns the building; rooms switch to a pointer on hover */
  outline: none;
}
.building3d canvas:active {
  cursor: grabbing;
}
.building3d canvas:focus-visible {
  box-shadow: inset 0 0 0 3px var(--brand-text);
}
.building3d .map-zoom {
  z-index: 4; /* above the room labels */
}
.map-zoom .b3d-spin {
  font-family: var(--font-display);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.map-zoom .b3d-spin.is-on {
  background: var(--ink);
  border-color: var(--ink);
  color: #fff;
}
.b3d-compass {
  display: grid;
  place-items: center;
}
.building3d--loading {
  display: grid;
  place-items: center;
  color: var(--muted);
  background: linear-gradient(180deg, #fff, var(--page));
  perspective: 900px;
}
.building3d__hint {
  position: absolute;
  left: 12px;
  bottom: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  background: rgb(255 255 255 / 85%);
  padding: 4px 10px;
  border-radius: 999px;
  pointer-events: none;
}
.b3d-labels {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.b3d-label {
  position: absolute;
  left: 0;
  top: 0;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 3px 9px 3px 6px;
  border-radius: 12px;
  border: 1px solid rgb(24 24 26 / 14%);
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 2px 8px rgb(24 24 26 / 18%);
  color: var(--ink);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  cursor: pointer;
  pointer-events: auto;
  will-change: transform;
}
.b3d-label:hover,
.b3d-label.is-hovered,
.b3d-label:focus-visible {
  z-index: 2;
  border-color: var(--ink);
  box-shadow: 0 3px 12px rgb(24 24 26 / 30%);
}
.b3d-label.is-selected {
  z-index: 3;
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
.b3d-label__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #fff;
  border: 1.5px solid #8a938f;
}
.b3d-label--fits .b3d-label__dot,
.b3d-label--free .b3d-label__dot {
  background: var(--green);
  border-color: var(--green);
}
.b3d-label--fits {
  border-color: var(--green);
}
.b3d-label--partial .b3d-label__dot {
  background: var(--orange);
  border-color: var(--orange);
}
.b3d-label--taken .b3d-label__dot {
  background: var(--red);
  border-color: var(--red);
}
.b3d-label--taken {
  color: var(--muted);
}
.b3d-label--yours {
  background: var(--blue);
  border-color: var(--blue);
  color: #fff;
}
.b3d-label--yours .b3d-label__dot {
  background: #fff;
  border-color: #fff;
}
.b3d-label--yours .b3d-label__seats {
  color: rgb(255 255 255 / 80%);
}
.b3d-label__rank {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--green);
  color: #fff;
  display: grid;
  place-items: center;
  font-family: var(--font-map);
  font-size: 12px;
}
.b3d-label__seats {
  font-weight: 600;
  color: var(--muted);
}
.b3d-label__seats::before {
  content: '·';
  margin-right: 4px;
}
.building3d__fallback {
  display: grid;
  place-items: center;
  height: 100%;
  margin: 0;
  padding: 24px;
  text-align: center;
  color: var(--muted);
}
.flip-in {
  perspective: 900px;
}
.flip-in > .card {
  animation: flip-in 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  transform-origin: center left;
  backface-visibility: hidden;
}
@keyframes flip-in {
  from {
    opacity: 0;
    transform: rotateY(-75deg) translateZ(0);
  }
  to {
    opacity: 1;
    transform: rotateY(0deg);
  }
}

/* ---------- Owner names (who has the room at the selected time) ---------- */
.room .sub--owner {
  fill: var(--ink);
  font-weight: 700;
}
.room--yours .sub--owner {
  fill: #fff;
}
.b3d-label__row {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.b3d-label__owner {
  padding-left: 14px;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
}
.b3d-label--yours .b3d-label__owner {
  color: rgb(255 255 255 / 85%);
}
.timeline__who {
  margin: 0 3px;
  padding: 0 4px;
  border-radius: 4px;
  background: rgb(255 255 255 / 88%);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ink);
}
.timeline__busy--mine .timeline__who {
  background: transparent;
  color: #fff;
}

/* ---------- Timeline ---------- */
.timeline {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius-card);
  padding: 8px 14px 6px;
}
.timeline__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 0 12px;
  font-size: 14px;
  color: var(--muted);
  margin-bottom: 4px;
}
.timeline__shifts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 4px;
}
.timeline__shifts span {
  padding-left: 6px;
  border-left: 1px solid var(--line);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.timeline__head strong {
  color: var(--ink);
}
.timeline__track {
  position: relative;
  height: 30px;
  border-radius: 8px;
  overflow: hidden;
  background: var(--page);
}
.timeline__shift {
  position: absolute;
  top: 0;
  bottom: 0;
  border-left: 1px solid var(--line);
}
.timeline__shift:nth-child(2) {
  background: rgb(24 24 26 / 3%);
}
.timeline__busy {
  position: absolute;
  display: flex;
  align-items: center;
  overflow: hidden;
  top: 5px;
  bottom: 5px;
  border-radius: 5px;
  background: repeating-linear-gradient(135deg, #c9d0cc 0 4px, #dfe4e1 4px 8px);
  border: 1px solid #b4bcb8;
}
.timeline__busy--mine {
  background: var(--blue);
  border-color: var(--blue);
}
.timeline__slot {
  position: absolute;
  top: 1px;
  bottom: 1px;
  border: 2px solid var(--brand-text);
  border-radius: 7px;
  background: rgb(31 95 214 / 12%);
}
.timeline__now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--danger);
}
.timeline__labels {
  position: relative;
  height: 18px;
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.timeline__labels span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}
.timeline__labels span:first-child {
  transform: none;
}
.timeline__labels span:last-child {
  transform: translateX(-100%);
}
```

## `src/ui/styles/sheets.css`

<!-- verbatim: src/ui/styles/sheets.css -->
```css
/* Sheets: side sheets (room sheet, My bookings, booking details) and the centred New booking modal. */

/* ---------- New booking ---------- */
.topbar__new svg {
  flex: none;
}
.nb-time {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 8px;
}
.nb-time .field label {
  display: block;
  font-size: 12px;
}
.nb-time .field select {
  width: 100%;
  min-height: 28px;
  padding: 0;
  border: none;
  box-shadow: none;
  background: transparent;
  font-weight: 600;
}
.nb-results {
  margin-top: 8px;
}
.nb-room {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--plate);
}
.nb-room .rank {
  width: 26px;
  height: 26px;
  font-size: 13px;
}

/* ---------- Sheets and drawers ---------- */
.scrim {
  position: fixed;
  inset: 0;
  background: rgb(24 24 26 / 30%);
  z-index: 40;
}
.sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 100vw);
  background: var(--surface);
  z-index: 50;
  box-shadow: -8px 0 32px rgb(24 24 26 / 18%);
  display: flex;
  flex-direction: column;
}
/* Centred wide modal (New booking): the same sheet in the middle of the screen, the form in two columns. */
.sheet--modal {
  top: 50%;
  left: 50%;
  right: auto;
  bottom: auto;
  translate: -50% -50%;
  width: min(1040px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  border-radius: 16px;
  box-shadow: 0 24px 64px rgb(24 24 26 / 28%);
}
.sheet--modal .sheet__head {
  padding: 20px 28px 14px;
}
.sheet--modal .sheet__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 18px 28px 26px;
}
.bf-layout,
.bf-group {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
  align-content: start;
}
.sheet--modal .bf-layout {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 32px;
}
@media (max-width: 899px) {
  .sheet--modal .bf-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
.sheet--modal .nb-results {
  border-top: 1px solid var(--plate);
  margin-top: 16px;
  padding-top: 4px;
}
.sheet__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--plate);
}
.sheet__head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 1.1;
  font-weight: 700;
}
.sheet__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px 20px;
}
.sheet__close {
  margin-left: auto;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid var(--line);
  background: var(--surface);
  cursor: pointer;
  flex: none;
  display: grid;
  place-items: center;
}
.section-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 20px 0 8px;
}
.day-list {
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 14px;
}
.day-list li {
  display: flex;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid var(--plate);
}
.day-list li:first-child {
  border-top: none;
}
.day-list .when {
  flex: none;
  width: 130px;
  font-weight: 600;
}
.form-grid {
  display: grid;
  /* One column that never grows past the sheet: long option text must not widen the form. */
  grid-template-columns: minmax(0, 1fr);
  gap: 10px;
}
.form-grid :where(input:not([type='radio'], [type='checkbox']), select, textarea) {
  width: 100%;
  min-width: 0;
}
.form-grid label {
  display: grid;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
}
.form-grid input,
.form-grid select {
  min-height: 36px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0 12px;
  background: var(--surface);
  font-weight: 400;
}
.form-grid input:focus,
.form-grid select:focus {
  border-color: var(--brand-text);
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-tint);
}
.form-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.state-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  margin-top: 10px;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

/* ---------- Reservation form fields (BookingFields) ---------- */
.bf-help {
  display: block;
  font-size: 12px;
  font-weight: 400;
  color: var(--muted);
  margin: 0;
}
.bf-help a {
  color: var(--brand-text);
}
.bf-optional {
  font-weight: 400;
  color: var(--muted);
}
.bf-radios {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 18px;
  margin: 0;
  padding: 0;
  border: none;
}
.bf-radios legend {
  width: 100%;
  padding: 0;
  margin-bottom: 4px;
  font-size: 14px;
  font-weight: 600;
}
.form-grid .bf-radios label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
  min-height: 28px;
  cursor: pointer;
}
.bf-radios input[type='radio'] {
  width: 18px;
  height: 18px;
  min-height: 0;
  margin: 0;
}
.bf-radios input[type='checkbox'],
.bf-check input {
  width: 18px;
  height: 18px;
  min-height: 0;
  margin: 0;
}
.bf-radios label:has(input:disabled) {
  color: var(--muted);
  cursor: not-allowed;
}

/* Starts at / Ends at: a date and a 30-minute time side by side. */
.bf-time {
  display: grid;
  gap: 10px;
}
.field--datetime {
  display: grid;
  gap: 4px;
  font-size: 14px;
  font-weight: 600;
}
/* In a form the date-time pair is a plain labelled field, not the map search bar's grey chip. */
.form-grid .field--datetime {
  grid-template-columns: minmax(0, 1fr);
  justify-content: stretch;
  min-height: 0;
  padding: 0;
  border: none;
  background: none;
}
.form-grid .field--datetime label {
  color: var(--ink);
  font-size: 14px;
}
.field__pair {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr);
  gap: 8px;
}
.field__pair input,
.field__pair select {
  width: 100%;
}

/* Recurrence (Guidelines 3.6) */
.bf-recurrence {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--plate);
  border-radius: 10px;
}
.form-grid .bf-check,
.form-grid .bf-inline,
.form-grid .bf-monthly label {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.form-grid .bf-inline input,
.form-grid .bf-monthly input[type='number'] {
  width: 72px;
}
.form-grid .bf-monthly select {
  width: auto;
  min-width: 0;
}

/* Booking details: the tool's form, read-only. */
.details {
  margin: 0;
  display: grid;
}
.details__row {
  display: grid;
  grid-template-columns: 11em minmax(0, 1fr);
  gap: 12px;
  padding: 8px 0;
  border-top: 1px solid var(--plate);
  font-size: 14px;
}
.details__row:first-child {
  border-top: none;
}
.details dt {
  color: var(--muted);
}
.details dd {
  margin: 0;
  font-weight: 600;
  overflow-wrap: anywhere;
}

/* Name of Requestor: the signed-in person, read-only */
.requestor-line {
  display: grid;
  gap: 2px;
  font-size: 14px;
}
.requestor-line__label {
  font-weight: 600;
}
.requestor-line strong {
  font-weight: 500;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--page);
  border: 1px solid var(--plate);
}

/* Form errors: each wrong field gets a red border (also while focused), the message a red-bordered alert. */
.form-grid [aria-invalid='true'],
.form-grid [aria-invalid='true']:focus {
  border-color: var(--danger);
  box-shadow: 0 0 0 1px var(--danger), 0 0 0 5px rgb(180 35 24 / 16%);
}
.bf-radios.is-invalid,
.bf-recurrence.is-invalid {
  padding: 6px 10px;
  border: 2px solid var(--danger);
  border-radius: 10px;
  box-shadow: 0 0 0 4px rgb(180 35 24 / 16%);
}
.form-error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--danger);
  border-left-width: 4px;
  border-radius: 10px;
  background: #fef3f2;
  color: var(--danger);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}
.form-error svg {
  flex: none;
  margin-top: 1px;
}

/* Connect an AI app (MCP) and the consent screen */
.copy-row {
  display: flex;
  gap: 8px;
  font-weight: 400;
}
.connect-list,
.consent__list {
  margin: 6px 0 12px;
  padding-left: 20px;
  font-size: 14px;
}
.connect-list li,
.consent__list li {
  margin: 6px 0;
}
.connect-list code {
  font-size: 12px;
  overflow-wrap: anywhere;
  background: var(--page);
  padding: 1px 5px;
  border-radius: 6px;
}
.consent h1 {
  overflow-wrap: anywhere;
}

/* ---------- Messages with Admin (S14; also the Admin pages) ---------- */
.count-badge {
  display: inline-grid;
  place-items: center;
  min-width: 20px;
  height: 20px;
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}
.count-badge--muted {
  background: var(--plate);
  color: var(--ink);
}
.thread-list {
  display: grid;
  gap: 8px;
}
.thread-row {
  display: grid;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--plate);
  border-radius: var(--radius-card);
  background: var(--surface);
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}
.thread-row:hover {
  border-color: var(--line);
}
.thread-row--unread {
  border-color: var(--brand);
}
.thread-row--active {
  background: var(--brand-tint);
}
.thread-row__title {
  display: flex;
  align-items: center;
  font-weight: 700;
}
.thread-row__last {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--muted);
}
.thread {
  display: grid;
  gap: 12px;
}
.thread__about {
  display: grid;
  gap: 2px;
}
.thread__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
  max-height: 50dvh;
  overflow: auto;
}
.thread-msg {
  max-width: 85%;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--plate);
}
.thread-msg--mine {
  justify-self: end;
  background: var(--blue-tint);
}
.thread-msg--system {
  max-width: 100%;
  background: var(--page);
  border: 1px dashed var(--line);
}
.thread-msg__head {
  font-size: 11px;
  color: var(--muted);
}
.thread-msg__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.thread__compose textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-btn);
  font: inherit;
  resize: vertical;
}
.topbar__messages {
  display: inline-flex;
  align-items: center;
}
```

## `src/ui/styles/table.css`

<!-- verbatim: src/ui/styles/table.css -->
```css
/* Table view: rooms and bookings. */

/* ---------- Table view ---------- */
.map-card--table {
  padding: 0;
}
.datatable {
  display: flex;
  flex-direction: column;
}
.dt-tabs {
  display: flex;
  gap: 4px;
  padding: 8px 10px 0;
  border-bottom: 1px solid var(--plate);
}
.dt-tab {
  min-height: 42px;
  padding: 0 14px;
  border: none;
  border-bottom: 3px solid transparent;
  background: none;
  font-weight: 700;
  font-size: 14px;
  color: var(--muted);
  cursor: pointer;
}
.dt-tab[aria-selected='true'] {
  color: var(--ink);
  border-bottom-color: var(--brand);
}
.dt-tab__count {
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--plate);
  font-size: 12px;
}
.dt-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 6px;
}
.dt-toolbar select,
.dt-field input,
.dt-number input {
  min-height: 32px;
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 0 10px;
  background: var(--surface);
  font-size: 13px;
}
.dt-search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
  flex: 1 1 220px;
}
.dt-search:focus-within,
.dt-toolbar select:focus,
.dt-number input:focus {
  border-color: var(--brand-text);
  outline: none;
  box-shadow: 0 0 0 3px var(--brand-tint);
}
.dt-search input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--ink);
}
.dt-number {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.dt-number input {
  width: 70px;
}
.dt-field {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--muted);
}
.dt-search--small {
  width: 170px;
}
.dt-check {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
}
.dt-check input {
  width: 16px;
  height: 16px;
}
.dt-toolbar__spacer {
  flex: 1;
}
.dt-scroll {
  overflow: auto;
  max-height: calc(100dvh - 470px);
  min-height: 240px;
  border-top: 1px solid var(--plate);
}
.dt {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}
.dt th,
.dt td {
  padding: 7px 10px;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid var(--plate);
  white-space: nowrap;
}
.dt thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--page);
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding-top: 6px;
  padding-bottom: 6px;
}
.dt tbody th {
  font-weight: 600;
}
.dt tbody tr {
  cursor: pointer;
}
.dt tbody tr:nth-child(even) > * {
  background: #fafbf9;
}
.dt tbody tr:hover > * {
  background: var(--brand-tint);
}
.dt tbody tr.is-selected > * {
  background: #e8effd;
  box-shadow: inset 0 0 0 0 var(--brand);
}
.dt tbody tr.is-selected > .dt-sticky {
  box-shadow: inset 3px 0 0 var(--brand);
}
.dt tbody tr.is-mine > .dt-sticky {
  box-shadow: inset 3px 0 0 var(--blue);
}
.dt-sticky {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--surface);
}
.dt thead .dt-sticky {
  z-index: 3;
  background: var(--page);
}
.dt-num {
  text-align: right !important;
  font-variant-numeric: tabular-nums;
}
.dt-sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  border: none;
  background: none;
  font: inherit;
  color: inherit;
  text-transform: inherit;
  letter-spacing: inherit;
  cursor: pointer;
}
.dt-sort__icon {
  font-size: 10px;
  opacity: 0.7;
}
.dt-room {
  font-weight: 700;
}
.dt-time {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.dt-now {
  display: block;
  font-size: 11px;
  font-weight: 600;
  color: var(--brand-text);
}
.dt-muted {
  color: var(--muted);
}
.dt-mono {
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}
.dt-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dt-actions .btn--small {
  min-height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.dt-actions-h {
  text-align: right;
}
.dt-chip,
.dt-status {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  background: var(--plate);
  color: var(--ink);
}
.dt-chip--fits,
.dt-chip--free {
  background: var(--green-fill);
  color: #0f5a2b;
}
.dt-chip--free {
  background: var(--green-tint);
}
.dt-chip--yours {
  background: var(--blue);
  color: #fff;
}
.dt-chip--partial {
  background: var(--orange-tint);
  color: #7a3305;
}
.dt-chip--taken {
  background: var(--red-tint);
  color: #8a1f17;
}
.dt-chip--unsuitable {
  background: transparent;
  border: 1px dashed var(--line);
  color: var(--muted);
}
.dt-status--in-progress {
  background: var(--orange-tint);
  color: #7a3305;
}
.dt-status--checked-in {
  background: var(--blue-tint);
  color: #173f8c;
}
.dt-empty {
  padding: 24px;
  text-align: center;
  color: var(--muted);
}

.dt-you {
  margin-left: 4px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--blue);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
}

/* Click or press Enter on a row for its details. */
.dt tbody tr.dt-row:focus-visible {
  outline: 3px solid var(--brand-text);
  outline-offset: -3px;
}

/* Pagination */
.dt-pager {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px 10px;
  font-size: 13px;
  color: var(--muted);
}
.dt-pager__range {
  margin-right: auto;
}
.dt-pager__size {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.dt-pager__size select {
  min-height: 28px;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0 6px;
  background: var(--surface);
}
.dt-pager__page {
  min-width: 90px;
  text-align: center;
  color: var(--ink);
  font-weight: 600;
}
```

## `src/ui/styles/admin.css`

<!-- verbatim: src/ui/styles/admin.css -->
```css
/* The Admin area (/admin): frame, navigation, pages, stat tiles, charts, the assistant and printing. */

/* ---------- Frame: top bar, side navigation, page, assistant ---------- */
.admin {
  position: relative;
  display: grid;
  grid-template-rows: 52px minmax(0, 1fr);
  grid-template-columns: 184px minmax(0, 1fr) var(--assistant-w);
  grid-template-areas:
    'top top top'
    'nav main side';
  height: 100dvh;
  background: var(--page);
  transition: grid-template-columns 0.3s ease;
}
/* Hidden like the room assistant's drawer, mirrored: the right column slides shut and the panel clips while it moves. */
.admin--no-assistant {
  grid-template-columns: 184px minmax(0, 1fr) 0;
}
.admin-topbar {
  grid-area: top;
}
.admin-nav {
  grid-area: nav;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 10px;
  background: var(--surface);
  border-right: 1px solid var(--line);
  overflow: auto;
}
.admin-nav__link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-btn);
  color: var(--ink);
  font-weight: 600;
  text-decoration: none;
}
.admin-nav__link:hover {
  background: var(--plate);
}
.admin-nav__link.is-active {
  background: var(--ink);
  color: #fff;
  box-shadow: inset 4px 0 0 var(--brand);
}
.admin-main {
  grid-area: main;
  overflow: auto;
  padding: 20px 24px 40px;
}
/* Positioned, so absolutely placed bits inside (screen-reader labels) are clipped with the panel too. */
.admin-assistant-slot {
  position: relative;
  grid-area: side;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--line);
  background: var(--surface);
}
@media (min-width: 1200px) {
  .admin-assistant > * {
    width: var(--assistant-w);
  }
  .admin--no-assistant .admin-assistant-slot {
    visibility: hidden;
    border-left-width: 0;
    transition: visibility 0s linear 0.3s;
  }
  .admin--no-assistant .admin-main {
    padding-right: 56px;
  }
}
/* The Assistant tab: the main page's reopen tab, on the right edge under the top bar. */
.chat-reopen--right {
  position: fixed;
  left: auto;
  right: 0;
  top: 68px;
  border-radius: 12px 0 0 12px;
}

/* ---------- Pages ---------- */
.admin-page {
  display: grid;
  gap: 16px;
  max-width: 1400px;
}
.admin-page__head h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
}
.admin-page__head--row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.admin-scroll {
  max-height: calc(100dvh - 300px);
}
.dt-row--link:focus-visible > * {
  outline: 2px solid var(--brand-text);
  outline-offset: -2px;
}
.dt tbody tr.is-picked > * {
  background: var(--brand-tint);
}
.dt-check-col {
  width: 34px;
}
.dt-check-col input {
  width: 18px;
  height: 18px;
}
.dt--compact th,
.dt--compact td {
  padding: 4px 8px;
  font-size: 12px;
}
.dt-status--approved {
  background: var(--green-tint);
  color: #0f5a2b;
}
.dt-status--cancelled {
  background: var(--red-tint);
  color: #8a1f17;
}
.dt-status--completed,
.dt-status--held {
  background: var(--plate);
  color: var(--muted);
}
.dt-status--blocked {
  background: var(--ink);
  color: var(--surface);
}
.admin-warn {
  color: var(--orange);
  font-weight: 700;
}
.admin-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}
.admin-card {
  padding: 16px 18px;
}
.admin-card__title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
  font-size: 16px;
}
.admin-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.admin-list__row {
  display: grid;
  gap: 6px;
  padding: 10px 0;
  border-bottom: 1px solid var(--plate);
}
.admin-list--compact .admin-list__row {
  padding: 4px 0;
}
.admin-list__main {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.admin-list__main strong {
  flex-basis: 100%;
}
.admin-list__reject {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.admin-list__reject input {
  flex: 1;
  min-width: 180px;
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-btn);
  font: inherit;
}
.admin-activity {
  font-size: 13px;
  padding: 4px 0;
  border-bottom: 1px solid var(--plate);
}

/* ---------- The Admin booking sheet ---------- */
.admin-sheet {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
  gap: 24px;
}
.admin-actions {
  margin-bottom: 12px;
}
.admin-inline {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--plate);
  border-radius: var(--radius-card);
  background: var(--page);
}
.admin-change {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.admin-change > .card__note,
.admin-change > .btn-row,
.admin-change > label:first-child {
  grid-column: 1 / -1;
}
.admin-swap-preview {
  margin: 0;
  padding-left: 18px;
}
.otp {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

/* ---------- Block rooms and Bulk booking (AdminBlockBulk) ---------- */
.admin-bulk {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 16px 24px;
  align-items: start;
}
.admin-bulk > .affected,
.admin-bulk > .banner,
.admin-bulk > .btn-row {
  grid-column: 1 / -1;
}
.room-picker {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 8px 12px 12px;
  border: 1px solid var(--plate);
  border-radius: var(--radius-card);
  max-height: min(60dvh, 560px);
  overflow: auto;
}
.room-picker legend {
  padding: 0 4px;
  font-size: 14px;
  font-weight: 700;
}
.room-picker__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--plate);
}
.room-picker__room {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 14px;
  cursor: pointer;
}
.room-picker__room input {
  width: 18px;
  height: 18px;
  margin: 0;
}
.room-picker__room.is-off {
  color: var(--muted);
  cursor: default;
}
.room-picker__room .dt-muted {
  font-size: 12px;
  text-align: right;
}
/* The bookings a block or bulk booking would cancel (also on the Admin assistant's cards). */
.affected {
  margin: 8px 0;
  padding: 10px 12px;
  border-radius: var(--radius-card);
  background: var(--red-tint);
  color: #8a1f17;
  font-size: 13px;
}
.affected--none {
  background: var(--green-tint);
  color: #0f5a2b;
}
.affected p {
  margin: 0;
}
.affected ul {
  margin: 6px 0 0;
  padding-left: 18px;
  max-height: 220px;
  overflow: auto;
}

/* ---------- Messages (Admin inbox) ---------- */
.admin-inbox {
  display: grid;
  grid-template-columns: minmax(240px, 360px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.admin-inbox__thread {
  padding: 16px;
  min-height: 320px;
}

/* ---------- Stat tiles ---------- */
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.stat {
  padding: 10px 14px;
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: var(--shadow);
  border-top: 4px solid var(--plate-dark);
}
.stat--warn {
  border-top-color: var(--orange);
}
.stat--good {
  border-top-color: var(--green);
}
.stat--bad {
  border-top-color: var(--red);
}
.stat__value {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.1;
}
.stat__label {
  font-weight: 600;
}
.stat__hint {
  font-size: 12px;
  color: var(--muted);
}

/* ---------- Charts ---------- */
.chart-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}
.chart {
  margin: 0;
  padding: 16px 18px;
  border-radius: var(--radius-card);
  background: var(--surface);
  box-shadow: var(--shadow);
  display: grid;
  gap: 10px;
  align-content: start;
}
.chart__title {
  font-weight: 700;
  font-size: 15px;
}
.chart__note {
  margin-left: 8px;
  font-weight: 400;
  font-size: 12px;
  color: var(--muted);
}
.chart__empty {
  color: var(--muted);
  margin: 0;
}
.chart__data summary {
  cursor: pointer;
  font-size: 12px;
  color: var(--muted);
}
.chart__data table {
  margin-top: 6px;
}
.bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.bars__row {
  display: grid;
  grid-template-columns: minmax(90px, 36%) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.bars__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bars__track {
  height: 12px;
  border-radius: 6px;
  background: var(--plate);
  overflow: hidden;
}
.bars__bar {
  display: block;
  height: 100%;
  border-radius: 6px;
  background: var(--brand);
}
.bars__value {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}
.bars__detail {
  font-weight: 400;
  color: var(--muted);
}
.columns {
  width: 100%;
  height: auto;
}
.columns__axis {
  stroke: var(--line);
}
.columns__bar {
  fill: var(--brand);
}
.columns__value,
.columns__label {
  font-size: 12px;
  text-anchor: middle;
  fill: var(--muted);
}
.columns__value {
  fill: var(--ink);
  font-weight: 600;
}
.donut {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}
.donut svg {
  width: 150px;
  height: 150px;
}
.donut__track {
  fill: none;
  stroke: var(--plate);
  stroke-width: 16;
}
.donut__total {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 700;
  text-anchor: middle;
  fill: var(--ink);
}
.donut__caption {
  font-size: 11px;
  text-anchor: middle;
  fill: var(--muted);
}
.legend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.legend-list__swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  margin-right: 8px;
  border-radius: 3px;
  vertical-align: -1px;
}
.heat {
  display: grid;
  grid-template-columns: 38px repeat(24, minmax(0, 1fr));
  gap: 2px;
  font-size: 11px;
}
.heat__row {
  display: contents;
}
.heat__hour,
.heat__day {
  color: var(--muted);
}
.heat__cell {
  aspect-ratio: 1;
  min-height: 12px;
  border-radius: 3px;
  background: var(--plate);
}
.log-booking {
  background: var(--blue-tint);
  color: #173f8c;
}
.log-user,
.log-room {
  background: var(--orange-tint);
  color: #7a3305;
}

/* ---------- The Admin assistant ---------- */
/* The same parts as the room assistant (shell.css: .assistant__head, __scroll, __composer, .composer). */
.admin-assistant {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.card--admin {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.card__textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-btn);
  font: inherit;
}

/* ---------- Smaller screens ---------- */
@media (max-width: 1199px) {
  .admin,
  .admin--no-assistant {
    grid-template-columns: 170px minmax(0, 1fr);
    grid-template-areas:
      'top top'
      'nav main';
  }
  /* The assistant floats over the page on narrower screens; hidden, only the Assistant tab stays. */
  .admin-assistant-slot {
    position: fixed;
    right: 0;
    top: 52px;
    bottom: 0;
    width: min(420px, 100vw);
    z-index: 30;
    box-shadow: var(--shadow);
  }
  .admin--no-assistant .admin-assistant-slot {
    display: none;
  }
  .admin-sheet,
  .admin-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 767px) {
  .admin,
  .admin--no-assistant {
    grid-template-rows: 52px auto minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      'top'
      'nav'
      'main';
  }
  .admin-nav {
    flex-direction: row;
    overflow-x: auto;
    padding: 8px;
    border-right: 0;
    border-bottom: 1px solid var(--line);
  }
  .admin-nav__link {
    white-space: nowrap;
    min-height: 34px;
  }
  .admin-main {
    padding: 16px 16px 40px;
  }
  .admin-inbox,
  .admin-change,
  .admin-bulk {
    grid-template-columns: minmax(0, 1fr);
  }
  .room-picker {
    max-height: none;
  }
  .chart-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .admin-topbar .btn--link[href='/'] {
    display: none;
  }
}

/* ---------- Print (Reports → Print / PDF) ---------- */
@media print {
  .admin {
    display: block;
    height: auto;
    background: #fff;
  }
  .admin-topbar,
  .no-print {
    display: none !important;
  }
  .admin-main {
    overflow: visible;
    padding: 0;
  }
  .chart,
  .stat {
    box-shadow: none;
    border: 1px solid var(--plate);
    break-inside: avoid;
  }
  .chart__data {
    display: none;
  }
}

/* Today's bookings on the dashboard: time, room and owner, status. */
.admin-list--compact .admin-list__main {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr) auto;
  align-items: center;
  width: 100%;
}
.admin-list--compact .admin-list__main > span:nth-child(2) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Live notices (AdminLive): bottom left, away from the assistant on the right. */
.admin-toasts {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 40;
  display: grid;
  gap: 8px;
  max-width: min(440px, calc(100vw - 32px));
}
.admin-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 10px 10px 14px;
  border-radius: var(--radius-card);
  border-left: 4px solid var(--brand);
  background: var(--ink);
  color: #fff;
  box-shadow: 0 8px 24px rgb(24 24 26 / 25%);
  animation: fade-in 0.2s ease-out both;
}
.admin-toast__text {
  flex: 1;
  font-size: 13px;
}
.admin-toast .btn--link {
  color: var(--brand);
}
.admin-toast__close {
  border: none;
  background: none;
  color: #fff;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
}
```

## `src/ui/styles/responsive.css`

<!-- verbatim: src/ui/styles/responsive.css -->
```css
/* Tablet and phone layouts, reduced motion. Imported last so it wins the cascade. */

/* ---------- Narrower than 1,300 px ---------- */
/* The room app's top bar needs about 1,300 px with the whole RELX logo (an Admin's menu and the clock): below that the
   RELX symbol stands in for it, so the bar is no wider than with the old R tile. The Admin top bar has the room. */
@media (max-width: 1299px) {
  .topbar:not(.admin-topbar) .brand__logo {
    display: none;
  }
  .topbar:not(.admin-topbar) .brand__symbol {
    display: block;
  }
}

/* ---------- Tablet ---------- */
@media (max-width: 1199px) {
  :root {
    --assistant-w: 340px;
  }
  .demo-clock {
    display: none;
  }
  /* The site is shown only (the app always uses Manila): the buttons and the user menu need the room. */
  .site-pill {
    display: none;
  }
}

/* ---------- Small tablet ---------- */
/* The RELX symbol and the avatar are enough, as on a phone, so Sign out stays on screen for an Admin too. */
@media (max-width: 1023px) {
  .topbar:not(.admin-topbar) .brand__text,
  .user-menu__label {
    display: none;
  }
}

/* ---------- Phone: map on top, assistant as a bottom sheet ---------- */
@media (max-width: 767px) {
  .topbar {
    padding: 0 12px;
    gap: 8px;
  }
  /* The RELX symbol is enough on a phone; the buttons need the room. */
  .brand__logo,
  .brand__text {
    display: none;
  }
  .brand__symbol {
    display: block;
  }
  .user-menu {
    padding-left: 6px;
  }
  .schedule-item {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .schedule-item__when {
    grid-column: 1 / -1;
  }
  .main {
    display: block;
    position: relative;
  }
  .mapside {
    height: 100%;
    padding: 12px 12px 42dvh;
  }
  .floormap {
    max-height: none;
    min-height: 0;
  }
  .mapside {
    gap: 8px;
  }
  /* Two compact rows that scroll sideways, so the map stays in the top half. */
  .map-toolbar,
  .slot-controls {
    flex-wrap: nowrap;
  }
  .map-toolbar {
    overflow-x: auto;
    scrollbar-width: none;
    margin: 0 -12px;
    padding: 0 12px;
  }
  .map-toolbar > *,
  .slot-controls > *,
  .searchbar > * {
    flex: none;
  }
  .searchbar {
    flex-wrap: nowrap;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .search-note {
    padding: 6px 10px;
  }
  .map-toolbar__spacer {
    display: none;
  }
  .search-note {
    white-space: nowrap;
  }
  /* The plan fits the width; pinch or the zoom buttons zoom in, and one finger then pans. */
  .map-card {
    padding: 8px;
  }
  .assistant {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 40dvh;
    z-index: 30;
    border-right: none;
    border-top: 1px solid var(--line);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -8px 32px rgb(24 24 26 / 16%);
    transition: height 0.25s ease, transform 0.3s ease;
  }
  .assistant--open {
    height: calc(100dvh - 72px);
  }
  .assistant__scroll {
    padding-top: 4px;
  }
  .assistant--hidden {
    transform: translateY(110%);
  }
  .main--chat-hidden .mapside {
    padding-bottom: 88px;
  }
  .assistant__head {
    position: relative;
    padding-top: 16px;
  }
  .assistant__grip {
    display: block;
    position: absolute;
    top: 6px;
    left: 50%;
    width: 34px;
    height: 4px;
    margin-left: -20px;
    border-radius: 2px;
    background: var(--line);
  }
  .assistant__title {
    pointer-events: auto;
    cursor: pointer;
  }
  .chat-reopen {
    position: fixed;
    top: auto;
    left: 12px;
    right: 12px;
    bottom: 12px;
    flex-direction: row;
    justify-content: center;
    border-radius: 14px;
    padding: 12px 16px;
  }
  .chat-reopen__label {
    writing-mode: horizontal-tb;
    transform: none;
  }
  .sheet {
    top: auto;
    width: 100vw;
    height: 88dvh;
    border-radius: 18px 18px 0 0;
  }
  /* The New booking modal is a bottom sheet on phones too, with one column. */
  .sheet--modal {
    left: 0;
    bottom: 0;
    translate: none;
    max-height: none;
  }
  .sheet--modal .bf-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .form-row {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
