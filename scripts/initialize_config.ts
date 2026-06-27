/**
 * QTI Emissions Controller — Initialize Config Script
 *
 * Author: Richard Arlie Charles Patterson
 * Copyright: © 2026 Richard Arlie Charles Patterson
 * Identifier: RP-DEASI-EMISSIONS-2026-0627-001
 *
 * Run ONCE after anchor deploy to mainnet.
 * Transfers mint_authority to emissions_authority PDA first,
 * then calls initialize_config.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
} from "@solana/spl-token";
import { QtiEmissionsController } from "../target/types/qti_emissions_controller";

// ── Config ──────────────────────────────────────────────────────────────────
const PROGRAM_ID   = new PublicKey("EMiSCtRL1QTIDeASIInterface111111111111111111");
const QTI_MINT     = new PublicKey(process.env.QTI_MINT!);
const SQUADS_VAULT = new PublicKey(process.env.SQUADS_VAULT!);

// Emission parameters (adjust before deploy)
const EPOCH_DURATION_SLOTS   = BigInt(216_000);   // ~24 hours at 2.5 slots/sec
const MAX_EMISSION_PER_EPOCH = BigInt(100_000_000_000); // 100,000 QTI (6 decimals)
const TOTAL_EMISSION_CAP     = BigInt(1_000_000_000_000_000); // 1B QTI lifetime

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .QtiEmissionsController as Program<QtiEmissionsController>;

  // Derive PDAs
  const [emissionsAuthority, authorityBump] =
    PublicKey.findProgramAddressSync(
      [Buffer.from("emissions_authority")],
      PROGRAM_ID
    );

  const [emissionsConfig, configBump] =
    PublicKey.findProgramAddressSync(
      [Buffer.from("emissions_config"), QTI_MINT.toBuffer()],
      PROGRAM_ID
    );

  console.log("emissions_authority PDA:", emissionsAuthority.toBase58());
  console.log("emissions_config PDA:   ", emissionsConfig.toBase58());
  console.log("Authority bump:         ", authorityBump);
  console.log("Config bump:            ", configBump);

  // Step 1: Transfer mint_authority to emissions_authority PDA
  console.log("\nStep 1: Transferring mint_authority to emissions_authority PDA...");
  const setAuthIx = createSetAuthorityInstruction(
    QTI_MINT,
    provider.wallet.publicKey,
    AuthorityType.MintTokens,
    emissionsAuthority,
    [],
    TOKEN_PROGRAM_ID
  );
  const tx1 = new anchor.web3.Transaction().add(setAuthIx);
  const sig1 = await provider.sendAndConfirm(tx1);
  console.log("mint_authority transferred. Tx:", sig1);

  // Step 2: Initialize config
  console.log("\nStep 2: Initializing emissions config...");
  const sig2 = await program.methods
    .initializeConfig(
      new anchor.BN(EPOCH_DURATION_SLOTS.toString()),
      new anchor.BN(MAX_EMISSION_PER_EPOCH.toString()),
      new anchor.BN(TOTAL_EMISSION_CAP.toString())
    )
    .accounts({
      squadsVault:      SQUADS_VAULT,
      qtiMint:          QTI_MINT,
      emissionsConfig,
      emissionsAuthority,
      payer:            provider.wallet.publicKey,
      systemProgram:    SystemProgram.programId,
      tokenProgram:     TOKEN_PROGRAM_ID,
    })
    .rpc();

  console.log("EmissionsConfig initialized. Tx:", sig2);
  console.log("\n✅ QTI Emissions Controller anchored and live on mainnet.");
  console.log("   Program:   ", PROGRAM_ID.toBase58());
  console.log("   Mint:      ", QTI_MINT.toBase58());
  console.log("   Authority: ", SQUADS_VAULT.toBase58());
  console.log("   Identifier: RP-DEASI-EMISSIONS-2026-0627-001");
  console.log("   Author:     Richard Arlie Charles Patterson");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
