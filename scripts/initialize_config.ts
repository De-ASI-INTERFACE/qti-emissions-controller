/**
 * initialize_config.ts
 *
 * Submits the one-time EmissionsConfig initialization via Squads vault transaction.
 * Run AFTER:
 *   1. Program deployed to mainnet
 *   2. QTI mint_authority transferred to emissions_authority PDA
 *
 * Usage: ANCHOR_PROVIDER_URL=https://api.mainnet-beta.solana.com \
 *        ANCHOR_WALLET=~/.config/solana/id.json \
 *        yarn ts-node scripts/initialize_config.ts
 *
 * RP-DEASI-EMISSIONS-2026-0627-001
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID   = new PublicKey("EMiSCtRL1QTIDeASIInterface111111111111111111");
const QTI_MINT     = new PublicKey(process.env.QTI_MINT    ?? "");
const SQUADS_VAULT = new PublicKey(process.env.SQUADS_VAULT ?? "");

// Emission schedule — adjust to final tokenomics before mainnet
const EPOCH_DURATION_SLOTS   = new anchor.BN(216_000);           // ~1 day
const MAX_EMISSION_PER_EPOCH = new anchor.BN(
  Number(process.env.MAX_PER_EPOCH ?? 100_000) * 1e9
);
const TOTAL_EMISSION_CAP     = new anchor.BN(
  Number(process.env.TOTAL_CAP ?? 200_000_000) * 1e9
);

async function main() {
  if (!process.env.QTI_MINT || !process.env.SQUADS_VAULT) {
    throw new Error("QTI_MINT and SQUADS_VAULT env vars required");
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.QtiEmissionsController;

  const [emissionsAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("emissions_authority")], PROGRAM_ID
  );
  const [emissionsConfig] = PublicKey.findProgramAddressSync(
    [Buffer.from("emissions_config"), QTI_MINT.toBuffer()], PROGRAM_ID
  );

  console.log("=== QTI Emissions Controller — initialize_config ===");
  console.log("Program ID:          ", PROGRAM_ID.toBase58());
  console.log("QTI Mint:            ", QTI_MINT.toBase58());
  console.log("Squads Vault:        ", SQUADS_VAULT.toBase58());
  console.log("emissions_authority: ", emissionsAuthority.toBase58());
  console.log("emissions_config:    ", emissionsConfig.toBase58());
  console.log("epoch_duration_slots:", EPOCH_DURATION_SLOTS.toString());
  console.log("max_per_epoch:       ", MAX_EMISSION_PER_EPOCH.toString());
  console.log("total_cap:           ", TOTAL_EMISSION_CAP.toString());
  console.log("");

  const tx = await program.methods
    .initializeConfig(
      EPOCH_DURATION_SLOTS,
      MAX_EMISSION_PER_EPOCH,
      TOTAL_EMISSION_CAP
    )
    .accounts({
      squadsVault:       SQUADS_VAULT,
      qtiMint:           QTI_MINT,
      emissionsConfig,
      emissionsAuthority,
      payer:             provider.wallet.publicKey,
      systemProgram:     SystemProgram.programId,
      tokenProgram:      TOKEN_PROGRAM_ID,
    })
    .rpc({ commitment: "confirmed" });

  console.log("✅ EmissionsConfig initialized.");
  console.log("Tx signature:", tx);
  console.log("Solana Explorer:", `https://explorer.solana.com/tx/${tx}`);
  console.log("");
  console.log("ACTION REQUIRED: Commit this tx signature to:");
  console.log("  docs/MULTISIG_MIGRATION.md in De-ASI-INTERFACE/QTI-token");
}

main().catch((e) => { console.error(e); process.exit(1); });
