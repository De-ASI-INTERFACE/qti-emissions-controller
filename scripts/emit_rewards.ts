/**
 * emit_rewards.ts
 *
 * Operational script for cranking staking reward distributions.
 * Validates epoch cap and lifetime cap before submitting.
 *
 * Usage: QTI_MINT=<mint> RECIPIENT_ATA=<ata> AMOUNT_QTI=<amount> \
 *        yarn ts-node scripts/emit_rewards.ts
 *
 * RP-DEASI-EMISSIONS-2026-0627-001
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const PROGRAM_ID    = new PublicKey("EMiSCtRL1QTIDeASIInterface111111111111111111");
const QTI_MINT      = new PublicKey(process.env.QTI_MINT       ?? "");
const RECIPIENT_ATA = new PublicKey(process.env.RECIPIENT_ATA  ?? "");
const AMOUNT_RAW    = new anchor.BN(
  Number(process.env.AMOUNT_QTI ?? 0) * 1e9
);

async function main() {
  if (!process.env.QTI_MINT || !process.env.RECIPIENT_ATA || !process.env.AMOUNT_QTI) {
    throw new Error("QTI_MINT, RECIPIENT_ATA, and AMOUNT_QTI env vars required");
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

  // Pre-flight: fetch config and validate caps client-side before submitting
  const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
  if (cfg.paused) throw new Error("Emissions are paused — consult governance");

  const projectedEpoch = cfg.currentEpochMinted.add(AMOUNT_RAW);
  if (projectedEpoch.gt(cfg.maxEmissionPerEpoch)) {
    throw new Error(
      `Would exceed epoch cap. Remaining: ${cfg.maxEmissionPerEpoch.sub(cfg.currentEpochMinted).toString()} raw units`
    );
  }
  const projectedTotal = cfg.totalMinted.add(AMOUNT_RAW);
  if (projectedTotal.gt(cfg.totalEmissionCap)) {
    throw new Error("Would exceed lifetime cap — staking rewards exhausted");
  }

  console.log("Emitting", AMOUNT_RAW.toString(), "raw QTI to", RECIPIENT_ATA.toBase58());

  const tx = await program.methods
    .emitRewards(AMOUNT_RAW)
    .accounts({
      emissionsConfig,
      emissionsAuthority,
      qtiMint:               QTI_MINT,
      recipientTokenAccount: RECIPIENT_ATA,
      tokenProgram:          TOKEN_PROGRAM_ID,
    })
    .rpc({ commitment: "confirmed" });

  console.log("✅ Rewards emitted. Tx:", tx);
  console.log("Explorer:", `https://explorer.solana.com/tx/${tx}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
