---
id: 73-official-docs-tab
title: Official Info-Docs Tab
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: []
source_files:
  - frontend/scripts/sync-assets.mjs
  - frontend/src/lib/infoDocs.ts
  - frontend/src/hooks/useInfoDocs.ts
  - frontend/src/components/InfoDocsPanel.tsx
  - frontend/src/components/SupplyPanel.tsx
  - frontend/src/App.tsx
  - Official logistic documents/AJP_4_3_A1_2021_Host_Nation_Support_EDA_V1.pdf
  - Official logistic documents/AJP_4_4_C1_2022_Movement_UK.pdf
  - Official logistic documents/AJP_4_6_C1_2018_doctrine_nato_joint_logistic_support_group_ajp.pdf
  - Official logistic documents/AJP_4_B1_2025_with_UK_NE.pdf
routes: []
models: []
test_files:
  - frontend/src/lib/infoDocs.test.ts
  - frontend/src/components/InfoDocsPanel.test.tsx
data_flow: greenfield
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, info-docs, ajp, pdf, static-assets]
path: OF-8/Docs
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 73 — Official Info-Docs Tab

## Purpose

Add an **Info docs** tab to the OF-8 supply view that lists and opens the official PDFs from
the `Official logistic documents/` folder (all of them, grouped). The PDFs are committed and
served statically.

## Architecture

The PDFs are committed at `Official logistic documents/`; `sync-assets` copies them into
`public/docs/` (gitignored copies) at dev/build time and writes a `manifest.json` of the PDF
filenames. The frontend `useInfoDocs` fetches the manifest; the pure `infoDocs.ts` derives a
readable title and a group per file; `InfoDocsPanel` renders the grouped links (open in a new
tab). An "Info docs" button on the supply panel head opens the panel.

## Business Rules

- All PDFs in the folder are shown (logistics + any non-logistics), grouped: `AJP_*` →
  "NATO logistics doctrine (AJP)", everything else → "Other documents".
- Titles are derived from filenames (separators → spaces; all-caps/number tokens preserved).
- Each entry opens `/docs/<file>` in a new tab (`rel="noopener noreferrer"`).
- An empty / missing manifest renders an empty-state message (panel never errors).

## Data Flow

`Official logistic documents/*.pdf` → sync-assets → `public/docs/*` + `manifest.json` →
`useInfoDocs` fetch → `groupDocs` → `InfoDocsPanel` links.

## Dependencies

- sync-assets pipeline (extended in F3 for logos) — also stages the PDFs + manifest.

## Security

Static read-only PDFs served by the frontend; links open in a sandboxed new tab
(`noopener noreferrer`). No user input.

## Known Issues

(none)

## Bugs

(none yet)
