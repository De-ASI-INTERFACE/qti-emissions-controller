# QTI Emissions Controller

[![Anchor](https://img.shields.io/badge/Anchor-0.30.1-ff6b35?style=flat-square)](https://www.anchor-lang.com)
[![Rust](https://img.shields.io/badge/Rust-1.79.0-orange?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Solana](https://img.shields.io/badge/Chain-Solana_Mainnet-9945FF?style=flat-square&logo=solana&logoColor=white)](https://solana.com)
[![CI](https://img.shields.io/github/actions/workflow/status/De-ASI-INTERFACE/qti-emissions-controller/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/actions)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square)](./LICENSE)
[![GitHub Org](https://img.shields.io/badge/Org-De--ASI--INTERFACE-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/De-ASI-INTERFACE)

> **Program ID:** `EMiSCtRL1QTIDeASIInterface111111111111111111` *(replace after `anchor deploy`)*
> **Author:** Richard Patterson ([@De-ASI-INTERFACE](https://github.com/De-ASI-INTERFACE))
> **Identifier:** RP-DEASI-EMISSIONS-2026-0627-001
> **Deployer:** `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`

Squads-gated, rate-limited SPL token minting program for QTI staking reward distributions on Solana Mainnet-Beta.

---

## Security Architecture

```
Squads v4 Vault (2-of-3 multisig)          ← Root of trust
  └─ Root governance authority
  └─ Can: update_config, pause, resume, transfer_authority
       │
       ▼
Emissions Authority PDA  [b"emissions_authority"]  ← No private key
  └─ Sole signer for all spl-token MintTo CPIs
  └─ Enforces: per-epoch cap + lifetime cap on every call
       │
       ▼
QTI SPL Token Mint  →  Staker recipient ATAs
```

---

## Instructions

| Instruction | Signer | Description |
|---|---|---|
| `initialize_config` | payer (Squads-approved, once) | Set epoch, per-epoch cap, lifetime cap |
| `emit_rewards` | permissionless (rate-limited by PDA) | Mint QTI to staker ATA |
| `update_config` | Squads vault only | Adjust emission parameters |
| `pause_emissions` | Squads vault only | Emergency halt |
| `resume_emissions` | Squads vault only | Resume after governance review |
| `transfer_authority` | Squads vault only | Migrate to new governance vault |

---

## Security Hardening Checklist

- [x] `emissions_authority` is a PDA — no private key
- [x] `mint_authority` validated on every `emit_rewards` call
- [x] All arithmetic is `checked_add` — no overflow possible
- [x] Per-epoch cap + lifetime cap enforced independently
- [x] Emergency pause/resume via governance multisig
- [x] `total_emission_cap` can only be reduced, never increased
- [x] Full on-chain event emission for Grafana monitoring
- [x] Authority transfer emits auditable on-chain event
- [x] Idempotent epoch rollover with no griefing surface
- [x] CI: `cargo clippy -D warnings` + `cargo fmt` + `anchor build` + full test suite
- [x] TruffleHog secret scan on every PR

---

## Emission Parameters

| Parameter | Recommended | Notes |
|---|---|---|
| `epoch_duration_slots` | `216_000` | ~1 day @ 400ms/slot |
| `max_emission_per_epoch` | Protocol-defined | ≤ 0.1% of circulating supply |
| `total_emission_cap` | Staking reserve | Hard ceiling — immutable ceiling |

---

## Local Development

```bash
# Prerequisites: Rust 1.79, Solana 1.18.22, Anchor 0.30.1, Node 20

git clone https://github.com/De-ASI-INTERFACE/qti-emissions-controller
cd qti-emissions-controller
yarn install
anchor build
anchor test
```

---

## Mainnet Deployment Sequence

```bash
# 1. Build and verify locally
anchor build && anchor test

# 2. Deploy to mainnet
anchor deploy --provider.cluster mainnet-beta

# 3. Transfer QTI mint_authority to emissions_authority PDA
spl-token authorize <QTI_MINT> mint <EMISSIONS_AUTHORITY_PDA>

# 4. Initialize config (Squads-approved transaction)
QTI_MINT=<mint> SQUADS_VAULT=<vault> \
MAX_PER_EPOCH=100000 TOTAL_CAP=200000000 \
yarn ts-node scripts/initialize_config.ts

# 5. Verify on-chain binary
solana-verify verify-from-repo \
  --url https://api.mainnet-beta.solana.com \
  --program-id <DEPLOYED_PROGRAM_ID> \
  --mount-path programs/qti_emissions_controller \
  --library-name qti_emissions_controller \
  https://github.com/De-ASI-INTERFACE/qti-emissions-controller
```

---

## Testnet Deployment (V3-G4 Public Testnet)

> 🟢 **Status: ACTIVE** | Window: `2026-07-09` – `2026-08-08` (30 calendar days)
> Bug bounty is open. See [BUG_BOUNTY.md](./BUG_BOUNTY.md) for scope, severity matrix, and submission process.

### Deployed Program Addresses

| Program | Address | Cluster | Explorer |
|---|---|---|---|
| `qti_emissions_controller` | `EMiSCtRL1QTIDeASIInterface111111111111111111` | Solana Devnet | [View on SolanaFM](https://solana.fm/address/EMiSCtRL1QTIDeASIInterface111111111111111111?cluster=devnet-alpha) |
| `qti_developer_credits` | `9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv` | Solana Devnet | [View on SolanaFM](https://solana.fm/address/9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv?cluster=devnet-alpha) |

**Public Devnet RPC:** `https://api.devnet.solana.com`

### Interacting with the Testnet

Community participants are encouraged to interact with governance, emissions, and the vault
during the testnet window. Use the following to get started:

```bash
# Configure CLI for devnet
solana config set --url devnet

# Airdrop devnet SOL
solana airdrop 2

# Verify emissions controller is deployed
solana program show EMiSCtRL1QTIDeASIInterface111111111111111111

# Verify developer credits program
solana program show 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv
```

### Governance Smoke Tests (V3-G4 Requirement)

The V3-G4 gate requires a minimum of **3 external participants** to execute governance
interactions and submit transaction signatures as evidence. If you are willing to
participate, please:

1. Interact with governance (proposal creation or voting) on devnet
2. Submit your transaction signature(s) as a comment on
   [Issue #4](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/issues/4)
3. You will be credited in the V3-G4 gate closure report

### Testnet Deployment Record

| Field | Value |
|---|---|
| Window Open | `2026-07-09` |
| Window Close | `2026-08-08` |
| Deploy Tx Hash | _(to be filled post-deploy)_ |
| Init Tx Hash | _(to be filled post-init)_ |
| Squads Vault PDA | _(to be filled post-setup)_ |

---

## Related Repositories

| Repo | Purpose |
|---|---|
| [QTI-token](https://github.com/De-ASI-INTERFACE/QTI-token) | SPL token metadata + on-chain registration |
| [qti-launch-site](https://github.com/De-ASI-INTERFACE/qti-launch-site) | Public launch UI + Jupiter routing |
| [rp-jup-aggregator-v6](https://github.com/De-ASI-INTERFACE/rp-jup-aggregator-v6) | Jupiter swap execution + HTTP 402 gating |
| [De-ASI-INTERFACE](https://github.com/De-ASI-INTERFACE/De-ASI-INTERFACE) | ASI base layer + agentic finance |

---

## Security

See [SECURITY.md](./SECURITY.md), [BUG_BOUNTY.md](./BUG_BOUNTY.md), and [docs/MULTISIG_MIGRATION.md](./docs/MULTISIG_MIGRATION.md).
Org-level audit report: [AUDIT_REPORT.md](https://github.com/De-ASI-INTERFACE/De-ASI-INTERFACE/blob/main/AUDIT_REPORT.md)
