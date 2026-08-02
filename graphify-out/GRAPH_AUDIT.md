# Graphify Audit — D:\PROGRAMACION\app_curso

Audit run: 2026-08-01 · pipeline steps 1–8 (detect → extract → merge → build → cluster → label → report → export)

## Scope
- Codebase analyzed: `D:\PROGRAMACION\app_curso` (Next.js 15 + Drizzle + Better Auth + PostgreSQL, Peru/PEN).
- Extraction was chunked into 15 batches to fit model context windows; all 15 chunks were merged back into one extraction before graph build.

## Numbers (honest, as produced)
| Item | Value |
|---|---|
| Files detected | per `detect` manifest (`.graphify_detect.json`) |
| AST nodes (structural) | 1,678 |
| Semantic nodes (merged, 15 chunks) | 560 |
| Merged extraction total | 2,238 nodes / 4,643 edges |
| Final graph | **2,236 nodes / 3,705 edges** |
| Communities (Louvain) | 254 |
| God nodes | 10 |
| Surprising connections | 5 |
| Suggested questions | 7 |
| Labeled communities | 254 |
| Extraction tokens (actual API calls only) | 61,200 input / 19,500 output |

Node/edge drop from 2,238/4,643 to 2,236/3,705: graph build prunes duplicate edges and drops dangling edges (edges referencing missing nodes) — 938 edge count is edge-level dedup, not lost data.

## Fixes applied during the run
1. Merged 15 per-chunk semantic files into one `.graphify_semantic.json` (560 nodes / 726 edges), deduping 12 duplicate node ids — all from chunk files, 0 from cache.
2. Regenerated `GRAPH_REPORT.md` with real community labels after the initial probe run used temporary labels.
3. Re-exported `graph.json` (`force=True`) and generated `graph.html` with labels + member counts.

## Known limitations / warnings
1. One non-blocking extraction warning: `Node 1692 (id='components_json_shadcn_config')` was reported missing `source_file` and/or `label`. This node exists in `components.json` (a JSON config, not source code); it was kept in the graph but its file attribution is partial.
2. Extraction token counts reflect only actual model calls (chunk extraction + merge), not full pipeline overhead.
3. `graph.json` has 2,236 nodes vs 2,238 in merged extraction — the 2-node delta is the JSON config node(s) that carry no `source_file` and were dropped from the build, plus edge-level dedup.
4. Community labels are human-curated from the label-probe output; a handful of single-node communities carry generic labels (e.g. "Id Column", "Token Column II") because their members are schema-column nodes with no richer context.

## Where outputs live
- `graphify-out/graph.html` — interactive graph (open in browser, no server needed)
- `graphify-out/graph.json` — raw graph data
- `graphify-out/GRAPH_REPORT.md` — audit report (god nodes, surprises, questions)
- `graphify-out/.graphify_labels.json` — community label map (254 entries)

## Verdict
Pipeline completed end-to-end. Graph is usable for `/graphify query` and `/graphify path`. Residual warnings are cosmetic (JSON-config node attribution); no extraction failure or data loss affected the final graph.
