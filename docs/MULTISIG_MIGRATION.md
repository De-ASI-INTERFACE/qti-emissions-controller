# QTI Multisig Authority Migration Log

**Program:** QTI Emissions Controller
**Identifier:** RP-DEASI-EMISSIONS-2026-0627-001
**Author:** Richard Patterson (@De-ASI-INTERFACE)
**Date Initiated:** 2026-06-27

---

## Pre-Migration Authority State

> Fill in after running `spl-token display <QTI_MINT>` and `metaboss decode mint`

| Authority Type | Current Holder | Key |
|---|---|---|
| mint_authority | Hot wallet | `<HOT_WALLET_PUBKEY>` |
| freeze_authority | Hot wallet | `<HOT_WALLET_PUBKEY>` |
| Metaplex update_authority | Hot wallet | `<HOT_WALLET_PUBKEY>` |

---

## Squads Vault Deployment

| Field | Value |
|---|---|
| Squads Vault PDA | `<SQUADS_VAULT_PDA>` |
| Threshold | 2-of-3 |
| Deployment Tx | `<TX_SIGNATURE>` |
| Explorer | `https://explorer.solana.com/tx/<TX_SIGNATURE>` |

---

## Emissions Controller Deployment

| Field | Value |
|---|---|
| Program ID | `EMiSCtRL1QTIDeASIInterface111111111111111111` |
| emissions_authority PDA | `<EMISSIONS_AUTHORITY_PDA>` |
| Deploy Tx | `<TX_SIGNATURE>` |
| Verify Tx | `<SOLANA_VERIFY_OUTPUT>` |

---

## Authority Transfer Transactions

| Transfer | From | To | Tx Signature |
|---|---|---|---|
| mint_authority | Hot wallet | emissions_authority PDA | `<TX>` |
| freeze_authority | Hot wallet | Squads vault PDA | `<TX>` |
| Metaplex update_authority | Hot wallet | Squads vault PDA | `<TX>` |

---

## initialize_config Transaction

| Field | Value |
|---|---|
| Tx Signature | `<TX>` |
| epoch_duration_slots | 216000 |
| max_emission_per_epoch | `<VALUE>` |
| total_emission_cap | `<VALUE>` |
| Explorer | `https://explorer.solana.com/tx/<TX>` |

---

## Post-Migration Verification

```bash
# Confirm all authorities
spl-token display <QTI_MINT>
metaboss decode mint --account <QTI_MINT> --full

# Confirm hot wallet CANNOT mint (must fail)
spl-token mint <QTI_MINT> 1 <ANY_ATA> --mint-authority ~/.config/solana/id.json
# Expected: Error: Incorrect authority
```

> Paste terminal output here after verification.

---

## Hot Wallet Revocation Confirmation

- [ ] mint_authority revoked from hot wallet
- [ ] freeze_authority transferred to Squads vault
- [ ] Metaplex update_authority transferred to Squads vault
- [ ] EmissionsConfig initialized on-chain
- [ ] Post-migration verification commands run and output committed
- [ ] This document committed to QTI-token repo
