# QTI Emissions Controller — Anchor Deploy Reference

**Author: Richard Arlie Charles Patterson**
**Copyright: © 2026 Richard Arlie Charles Patterson**
**Project: QTI Emissions Controller**
**Repository: [De-ASI-INTERFACE/qti-emissions-controller](https://github.com/De-ASI-INTERFACE/qti-emissions-controller)**
**Identifier: RP-DEASI-EMISSIONS-2026-0627-001**

---

## Program Identity

| Field | Value |
|---|---|
| Program ID | `EMiSCtRL1QTIDeASIInterface111111111111111111` |
| Cluster | Mainnet |
| Deployer | `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` |
| Authority | Squads vault PDA |
| Mint Authority | `emissions_authority` PDA (no private key) |
| Unique Code | `RP-DEASI-EMISSIONS-2026-0627-001` |

---

## Security Properties

1. Per-epoch emission cap enforced on-chain — no runaway inflation
2. Lifetime total emission cap — hard ceiling, cannot be circumvented
3. Squads vault PDA is sole reconfiguration authority
4. `emissions_authority` PDA holds `mint_authority` — no private key exists
5. Emergency pause/resume controlled exclusively by governance
6. All arithmetic uses checked operations — no overflow/underflow
7. Mint authority validated on every `emit_rewards` call
8. Full on-chain event emission for off-chain monitoring

---

## Instructions

| Instruction | Authority | Description |
|---|---|---|
| `initialize_config` | Deployer (once) | Set epoch duration, per-epoch cap, lifetime cap |
| `emit_rewards` | Anyone (rate-limited) | Mint QTI staking rewards to recipient |
| `update_config` | Squads vault | Adjust rate parameters (cap can only decrease) |
| `pause_emissions` | Squads vault | Emergency halt |
| `resume_emissions` | Squads vault | Restore after governance review |
| `transfer_authority` | Squads vault | Rotate governance to new vault |

---

## Deploy Steps

```bash
# 1. Install dependencies
yarn install

# 2. Build the program
anchor build

# 3. Verify program ID matches Anchor.toml
anchor keys list

# 4. Deploy to mainnet
anchor deploy --provider.cluster mainnet

# 5. Initialize config (run once after deploy)
ts-node scripts/initialize_config.ts

# 6. Verify on-chain
solana program show EMiSCtRL1QTIDeASIInterface111111111111111111
```

---

## PDA Derivations

```
emissions_authority PDA:
  seeds: [b"emissions_authority"]
  program: EMiSCtRL1QTIDeASIInterface111111111111111111

emissions_config PDA:
  seeds: [b"emissions_config", qti_mint.key()]
  program: EMiSCtRL1QTIDeASIInterface111111111111111111
```

---

## On-Chain Events

| Event | Trigger |
|---|---|
| `EmissionsInitialized` | `initialize_config` succeeds |
| `RewardsEmitted` | `emit_rewards` succeeds |
| `ConfigUpdated` | `update_config` succeeds |
| `EmissionsPaused` | `pause_emissions` succeeds |
| `EmissionsResumed` | `resume_emissions` succeeds |
| `AuthorityTransferred` | `transfer_authority` succeeds |

---

*© 2026 Richard Arlie Charles Patterson. All rights reserved under MIT License.*
