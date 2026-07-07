# Gini Gate Integration — qti_emissions_controller ↔ qti_developer_credits

**Author:** Richard Patterson (@De-ASI-INTERFACE)  
**Ref:** RP-DEASI-INEQUALITY-2026-0707-001  

---

## Overview

`emit_rewards` in `qti_emissions_controller` reads the `GiniControllerState` PDA
owned by `qti_developer_credits` (program ID: `9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv`)
before minting any tokens. If `gini_gate_open == false`, the mint is blocked and
`InequalityGateBlocked` is emitted.

## PDA Derivation

```
Seeds: [b"developer_credits_state", qti_mint.key()]
Owner: 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv
```

## Localnet Test Setup

Before running `anchor test`, both programs must be deployed and the
`GiniControllerState` PDA must exist with `gini_gate_open = true`:

```bash
bash scripts/setup-localnet.sh
# Then initialize the credits controller:
anchor run init-gini-controller  # see package.json scripts
```

## CI Integration

The GitHub Actions CI workflow (`ci.yml`) must:
1. Deploy `qti_developer_credits.so` with `--bpf-program 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv`
2. Deploy `qti_emissions_controller.so` with `--bpf-program EMiSCtRL1QTIDeASIInterface111111111111111111`  
3. Call `initialize_controller` on `qti_developer_credits` with `gini_gate_open = true`
4. Run `anchor test --skip-deploy`

## Gate Logic

| Condition | `gini_gate_open` | `emit_rewards` result |
|---|---|---|
| `current_gini <= g_target + tolerance` | `true` | ✅ Mint proceeds |
| `current_gini > g_target + tolerance` | `false` | ❌ `InequalityGateViolated` |

## On-chain Event Monitoring

When the gate blocks a mint, `InequalityGateBlocked` is emitted with:
- `epoch_index` — which epoch triggered the block
- `current_gini` — the observed Gini coefficient (×10,000)
- `g_target` — the configured target (×10,000)
- `slot` / `timestamp` — for Grafana alerting
