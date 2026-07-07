# QTI Protocol — Squads Multisig NAV Report

**Report Month:** 2026-07 (July 2026)
**Report ID:** RP-DEASI-NAV-SQUADS-2026-0707-001
**Gate Reference:** V3-G8
**Protocol Version:** v3
**Prepared by:** Richard Patterson (@De-ASI-INTERFACE)
**Prepared at:** 2026-07-07T02:22 EDT
**Governance Model:** Squads Protocol v4 — 2-of-3 Multisig
**Vault Authority:** `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`

---

## 1. Squads Vault Summary

| Field | Value |
|---|---|
| Squads Vault Address | `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` |
| Vault Type | Squads Protocol v4 PDA |
| Signature Threshold | 2-of-3 |
| Network | Solana Mainnet-beta (pending deployment) |
| Vault Role | Sole reconfiguration authority for both QTI programs |
| Fee collection destination | This vault |
| Programs governed | `qti_emissions_controller`, `qti_developer_credits` |
| Program upgrade authority | Squads vault (post-migration) |

---

## 2. Authority State

### 2a. `qti_emissions_controller` (`EMiSCtRL1QTIDeASIInterface111111111111111111`)

| Authority Type | Holder | Status |
|---|---|---|
| `emissionsConfig.authority` | Squads vault `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` | 🔄 Pending mainnet `initialize_config` |
| `emissions_authority` PDA (mint_authority) | `emissions_authority` PDA (program-controlled) | ✅ Enforced on-chain at `createMint` |
| `squads_vault` instruction param | `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` | ✅ Stored in `EmissionsConfig.authority` at init |
| Program upgrade authority | Hot wallet → Squads vault (migration pending) | 🔄 See `MULTISIG_MIGRATION.md` checklist |

### 2b. `qti_developer_credits` (`9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv`)

| Authority Type | Holder | Status |
|---|---|---|
| `controller_state.authority` | Squads vault `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` | 🔄 Pending mainnet `initialize_controller` |
| `update_params` / `pause_controller` gating | `controller_state.authority == squads_vault` | ✅ Enforced on-chain via `ControllerError::Unauthorized` |
| Program upgrade authority | Hot wallet → Squads vault (migration pending) | 🔄 See `MULTISIG_MIGRATION.md` checklist |

---

## 3. Multisig Migration Checklist Status

Ref: [`docs/MULTISIG_MIGRATION.md`](../docs/MULTISIG_MIGRATION.md)

| Step | Description | Status |
|---|---|---|
| 1 | Squads vault PDA deployed (2-of-3 threshold) | 🔄 Pending mainnet |
| 2 | `mint_authority` transferred: hot wallet → `emissions_authority` PDA | ✅ Enforced structurally — PDA is mint_authority at `createMint` |
| 3 | `freeze_authority` transferred to Squads vault | 🔄 Pending (set `null` or vault at mint creation) |
| 4 | Metaplex `update_authority` transferred to Squads vault | 🔄 Pending (post mint-metadata creation) |
| 5 | `initialize_config` called with `squads_vault` as authority | 🔄 Pending mainnet deploy |
| 6 | `initialize_controller` called with `squads_vault` as authority | 🔄 Pending mainnet deploy |
| 7 | Hot wallet revocation confirmed via `spl-token display` | 🔄 Pending |
| 8 | Post-migration verification output committed to repo | 🔄 Pending |
| 9 | Program upgrade authority transferred to Squads vault | 🔄 Pending |

> **Test suite note:** In localnet tests, `authority.publicKey` (payer wallet) is used as the mock Squads vault. This is intentional — the test environment cannot deploy Squads v4 on localnet. Mainnet will use `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`.

---

## 4. Squads-Gated Instructions

The following instructions require a valid 2-of-3 Squads multisig transaction approved by the vault before execution on mainnet:

### `qti_emissions_controller`

| Instruction | Squads Required | Risk if Bypassed |
|---|---|---|
| `initialize_config` | ✅ Yes — sets vault as permanent authority | Unauthorized emission parameters |
| `update_config` | ✅ Yes — `authority` constraint | Arbitrary cap / epoch manipulation |
| `pause_emissions` | ✅ Yes — `authority` constraint | Unauthorized protocol halt |
| `resume_emissions` | ✅ Yes — `authority` constraint | Unauthorized emission restart |
| `transfer_authority` | ✅ Yes — `authority` constraint | Governance takeover |
| `emit_rewards` | ❌ No — permissionless | N/A (Gini gate enforces fairness) |

### `qti_developer_credits`

| Instruction | Squads Required | Risk if Bypassed |
|---|---|---|
| `initialize_controller` | ✅ Yes — sets vault as permanent authority | Unauthorized Gini params |
| `update_params` | ✅ Yes — `authority` constraint | Arbitrary gate manipulation |
| `pause_controller` | ✅ Yes — `authority` constraint | Unauthorized emission block |
| `resume_controller` | ✅ Yes — `authority` constraint | Unauthorized gate re-open |
| `finalize_epoch` | ✅ Yes — `authority` constraint | Unauthorized Gini update |
| `record_reward` | ❌ No — permissionless | N/A (accumulator is per-participant) |

---

## 5. NAV Under Squads Governance

| Metric | Value |
|---|---|
| Total emission cap (Squads-governed) | 10,000 QTI (`totalEmissionCap`) |
| Per-epoch emission max (Squads-settable) | 1,000 QTI (`maxEmissionPerEpoch`) |
| Epoch duration (Squads-settable) | 216,000 slots ≈ 24 hours |
| Gini target (Squads-settable via `update_params`) | 3,500 ×10⁻⁴ = 0.35 |
| Proportional gain k (Squads-settable) | 1,000 ×10⁻⁴ = 0.10 |
| Minimum Squads signatures required to change any param | 2-of-3 |
| Current NAV basis (pre-launch) | 1.0000 QTI per share (parity) |
| Fees accrued to vault this period | 0.00 QTI (pre-launch) |
| Fees collectible post-launch | 1.0% mgmt (ann.) + 10% performance on rewards |

---

## 6. Governance Transactions This Period

| Date | Instruction | Signed By | Squads Tx | Status |
|---|---|---|---|---|
| 2026-07-07 | `initialize_config` (testnet mock) | `authority.publicKey` (test payer) | N/A — localnet | ✅ Test suite `before()` hook |
| 2026-07-07 | `initialize_controller` (testnet mock) | `authority.publicKey` (test payer) | N/A — localnet | ✅ Test suite `before()` hook |
| 2026-07-07 | `update_config` ×8 (FV-1, FV-3, FV-4 sub-suites) | Test authority | N/A — localnet | ✅ All passed |
| 2026-07-07 | `transfer_authority` ×4 (transfer + restore cycles) | Test authority + new key | N/A — localnet | ✅ FV-4a–d passed |
| Mainnet | All above — pending V3 gate passage | Squads 2-of-3 | TBD | 🔄 Pending |

---

## 7. Risk Events & Squads Impact

| Date | Event | Squads Impact | Resolution |
|---|---|---|---|
| 2026-07-07 | `Anchor.toml` cluster=mainnet blocked CI | None — no mainnet txns issued | Fixed [`a8cabdb`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/a8cabdb2a3f6dad7816e931f8eabd9d763086544) |
| 2026-07-07 | Missing `giniControllerState` in emit calls | None — no mainnet txns issued | Fixed [`0d0eb44`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/0d0eb442540b779cea91470da71c63fdbd161d61) |
| 2026-07-07 | `GiniControllerState` PDA not initialized pre-test | None — no mainnet txns issued | Fixed [`3797077`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/3797077728512965bd2abf2cee282a164ba92e15) |
| Ongoing | Hot wallet still holds upgrade authority (pre-migration) | **Medium** — single key can upgrade programs | Blocked on mainnet Squads vault deploy |

---

## 8. Squads Vault Verification Commands

Run these after mainnet Squads vault is created and authorities transferred:

```bash
# Confirm Squads vault is mint_authority (via emissions_authority PDA)
spl-token display <QTI_MINT_ADDRESS>

# Confirm emissions config authority = Squads vault
anchor account qti_emissions_controller.EmissionsConfig <EMISSIONS_CONFIG_PDA> \
  --provider.cluster mainnet

# Confirm credits controller authority = Squads vault
anchor account qti_developer_credits.InequalityControllerState <CONTROLLER_STATE_PDA> \
  --provider.cluster mainnet

# Confirm hot wallet CANNOT call update_config (must fail Unauthorized)
anchor run test-unauthorized --provider.cluster mainnet

# Confirm program upgrade authority = Squads vault
solana program show EMiSCtRL1QTIDeASIInterface111111111111111111
solana program show 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv
```

---

## 9. Open Action Items

| # | Action | Owner | Target Date |
|---|---|---|---|
| 1 | Deploy Squads v4 vault on mainnet-beta | @De-ASI-INTERFACE | Post V3-G8 |
| 2 | Call `initialize_config` with vault as `squads_vault` param | @De-ASI-INTERFACE | Post vault deploy |
| 3 | Call `initialize_controller` with vault as `squads_vault` param | @De-ASI-INTERFACE | Post vault deploy |
| 4 | Transfer program upgrade authority to Squads vault | @De-ASI-INTERFACE | Post vault deploy |
| 5 | Transfer `freeze_authority` to Squads vault or revoke | @De-ASI-INTERFACE | Post mint creation |
| 6 | Complete `MULTISIG_MIGRATION.md` checklist and commit output | @De-ASI-INTERFACE | Post all transfers |
| 7 | Run post-migration verification commands and commit terminal output | @De-ASI-INTERFACE | Post migration |

---

## 10. Identifiers & Attestation

| Field | Value |
|---|---|
| Squads NAV Report ID | RP-DEASI-NAV-SQUADS-2026-0707-001 |
| Base NAV Report ID | RP-DEASI-NAV-2026-0707-001 |
| Emissions Controller ID | RP-DEASI-EMISSIONS-2026-0627-001 |
| Inequality Controller ID | RP-DEASI-INEQUALITY-2026-0707-001 |
| Author | Richard Arlie Charles Patterson (@De-ASI-INTERFACE) |
| Squads Vault / Fee Destination | `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` |
| Emissions Program ID | `EMiSCtRL1QTIDeASIInterface111111111111111111` |
| Credits Program ID | `9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv` |
| Gate Reference | V3-G8 |
| License | MIT — © 2026 Richard Arlie Charles Patterson |

---

*Published by De-ASI-INTERFACE Protocol Engineering*
*Prepared in accordance with QTI Protocol v3 Institutional Specification*
*Squads Multisig Governance Report — Gate Reference: V3-G8*
