# Phase 2 Dependency Graph

```mermaid
graph TD
  w01[W01 assignment lifecycle] --> w02[W02 time semantics]
  w01 --> w03[W03 staffing and interest]
  w02 --> w03
  w02 --> w04[W04 availability and eligibility]
  w03 --> w05[W05 multi-person execution]
  w04 --> w05
  w05 --> w06[W06 realtime projections]
  w03 --> w07[W07 planboard UX]
  w06 --> w07
  w05 --> w08[W08 personnel offline PWA]
  w06 --> w08
  w06 --> w09[W09 customer visibility]
  w10[W10 account recovery] --> w11[W11 acceptance evidence]
  w06 --> w11
  w07 --> w11
  w08 --> w11
  w09 --> w11
```

The source of truth is `docs/phase-2/workstreams.json`; this diagram is descriptive. The validation test asserts that all dependencies refer to known workstream ids and that the graph is acyclic.
