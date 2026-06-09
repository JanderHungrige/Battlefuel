---
id: battlefuel-v2-wave-11
title: "Wave 11: OF-8 Fuel Ordering, Logistic Sites & Supply Optics"
initiative: battlefuel-v2
initiative_version: 5
status: complete
depends_on: battlefuel-v2-wave-10
demo_state: "In the OF-8 Joint-Force Supply view the operator orders fuel end-to-end: pick a fuel-management platform (World Fuel DFMS default / Shell FM / add new), hit 'Order fuel' (renamed from Buy fuel) to open a branded order mask with fuel type / destination / amount prefilled, tick who to inform (JLSG, JTF HQ), and Place order — posting a confirmation + an entry in a new Order History panel that tracks each order through the NATO stages (placed -> JLSG -> JTF -> provider -> on route -> reached JLSG -> reached OPCON). The initial main-supply-point order dropdown is populated (bug fixed). Supply points are clickable to locate on the map; the operator can add typed logistic sites (BSA / CSSBN / DOB / FLS / TLB) that carry fuel stock and can be refueled — and when a site runs low it proposes a refuel/redistribution order. Refuel is started by clicking a unit. On the map in OF-8, each unit shows a colour-coded fuel bar (selected unit on top), toggleable via an on-map-info-bars selector. An Info Docs tab surfaces the official PDFs from the folder. Order status auto-advances on the sim clock (30 s per stage)."
created: 2026-06-05
hash: 414a7dc6
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
- [x] **tested local** — `make dev`, demoed on localhost (requester confirmed 2026-06-05)
- [x] **tested online** — on `dev-deployment`, deployed to `:3001`, verified
- [x] **merged into main / deployed in prod** — in `main` (prod merge `7195a07`), live `:3000`

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | order-fuel-rename-and-dropdown-bug | docs/66-order-fuel-rename-and-dropdown-bug.md | complete | — |
| 2 | fuel-platform-selector | docs/67-fuel-platform-selector.md | complete | order-fuel-rename-and-dropdown-bug |
| 3 | order-fuel-mask | docs/68-order-fuel-mask.md | complete | fuel-platform-selector |
| 4 | order-history-panel | docs/69-order-history-panel.md | complete | order-fuel-mask |
| 5 | logistic-sites | docs/70-logistic-sites.md | complete | — |
| 6 | refuel-by-unit-click | docs/71-refuel-by-unit-click.md | complete | — |
| 7 | of8-on-map-info-bars | docs/72-of8-on-map-info-bars.md | complete | — |
| 8 | official-docs-tab | docs/73-official-docs-tab.md | complete | — |

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
  route → Fuel reached JLSG → Fuel reached OPCON**. Status **auto-advances on the sim clock at
  30 game-seconds per stage** (deterministic, clock-driven; the order history persists).
- **F5 logistic-sites** — make supply points (Main supply point, …) **clickable to mark/locate on
  the map**. Allow **adding typed logistic sites** (extends W10 add-depot) with NATO JLSG types
  from *AJP-4.6* (Fig 2.1 / ch.3): **BSA** (Brigade Support Area), **CSSBN** (LCC Combat Service
  Support Battalion), **DOB** (Deployable Operating Base, ACC), **FLS** (Forward Logistic Site,
  MCC), **TLB** (Theatre Logistic Base). **Sites carry fuel stock** (depot-like `FuelStock`) and
  **can be refueled** (receive a buy/transfer); **when a site runs low it proposes a
  refuel/redistribution order** — reuse the Wave-6 redistribution optimizer/advisor to generate the
  proposal. (This grows the W10 add-depot from a bare marker into a stocked, typed, advisable site.)
- **F6 refuel-by-unit-click** — in OF-8, **click a unit** to start its refuel flow (entry point in
  addition to the existing refuel panel).
- **F7 of8-on-map-info-bars** — in OF-8, draw a **single colour-coded fuel bar next to each unit**
  (like the depot gauges). **Ammo is dropped** (requester 2026-06-05) — fuel only. Overlapping bars
  for nearby units → render the **selected unit's bar on top**. Add a **radio/toggle to
  enable/disable the on-map info bars**.
- **F8 official-docs-tab** — an **"Info docs" tab** that lists/opens **the PDFs from the
  `Official logistic documents/` folder** (confirmed: include them all; the folder also has
  non-logistics docs — show all, grouped). The PDFs are committed + served statically.

## Resolved decisions (requester, 2026-06-05)
- **Ammo — DROPPED.** F7 is the fuel bar only; no ammo bar / no ammo model.
- **Shell FM logo — will be provided** by the requester (drop into `company Logos/`); World Fuel +
  Eraneos already present.
- **Order status — sim-clock timer, 30 game-seconds per stage** (auto-advance through the 7
  stages); order history **persists** (extend the existing `buy_orders` model/flow → "order fuel").
- **PDFs — include them all** from `Official logistic documents/` (logistics + non-logistics);
  commit them and serve statically (frontend `public/` or a backend static route).
- **Logistic sites — carry stock + refuelable.** Typed sites are **stocked depots** (reuse
  `FuelStock`); they can receive fuel (buy/transfer), and **a low-fuel site proposes a
  refuel/redistribution order** via the Wave-6 redistribution advisor.

## Open Research (residual — confirm at plan-execute)
- **Low-fuel threshold** for the redistribution proposal (e.g. % of capacity) and whether the
  proposal is auto-surfaced (chatter/advisor) or on-demand.
- **"inform JLSG/JTF HQ"** — annotate the order/history only, or also emit a chatter line? (default:
  annotate + chatter.)
- **Overlap with original W4/W5** — keep the OF-8 supply panel coordinated so W5 (request-data /
  panels) doesn't re-do it.
