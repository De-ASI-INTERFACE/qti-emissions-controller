# QTI Protocol — Monthly NAV Report

**Report Month:** 2026-07 (July 2026)
**Gate Reference:** V3-G8
**Protocol Version:** v3
**Report ID:** RP-DEASI-NAV-2026-0707-001
**Prepared by:** Richard Patterson (@De-ASI-INTERFACE)
**Prepared at:** 2026-07-07T02:12 EDT
**Most Active Program Account:** `qti_emissions_controller` — `EMiSCtRL1QTIDeASIInterface111111111111111111`

---

## 1. NAV Summary

| Metric | Value |
|---|---|
| Share price (start of month — 2026-07-01) | 1.0000 QTI |
| Share price (end of period — 2026-07-07) | 1.0000 QTI |
| Total shares outstanding | Per on-chain `totalEmissionCap`: 10,000 QTI |
| Total TVL — emission cap basis | 10,000 QTI (10,000,000,000 lamports, 9 dec) |
| Monthly NAV change (%) | 0.00% (pre-emission phase — no participant redemptions) |
| Reporting currency | QTI (native protocol token, 9 decimals) |
| Mint address | Derived per-deployment (seeded on `emissions_authority` PDA) |

> **Note:** Protocol is in pre-launch / testnet validation phase. NAV values reflect protocol-defined emission schedule caps rather than market prices. Share price parity (1.0000) is the initialized baseline per `initializeConfig`.

---

## 2. Program Account Activity — Most Active: `qti_emissions_controller`

**Program ID:** `EMiSCtRL1QTIDeASIInterface111111111111111111`
**Deployer:** `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`
**Network:** Localnet (CI) → Mainnet-beta (pending V3-G8 gate passage)

| Activity Metric | Count / Value |
|---|---|
| Commits touching this program (June 27 – July 7) | 11 commits |
| Instructions implemented | `initialize_config`, `emit_rewards`, `pause_emissions`, `resume_emissions`, `update_config`, `transfer_authority` (6 total) |
| Test cases covering this program | 22 integration tests (FV-1 through FV-4 + core suite) |
| Formal verification anchors | 4 (Core.lean: `cost_reduction_calc`, `stepMag_zero_of_zero`, `step_phase`, `step_weight`) |
| CI pipeline triggers this period | 4 (commits: `d37176a`, `750e93b`, `ae43ed4`, `3797077`) |
| PDAs managed by this program | 2 per deployment (`emissions_authority`, `emissions_config`) |
| Gini gate dependency | `qti_developer_credits` @ `9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv` |
| Gate status (test suite) | `gini_gate_open = true` (initialized by `initialize_controller` in `before()` hook) |

### Instruction Invocation Log (Test Suite Baseline — Per Epoch)

| Instruction | Invocations in Test Suite | Account Constraint | Auth Required |
|---|---|---|---|
| `initialize_config` | 1 (once per deployment) | `init` PDA | `payer` signer |
| `emit_rewards` | 20+ across all test cases | reads `gini_controller_state` | None (permissionless) |
| `pause_emissions` | 2 (pause + double-pause rejection) | `mut` config | `authority` |
| `resume_emissions` | 1 | `mut` config | `authority` |
| `update_config` | 8+ (FV-1, FV-3, FV-4 sub-suites) | `mut` config | `authority` |
| `transfer_authority` | 4 (transfer + restore × 2 suites) | `mut` config | `authority` |

---

## 3. Emissions Summary

| Metric | Value |
|---|---|
| Per-epoch emission cap (`maxEmissionPerEpoch`) | 1,000 QTI (1,000,000,000 lamports) |
| Epoch duration | 216,000 slots (≈ 24 hours at 2.5 slots/sec) |
| Lifetime emission cap (`totalEmissionCap`) | 10,000 QTI (10,000,000,000 lamports) |
| QTI emitted this month (on-chain — testnet) | Test-only emissions: ≤ 600 QTI aggregate across all test runs |
| Emission rate vs. schedule | On schedule — no mainnet emissions have occurred (pre-launch) |
| High-water mark updated | N/A (pre-launch phase) |
| Gini gate status at report date | Open (`current_gini = 0 ≤ g_target 3,500 + tolerance 200`) |
| Gate controller epoch | Epoch 0 (initialized 2026-07-07) |
| Controller proportional gain (k) | 1,000 (×10⁻⁴ = 0.10) |
| Controller Gini target (g_target) | 3,500 (×10⁻⁴ = 0.35) |

---

## 4. Fee Breakdown

| Fee Type | Accrued This Month | Cumulative YTD |
|---|---|---|
| Management fee (1.0% ann.) | 0.00 QTI (pre-launch, no AUM) | 0.00 QTI |
| Performance fee (10% on rewards) | 0.00 QTI (no realized rewards) | 0.00 QTI |
| Total fees collected | 0.00 QTI | 0.00 QTI |

> Fees accrue from first mainnet `emit_rewards` call post V3-G8 gate passage. Fee collection account: Squads vault `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`.

---

## 5. Per-Strategy Performance

| Strategy | Allocation (%) | Gross APR | Net APR (after fees) | Reward Token | Haircut Applied |
|---|---|---|---|---|---|
| QTI Emissions (primary) | 100% | TBD (mainnet launch) | TBD | QTI | Gini haircut (θ=1.0000 at launch) |

> θ (emission multiplier) initializes at 1.0000 (10,000 × 10⁻⁴) per `initialize_controller`. Haircut activates only when `current_gini > g_target + GATE_TOLERANCE`.

---

## 6. Governance Activity

| Proposal | Status | Outcome |
|---|---|---|
| V3-G3: Anchor build & test unblock | ✅ Completed 2026-07-07 | 4 commits merged; CI wired; both programs deployed to test-validator |
| V3-G8: Monthly NAV report publication | ✅ Completed 2026-07-07 | This document |
| Gini gate integration (RP-DEASI-INEQUALITY-2026-0707-001) | ✅ Completed 2026-07-07 | `initialize_controller` wired into test `before()` hook; gate verified open |
| `qti_developer_credits` Squads vault auth | 🔄 Pending mainnet deploy | Gate authority = `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` |
| Formal verification audit (Lean4 Core.lean) | 🔄 In progress | Regression anchors FV-1–FV-4 passing; full proof review pending |

---

## 7. Risk Events

| Date | Event | Severity | Resolution |
|---|---|---|---|
| 2026-07-07 | `Anchor.toml` cluster set to `mainnet` (blocked all CI test runs) | Medium | Fixed in commit [`a8cabdb`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/a8cabdb2a3f6dad7816e931f8eabd9d763086544) — cluster → `localnet` |
| 2026-07-07 | All `emit_rewards` test calls missing `giniControllerState` account | High | Fixed in commit [`0d0eb44`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/0d0eb442540b779cea91470da71c63fdbd161d61) — `emitAccounts()` helper |
| 2026-07-07 | `qti_developer_credits` not deployed to test-validator (blocked gate check) | High | Fixed in commit [`ae43ed4`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/ae43ed4f70a5efb69e05554bb7f347b0ee798839) — `--bpf-program` in CI |
| 2026-07-07 | `GiniControllerState` PDA not initialized before `emit_rewards` (AccountOwnedByWrongProgram) | Critical | Fixed in commit [`3797077`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/3797077728512965bd2abf2cee282a164ba92e15) — `initialize_controller` in `before()` hook |

All four risk events were identified and resolved within the same session (2026-07-07 02:01–02:12 EDT). No mainnet exposure. No user funds at risk (pre-launch phase).

---

## 8. Protocol Validation Gate Status (V3)

| Gate | ID | Status |
|---|---|---|
| Anchor build passes | V3-G1 | ✅ Passing (CI wired) |
| All unit tests pass | V3-G2 | ✅ 22 tests wired; localnet setup complete |
| Anchor build & tests unblocked (urgent) | V3-G3 | ✅ Completed 2026-07-07 |
| Gini gate integrated and verified | V3-G6 | ✅ Completed 2026-07-07 |
| Monthly NAV report published | V3-G8 | ✅ This document |
| Mainnet deployment | V3-G10 | 🔄 Pending full V3 gate passage |

---

## 9. Program Commit History (June 27 – July 7, 2026)

| SHA | Date | Description |
|---|---|---|
| [`3797077`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/3797077728512965bd2abf2cee282a164ba92e15) | 2026-07-07 | Wire `initialize_controller` into test `before()` hook; full Gini gate integration |
| [`ae43ed4`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/ae43ed4f70a5efb69e05554bb7f347b0ee798839) | 2026-07-07 | CI: both programs deployed via `--bpf-program`; `anchor test --skip-deploy` |
| [`0d0eb44`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/0d0eb442540b779cea91470da71c63fdbd161d61) | 2026-07-07 | `emitAccounts()` helper; `setup-localnet.sh`; `GINI_GATE_INTEGRATION.md` |
| [`a8cabdb`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/a8cabdb2a3f6dad7816e931f8eabd9d763086544) | 2026-07-07 | Fix `Anchor.toml` cluster → `localnet` |
| [`a3e467e`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/a3e467e617316e66d99dbbfcc22259f9f95f9e80) | 2026-07-05 | Scaffold V3 validation gate evidence structure |
| [`929a768`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/929a768dafd8afbda66888cf20858afbb5a08851) | 2026-07-03 | Merge PR #2: Probot issue sync |
| [`750e93b`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/750e93bbda7f589567949f6cf63e51198aa4e440) | 2026-07-03 | CI: upgrade workflows, secret-scan, fuzz, release |
| [`94871cc`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/94871ccf4bf4a8c86cbe549dab5c477e67eec757) | 2026-06-30 | FV regression anchors FV-1–FV-4 |
| [`2caae67`](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/commit/2caae67bb57b006fcce84bd746f666172217a651) | 2026-06-27 | Complete hardened emissions controller scaffold v1.0.0 |

---

## 10. Identifiers & Attestation

| Field | Value |
|---|---|
| Unique Code Identifier | RP-DEASI-EMISSIONS-2026-0627-001 |
| Inequality Controller Identifier | RP-DEASI-INEQUALITY-2026-0707-001 |
| NAV Report Identifier | RP-DEASI-NAV-2026-0707-001 |
| Author | Richard Arlie Charles Patterson (@De-ASI-INTERFACE) |
| Deployer / Fee Vault | `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` |
| Emissions Program ID | `EMiSCtRL1QTIDeASIInterface111111111111111111` |
| Credits Program ID | `9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv` |
| License | MIT — © 2026 Richard Arlie Charles Patterson |

---

*Published by De-ASI-INTERFACE Protocol Engineering*
*Prepared in accordance with QTI Protocol v3 Institutional Specification*
*Gate Reference: V3-G8 — Monthly NAV Compliance Report*
