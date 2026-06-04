---
id: battlefuel-v2-wave-11
title: "Wave 11: OF-8 Fuel Ordering, Logistic Sites & Supply Optics"
initiative: battlefuel-v2
initiative_version: 5
status: planned
depends_on: battlefuel-v2-wave-10
demo_state: "In the OF-8 Joint-Force Supply view the operator orders fuel end-to-end: pick a fuel-management platform (World Fuel DFMS default / Shell FM / add new), hit 'Order fuel' (renamed from Buy fuel) to open a branded order mask with fuel type / destination / amount prefilled, tick who to inform (JLSG, JTF HQ), and Place order — posting a confirmation + an entry in a new Order History panel that tracks each order through the NATO stages (placed -> JLSG -> JTF -> provider -> on route -> reached JLSG -> reached OPCON). The initial main-supply-point order dropdown is populated (bug fixed). Supply points are clickable to locate on the map; the operator can add typed logistic sites (BSA / CSSBN / DOB / FLS / TLB). Refuel is started by clicking a unit. On the map in OF-8, each unit shows a colour-coded fuel bar + an ammo bar (selected unit on top), toggleable via an on-map-info-bars selector. An Info Docs tab surfaces the official PDFs."
created: 2026-06-05
hash:
---

# Wave 11: OF-8 Fuel Ordering, Logistic Sites & Supply Optics

> **Immediate wave (requester, 2026-06-05).** Prioritised ahead of the original v2 W4/W5/W7/W8.
> Theme: the OF-8 (Joint-Force Supply) fuel-ordering experience + supply-site management + on-map
> supply optics + an official-docs tab. Builds on W10's add-depot/supply UI.

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
- [ ] **merged into main / deployed in prod** — on `main`, live `:3000` (needs approval first)

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | order-fuel-rename-and-dropdown-bug | — | planned | — |
| 2 | fuel-platform-selector | — | planned | order-fuel-rename-and-dropdown-bug |
| 3 | order-fuel-mask | — | planned | fuel-platform-selector |
| 4 | order-history-panel | — | planned | order-fuel-mask |
| 5 | logistic-sites | — | planned | — |
| 6 | refuel-by-unit-click | — | planned | — |
| 7 | of8-on-map-info-bars | — | planned | — |
| 8 | official-docs-tab | — | planned | — |

Build order: 1 → 2 → 3 → 4 (the order-fuel chain); 5, 6, 7, 8 are independent.

### Feature notes (requirements, requester 2026-06-05)
- **F1 order-fuel-rename-and-dropdown-bug** — **Bug:** in OF-8 the initial Buy-fuel for the Main
  supply point has an **empty dropdown** so the button is greyed out; selecting a *different* point
  enables the dropdown (and then it works for the Main point too). Fix so the dropdown is populated
  for the default/initial depot on load. Also **rename "Buy fuel" → "Order fuel"** (button + all
  copy) in the OF-8 view.
- **F2 fuel-platform-selector** — a **dropdown above** the order form to select the **fuel
  management platform**: seed **World Fuel DFMS** (default) + **Shell FM**, and allow **adding a new
  platform**. The selected platform drives the order mask's branding (F3).
- **F3 order-fuel-mask** — hitting **Order fuel** opens a **(faked) order mask**: the selected
  platform/company **logo on top**, with **fuel type / destination / amount prefilled**, a **Place
  order** button → a confirmation message + the order is appended to history (F4). Include
  **inform checkboxes: JLSG, JTF HQ**.
- **F4 order-history-panel** — a **"Order history" button** on the Joint-Force Supply panel opens a
  panel listing **all historic + current orders + status**, tracking each through stages:
  **order placed → confirmed by JLSG → confirmed by JTF → confirmed by Fuel Provider → Fuel on
  route → Fuel reached JLSG → Fuel reached OPCON**.
- **F5 logistic-sites** — make supply points (Main supply point, …) **clickable to mark/locate on
  the map**. Allow **adding typed logistic sites** (extends W10 add-depot) with NATO JLSG types
  from *AJP-4.6* (Fig 2.1 / ch.3): **BSA** (Brigade Support Area), **CSSBN** (LCC Combat Service
  Support Battalion), **DOB** (Deployable Operating Base, ACC), **FLS** (Forward Logistic Site,
  MCC), **TLB** (Theatre Logistic Base).
- **F6 refuel-by-unit-click** — in OF-8, **click a unit** to start its refuel flow (entry point in
  addition to the existing refuel panel).
- **F7 of8-on-map-info-bars** — in OF-8, draw **info bars next to each unit** (like the depot
  gauges): **one colour-coded fuel bar** + **one ammo bar**. Overlapping bars for nearby units →
  render the **selected unit's bars on top**. Add a **radio/toggle to enable/disable the on-map
  info bars**.
- **F8 official-docs-tab** — an **"Info docs" tab** that lists/opens the PDFs from the
  **`Official logistic documents/`** folder (note: it also contains non-logistics docs — show all,
  ideally grouped).

## Open Research / decisions to confirm at plan-execute
- **Ammo data** — units have no ammo attribute today. F7's ammo bar needs a (seeded/fake) ammo
  level on the unit/instance model + provider; confirm source + whether it's persisted.
- **Shell FM logo asset** — only `World-Fuel-Services-Logo.png` + `eraneos_…` exist in
  `company Logos/`. Need a Shell FM logo (or a text/placeholder badge) for F2/F3 branding.
- **Order status state machine** — the orders are faked; decide whether the 7 stages advance on a
  timer/sim-clock (auto-progress) or are demo-stepped, and whether the order history persists
  (backend table) or is frontend session state. Existing `buy_orders` (W5) likely renames/extends
  to "order fuel".
- **PDF serving** — `Official logistic documents/` is currently untracked; the PDFs must be
  committed + served statically (frontend `public/` or a backend static route). Confirm which PDFs
  ship and the size/licensing.
- **Logistic-site semantics** — are typed sites (BSA/CSSBN/…) just placed markers with the NATO
  symbol + type label (extending depots), or do they carry stock / affect supply/routing? Default
  assumption: typed supply markers extending the W10 depot model.
- **Overlap with original W4/W5** — W5 covers tiles/panels + the request-data redesign; this wave
  takes the OF-8 fuel-order + refuel-click + optics. Keep panels coordinated so W5 doesn't re-do
  the supply panel.
- **"inform JLSG/JTF HQ"** — does ticking these just annotate the order / history, or also emit a
  chatter/strategic message? Default: annotate the order + a chatter line.
