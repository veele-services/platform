# Fieldgrid Hardening Dependency Graph

## Foundation

1. `FG-HARD-P2-003` runtime evidence program
2. `FG-HARD-P0-SEC-001` auth challenge and recovery boundary
3. `FG-HARD-P0-SEC-002` host-bound identity, AAL and tenant profile resolution

These are prerequisites for credible closure of the security backlog because most source PRs currently provide static source guards only.

## P0 Security Chain

```text
FG-HARD-P2-003
  -> FG-HARD-P0-SEC-001
  -> FG-HARD-P0-SEC-002
      -> FG-HARD-P0-SEC-003
      -> FG-HARD-P0-SEC-005
      -> FG-HARD-P0-SEC-006
FG-HARD-P0-SEC-003
  -> FG-HARD-P0-SEC-004
```

Assignment IDOR closure must land before status transition work is treated as safe, because transition commands still need tenant-bound parent rows.

## Finance Chain

```text
FG-HARD-P2-003
  -> FG-HARD-P0-DATA-001
      -> FG-HARD-P0-DATA-002
      -> FG-HARD-P1-PROD-005
```

Payment intent/inbox/ledger work is the finance base layer. Report approval and customer-visible invoice/payment claims should not be marked complete until ledger and proposal atomicity are covered by DB/runtime tests.

## Execution Chain

```text
FG-HARD-P1-PROD-003
  -> FG-HARD-P1-PROD-002
      -> FG-HARD-P1-REL-005
      -> FG-HARD-P0-DATA-002
```

The team execution model from #292 is an architecture dependency, not implemented behavior. It must be handled before production claims around multi-person closeout, participant reports, signatures or offline replay.

## Reliability Chain

```text
FG-HARD-P1-REL-001
  -> FG-HARD-P1-REL-002
FG-HARD-P1-REL-003
  -> FG-HARD-P1-REL-004
FG-HARD-P0-SEC-005
  -> FG-HARD-P1-REL-006
```

Outbox and worker behavior should be fixed together enough to avoid partial delivery cutovers. Settings, availability and upload cleanup can proceed independently once the shared tenant identity helpers are stable.

## Product Contract Chain

```text
FG-HARD-P1-PROD-001
  -> FG-HARD-P1-PROD-004
  -> FG-HARD-P1-PROD-006
FG-HARD-P1-PROD-005
  -> FG-HARD-P0-DATA-001
```

Entitlement and module gates influence customer, personnel, tickets and finance surfaces. Customer-visible workflow claims depend on the finance ledger and module gates.
