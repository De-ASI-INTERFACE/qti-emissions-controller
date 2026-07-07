# QTI Emissions Controller — Deployment Guide

**Author:** Richard Patterson (@De-ASI-INTERFACE)  
**Ref:** RP-DEASI-EMISSIONS-2026-0627-001  
**Program ID:** `EMiSCtRL1QTIDeASIInterface111111111111111111`

---

## 1. Prerequisites

- Solana CLI `1.18.x` installed and configured
- Anchor CLI `0.30.1` installed (`npm i -g @coral-xyz/anchor-cli@0.30.1`)
- Squads multisig vault created and vault PDA recorded
- Deployer keypair with sufficient SOL for rent + fees

---

## 2. Devnet Deployment

```bash
# Set cluster
solana config set --url devnet

# Build (deterministic)
anchor build

# Record binary checksum before deploy
sha256sum target/deploy/qti_emissions_controller.so

# Deploy
anchor deploy --provider.cluster devnet

# Verify with solana-verify
solana-verify verify-from-repo \
  --url https://github.com/De-ASI-INTERFACE/qti-emissions-controller \
  --program-id EMiSCtRL1QTIDeASIInterface111111111111111111
```

### Post-Deploy Devnet Checks
- [ ] Program ID matches `EMiSCtRL1QTIDeASIInterface111111111111111111`
- [ ] `mint_authority` transferred to `emissions_authority` PDA
- [ ] Squads vault PDA confirmed as `authority` post-initialization
- [ ] `initialize` instruction executed successfully (record tx hash below)
- [ ] Devnet init tx hash: `___________`

---

## 3. Squads Multisig Setup

1. Create a new Squads v4 multisig at [https://app.squads.so](https://app.squads.so)
2. Add all required signers (minimum M-of-N threshold per governance policy)
3. Record the vault PDA:
   ```
   Squads Vault PDA: ___________
   ```
4. During program initialization, pass the vault PDA as the `authority` account
5. Verify on-chain that `emissions_config.authority == vault_pda`
6. Any `update_config`, `pause`, `transfer_authority` calls must be routed through Squads

---

## 4. Mainnet Deployment

> ⚠️ **Do not deploy to mainnet until all V3 validation gates (#3, #4, #5) are closed.**

```bash
solana config set --url mainnet-beta
anchor build
sha256sum target/deploy/qti_emissions_controller.so  # must match devnet checksum
anchor deploy --provider.cluster mainnet-beta
```

### Mainnet Deploy Record
- [ ] Binary checksum verified matches devnet
- [ ] Program ID confirmed on-chain
- [ ] `mint_authority` transfer tx hash: `___________`
- [ ] Squads vault set as authority tx hash: `___________`
- [ ] Mainnet deploy tx hash: `___________`
- [ ] Grafana monitoring dashboards active
- [ ] `RewardsEmitted` alert thresholds configured

---

## 5. Versioned Deployment History

| Version | Network | Date | Deploy Tx Hash | Notes |
|---------|---------|------|----------------|-------|
| v1.0.0  | devnet  | TBD  | —              | Initial devnet deploy |
| v1.0.0  | mainnet | TBD  | —              | Pending V3 gate closure |
