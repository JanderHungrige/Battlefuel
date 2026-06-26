---
id: battlefuel-v2-wave-17
title: "Wave 17: OF-8 selection-marker bug fixes"
initiative: battlefuel-v2
initiative_version: 11
status: planned
depends_on: none
demo_state: "Two OF-8 selection-marker bugs are gone: (1) selecting a fuel depot on OF-8 activates the purple locate circle, and switching to OF-4 now hides that circle together with the depots (today it lingers while the depots disappear); (2) creating + confirming a fuel run deselects the supply unit and clears its locate circle — matching the OF-4 move-order confirmation behaviour (today the icon moves with the confirmed order but the circle stays and becomes fully visible)."
created: 2026-06-26
hash: 9dc97ab3
---

# Wave 17: OF-8 selection-marker bug fixes

> **Requested 2026-06-26 (brain-dump batch).** Per the standing sequencing rule, bugs first.
> Both are OF-8 selection/locate-marker lifecycle bugs — the purple locate halo (from
> `fix/of8-selection-marker-rendering`, now in prod) isn't cleared in two transitions.

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — on `dev-deployment`, deployed to `:3001`, verified
- [ ] **merged into main / deployed in prod** — in `main`, live `:3000`

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | of8-locate-circle-hide-on-role-switch | — | planned | — |
| 2 | fuel-run-confirm-deselect | — | planned | — |

Build order: 1 and 2 are independent.

### Feature notes (requester 2026-06-26)
- **F1 of8-locate-circle-hide-on-role-switch** — choosing a fuel depot on OF-8 activates the
  purple locate circle. Switching to OF-4 hides the depots but the circle stays visible. The
  purple locate circle must be hidden in that situation too (clear locate state / hide the halo
  layer when the OF-8→OF-4 view switch dims depot markers).
- **F2 fuel-run-confirm-deselect** — selecting a supply fleet and creating a fuel run: on order
  confirmation the icon moves with the confirmed order but the locate circle stays and becomes
  fully visible. On order/move confirmation the unit should be **deselected** (and its circle
  cleared) exactly as the OF-4 move order does.

## Open Research (resolve at plan-time)
- Confirm where the OF-4 move-confirm already clears selection + halo, and reuse that same
  teardown path for the OF-8 fuel-run confirm (F2) and the view-switch (F1) — single source of
  truth for "clear locate marker", not two new ad-hoc clears.
