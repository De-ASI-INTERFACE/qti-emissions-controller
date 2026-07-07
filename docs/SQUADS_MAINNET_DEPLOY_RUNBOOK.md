# Squads Vault Mainnet Deploy Runbook

**Ref:** RP-DEASI-NAV-SQUADS-2026-0707-001
**Author:** Richard Patterson (@De-ASI-INTERFACE)
**Date:** 2026-07-07
**Status:** 🔄 Ready to execute — awaiting V3 gate closure

> ⚠️ **MAINNET — IRREVERSIBLE ACTIONS.**
> Complete every step in order. Do not skip verification commands.
> Once `set-upgrade-authority` is called, only the Squads vault can
> authorize future program upgrades. There is no undo.

---

## Pre-Flight Checklist

Confirm ALL of the following before proceeding:

- [ ] V3-G1: Anchor build passes ✅
- [ ] V3-G2: All 22 tests pass ✅
- [ ] V3-G3: Anchor build & test unblocked ✅
- [ ] V3-G4: Devnet deploy verified (binary checksum matches)
- [ ] V3-G5: Security audit / formal verification review complete
- [ ] V3-G6: Gini gate integration verified ✅
- [ ] V3-G8: Monthly NAV report published ✅
- [ ] Deployer keypair: `CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my` funded (≥10 SOL on mainnet)
- [ ] Both `.so` binaries built deterministically and checksums recorded
- [ ] At least 2-of-3 Squads signers online and ready to approve

---

## Phase 1 — Verify Current Upgrade Authority (Pre-Migration)

```bash
# Confirm current upgrade authority for both programs
solana program show EMiSCtRL1QTIDeASIInterface111111111111111111 \
  --url mainnet-beta

solana program show 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv \
  --url mainnet-beta
```

**Expected output (pre-migration):**
```
Upgrade Authority: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my
```

Record the current upgrade authority and verify it matches your deployer keypair.
Paste output here before proceeding:
```
# qti_emissions_controller show output:
<PASTE HERE>

# qti_developer_credits show output:
<PASTE HERE>
```

---

## Phase 2 — Deploy Both Programs to Mainnet

```bash
# 1. Set cluster to mainnet-beta
solana config set --url mainnet-beta
solana config set --keypair ~/.config/solana/deasi-deployer.json

# 2. Confirm deployer identity and balance
solana address
# Expected: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my

solana balance
# Must be >= 10 SOL before proceeding

# 3. Build programs deterministically
anchor build

# 4. Record binary checksums (must match devnet/CI checksums)
sha256sum target/deploy/qti_emissions_controller.so
sha256sum target/deploy/qti_developer_credits.so
# Paste checksums here:
# qti_emissions_controller.so: <SHA256>
# qti_developer_credits.so:    <SHA256>

# 5. Deploy qti_developer_credits FIRST (emissions controller depends on it)
anchor deploy \
  --program-name qti_developer_credits \
  --program-keypair target/deploy/qti_developer_credits-keypair.json \
  --provider.cluster mainnet-beta
# Record deploy tx:
# qti_developer_credits deploy tx: <TX_SIGNATURE>

# 6. Deploy qti_emissions_controller
anchor deploy \
  --program-name qti_emissions_controller \
  --program-keypair target/deploy/qti_emissions_controller-keypair.json \
  --provider.cluster mainnet-beta
# Record deploy tx:
# qti_emissions_controller deploy tx: <TX_SIGNATURE>

# 7. Verify both programs are on-chain
solana program show EMiSCtRL1QTIDeASIInterface111111111111111111 --url mainnet-beta
solana program show 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv --url mainnet-beta
```

---

## Phase 3 — Create Squads Vault on Mainnet

```bash
# Option A: Via Squads web UI (recommended for first-time setup)
# 1. Go to https://app.squads.so
# 2. Connect wallet: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my
# 3. Create new multisig:
#      Threshold: 2-of-3
#      Members: [signer-1-pubkey, signer-2-pubkey, signer-3-pubkey]
# 4. Record Squads vault PDA:
SQUADS_VAULT_PDA="<PASTE_VAULT_PDA_HERE>"

# Option B: Via Squads CLI
npm install -g @sqds-network/squads-cli
squads-cli multisig create \
  --threshold 2 \
  --members <SIGNER_1>,<SIGNER_2>,<SIGNER_3> \
  --url mainnet-beta
# Record vault PDA from output above

# Verify vault is on-chain
solana account $SQUADS_VAULT_PDA --url mainnet-beta
```

**Record vault PDA here:**
```
Squads Vault PDA: <FILL IN AFTER CREATION>
```

---

## Phase 4 — set-upgrade-authority for Both Programs

> This is the critical irreversible step. After this, only 2-of-3 Squads
> signers can authorize program upgrades. Execute only after vault is confirmed.

```bash
# Confirm vault PDA is set
echo "Squads Vault PDA: $SQUADS_VAULT_PDA"
# Must not be empty

# --- qti_emissions_controller ---
solana program set-upgrade-authority \
  EMiSCtRL1QTIDeASIInterface111111111111111111 \
  --new-upgrade-authority $SQUADS_VAULT_PDA \
  --keypair ~/.config/solana/deasi-deployer.json \
  --url mainnet-beta

# Verify immediately
solana program show EMiSCtRL1QTIDeASIInterface111111111111111111 --url mainnet-beta
# Expected: Upgrade Authority: <SQUADS_VAULT_PDA>
# Record tx signature:
# emissions_controller set-upgrade-authority tx: <TX_SIGNATURE>

# --- qti_developer_credits ---
solana program set-upgrade-authority \
  9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv \
  --new-upgrade-authority $SQUADS_VAULT_PDA \
  --keypair ~/.config/solana/deasi-deployer.json \
  --url mainnet-beta

# Verify immediately
solana program show 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv --url mainnet-beta
# Expected: Upgrade Authority: <SQUADS_VAULT_PDA>
# Record tx signature:
# developer_credits set-upgrade-authority tx: <TX_SIGNATURE>
```

---

## Phase 5 — Initialize Both Programs via Squads

All init transactions must be submitted as Squads multisig proposals and approved by 2-of-3 signers.

```bash
# --- Step 5a: Initialize qti_developer_credits controller ---
# Submit via Squads UI or CLI as a multisig proposal:
anchor run initialize-controller \
  --provider.cluster mainnet-beta
# Proposal params:
#   squads_vault:          $SQUADS_VAULT_PDA
#   qti_mint:              <QTI_MINT_ADDRESS>
#   epoch_duration_slots:  216000
#   g_target:              3500
#   k:                     1000
# Record tx:
# initialize_controller tx: <TX_SIGNATURE>

# --- Step 5b: Initialize qti_emissions_controller config ---
# Submit via Squads UI as a multisig proposal:
anchor run initialize-config \
  --provider.cluster mainnet-beta
# Proposal params:
#   squads_vault:           $SQUADS_VAULT_PDA
#   qti_mint:               <QTI_MINT_ADDRESS>
#   epoch_duration_slots:   216000
#   max_emission_per_epoch: 1000000000   (1,000 QTI)
#   total_emission_cap:     10000000000  (10,000 QTI)
# Record tx:
# initialize_config tx: <TX_SIGNATURE>
```

---

## Phase 6 — Post-Migration Verification

```bash
# 1. Confirm upgrade authorities are Squads vault (NOT deployer)
solana program show EMiSCtRL1QTIDeASIInterface111111111111111111 --url mainnet-beta
solana program show 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv --url mainnet-beta
# Both must show: Upgrade Authority: $SQUADS_VAULT_PDA

# 2. Confirm emissions config authority = Squads vault
anchor account qti_emissions_controller.EmissionsConfig \
  <EMISSIONS_CONFIG_PDA> --provider.cluster mainnet-beta
# Must show: authority: $SQUADS_VAULT_PDA

# 3. Confirm inequality controller authority = Squads vault
anchor account qti_developer_credits.InequalityControllerState \
  <CONTROLLER_STATE_PDA> --provider.cluster mainnet-beta
# Must show: authority: $SQUADS_VAULT_PDA

# 4. Confirm Gini gate is open post-init
# Must show: gini_gate_open: true

# 5. Confirm deployer hot wallet CANNOT call update_config (must fail)
anchor methods qti_emissions_controller update-config \
  --args '{ "new_max_emission": 1, "new_epoch_duration": null, "new_total_cap": null }' \
  --accounts '{"authority": "CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my", "emissionsConfig": "<PDA>"}' \
  --provider.cluster mainnet-beta
# Expected: Error: Unauthorized

# 6. Confirm deployer hot wallet CANNOT set-upgrade-authority again
solana program set-upgrade-authority \
  EMiSCtRL1QTIDeASIInterface111111111111111111 \
  --new-upgrade-authority CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my \
  --keypair ~/.config/solana/deasi-deployer.json \
  --url mainnet-beta
# Expected: Error: incorrect authority provided
```

---

## Phase 7 — Update MULTISIG_MIGRATION.md & DEPLOY.md

After all verifications pass, commit the filled-in migration log:

```bash
# Paste all tx signatures and terminal outputs into:
#   docs/MULTISIG_MIGRATION.md  — authority transfer table
#   DEPLOY.md                   — mainnet deploy record section

git add docs/MULTISIG_MIGRATION.md DEPLOY.md
git commit -m "ops: complete mainnet Squads migration — upgrade authority transferred to vault [RP-DEASI-NAV-SQUADS-2026-0707-001]"
git push origin main
```

---

## Transaction Record (Fill In During Execution)

| Step | Action | Tx Signature | Explorer Link |
|---|---|---|---|
| 2.5 | Deploy `qti_developer_credits` | | `https://explorer.solana.com/tx/<TX>` |
| 2.6 | Deploy `qti_emissions_controller` | | `https://explorer.solana.com/tx/<TX>` |
| 3 | Create Squads vault | | `https://explorer.solana.com/tx/<TX>` |
| 4a | `set-upgrade-authority` — emissions controller | | `https://explorer.solana.com/tx/<TX>` |
| 4b | `set-upgrade-authority` — developer credits | | `https://explorer.solana.com/tx/<TX>` |
| 5a | `initialize_controller` (Squads proposal) | | `https://explorer.solana.com/tx/<TX>` |
| 5b | `initialize_config` (Squads proposal) | | `https://explorer.solana.com/tx/<TX>` |

---

## Emergency Contacts & Rollback

> There is **no rollback** for `set-upgrade-authority` once executed.
> If the wrong vault PDA is used, the program is permanently locked to that key.
>
> **Triple-check `$SQUADS_VAULT_PDA` before Phase 4.**

If the Squads vault is lost or all signers are compromised:
- Solana Foundation emergency contact: https://solana.com/security
- Squads Protocol support: https://docs.squads.so

---

*RP-DEASI-NAV-SQUADS-2026-0707-001*
*Author: Richard Arlie Charles Patterson (@De-ASI-INTERFACE)*
*© 2026 — MIT License*
