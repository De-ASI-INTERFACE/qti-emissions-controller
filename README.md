# QTI Emissions Controller

[![Anchor](https://img.shields.io/badge/Anchor-0.30.1-ff6b35?style=flat-square)](https://www.anchor-lang.com)
[![Rust](https://img.shields.io/badge/Rust-1.79.0-orange?style=flat-square&logo=rust)](https://www.rust-lang.org)
[![Solana](https://img.shields.io/badge/Chain-Solana_Mainnet-9945FF?style=flat-square&logo=solana)](https://solana.com)
[![Build](https://img.shields.io/github/actions/workflow/status/De-ASI-INTERFACE/qti-emissions-controller/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/De-ASI-INTERFACE/qti-emissions-controller/actions)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue?style=flat-square)](./LICENSE)
[![GitHub Org](https://img.shields.io/badge/Org-De--ASI--INTERFACE-181717?style=flat-square&logo=github)](https://github.com/De-ASI-INTERFACE)

> **Program ID:** `EMiSCtRL1QTIDeASIInterface111111111111111111` *(replace post-deploy)*
> **Identifier:** `RP-DEASI-EMISSIONS-2026-0627-001`
> **Author:** Richard Patterson ([@De-ASI-INTERFACE](https://github.com/De-ASI-INTERFACE))
> **Deployer:** `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my`

Squads v4-gated, rate-limited SPL token minting program for QTI staking reward distributions on Solana Mainnet-Beta.

---

## Architecture

```
Squads v4 Vault  [2-of-3 multisig]
  └─ root mint_authority — never hot
  └─ can: initialize_config, update_config, pause, resume
        │
        ▼  delegates via PDA derivation
Emissions Authority PDA  [seeds: b"emissions_authority"]
  └─ program-derived — no private key exists
  └─ sole signer for all spl-token MintTo CPIs
  └─ enforces: per-epoch cap + lifetime cap + pause guard
        │
        ▼
QTI SPL Token Mint  →  Staker Recipient ATA
```

---

## Security Properties

| Property | Implementation |
|---|---|
| No human mint key | `mint_authority` = PDA only |
| Per-epoch rate limit | `max_emission_per_epoch` enforced on every call |
| Lifetime ceiling | `total_emission_cap` — ratchet: can only decrease |
| Emergency kill switch | `pause_emissions` — single Squads tx, self-enforcing |
| Overflow safe | All accounting via `checked_add` / `checked_sub` |
| Self-enforcing revocation | `emit_rewards` asserts PDA == mint_authority live |
| No double-init | `initialized` flag + PDA `init` constraint |
| Single-call size cap | `MAX_SINGLE_EMIT` guard against griefing |

---

## Instructions

| Instruction | Authority | Description |
|---|---|---|
| `initialize_config` | Deployer / Squads (once) | Set epoch length, per-epoch cap, lifetime cap |
| `emit_rewards` | Any caller (rate-limited) | Mint QTI to staker ATA |
| `update_config` | Squads vault only | Adjust emission params (cap only downward) |
| `pause_emissions` | Squads vault only | Emergency halt |
| `resume_emissions` | Squads vault only | Resume after governance review |

---

## Deployment Sequence

```bash
# 1. Build & test
yarn install && anchor build && anchor test

# 2. Deploy
anchor deploy --provider.cluster mainnet-beta

# 3. Derive PDAs
ts-node scripts/derive_pdas.ts

# 4. Transfer mint_authority to emissions_authority PDA
ts-node scripts/transfer_mint_authority.ts

# 5. Initialize config
ts-node scripts/initialize_config.ts

# 6. Verify on-chain binary
yarn verify
```

---

## Related Repositories

| Repo | Role |
|---|---|
| [QTI-token](https://github.com/De-ASI-INTERFACE/QTI-token) | SPL token metadata + mint |
| [qti-launch-site](https://github.com/De-ASI-INTERFACE/qti-launch-site) | Public UI + Jupiter routing |
| [rp-jup-aggregator-v6](https://github.com/De-ASI-INTERFACE/rp-jup-aggregator-v6) | Jupiter swap execution |
| [De-ASI-INTERFACE](https://github.com/De-ASI-INTERFACE/De-ASI-INTERFACE) | ASI ecosystem base layer |
