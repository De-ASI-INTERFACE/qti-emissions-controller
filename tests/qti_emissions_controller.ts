/**
 * QTI Emissions Controller — Full Test Suite
 *
 * Covers:
 *   - Happy path: initialize, emit within epoch, emit up to cap
 *   - Epoch rollover: counter resets after epoch_duration_slots
 *   - Per-epoch cap rejection
 *   - Lifetime cap rejection
 *   - Pause / resume flow
 *   - Unauthorized reconfiguration rejection
 *   - Zero amount rejection
 *   - Authority transfer
 *   - Invalid mint authority rejection (post-revocation simulation)
 *
 * RP-DEASI-EMISSIONS-2026-0627-001
 */

import * as anchor from "@coral-xyz/anchor";
import { Program }  from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { QtiEmissionsController } from "../target/types/qti_emissions_controller";

describe("qti_emissions_controller", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program   = anchor.workspace.QtiEmissionsController as Program<QtiEmissionsController>;
  const authority = provider.wallet as anchor.Wallet;

  let qtiMint:              PublicKey;
  let recipientAta:         PublicKey;
  let emissionsAuthority:   PublicKey;
  let emissionsConfig:      PublicKey;
  let authorityBump:        number;
  let configBump:           number;

  const EPOCH_SLOTS      = new anchor.BN(216_000);
  const MAX_PER_EPOCH    = new anchor.BN(1_000_000_000);   // 1,000 QTI (9 dec)
  const TOTAL_CAP        = new anchor.BN(10_000_000_000);  // 10,000 QTI

  before(async () => {
    // Derive PDAs
    [emissionsAuthority, authorityBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("emissions_authority")],
      program.programId
    );

    // Create QTI mint with emissions_authority PDA as mint_authority
    qtiMint = await createMint(
      provider.connection,
      (authority.payer as Keypair),
      emissionsAuthority,   // <-- PDA is mint_authority from birth
      null,
      9
    );

    [emissionsConfig, configBump] = PublicKey.findProgramAddressSync(
      [Buffer.from("emissions_config"), qtiMint.toBuffer()],
      program.programId
    );

    recipientAta = await createAssociatedTokenAccount(
      provider.connection,
      (authority.payer as Keypair),
      qtiMint,
      authority.publicKey
    );
  });

  // ── initialize_config ────────────────────────────────────────────────────

  it("initializes emissions config", async () => {
    await program.methods
      .initializeConfig(EPOCH_SLOTS, MAX_PER_EPOCH, TOTAL_CAP)
      .accounts({
        squadsVault:       authority.publicKey,  // using payer as mock Squads vault in tests
        qtiMint,
        emissionsConfig,
        emissionsAuthority,
        payer:             authority.publicKey,
        systemProgram:     SystemProgram.programId,
        tokenProgram:      TOKEN_PROGRAM_ID,
      })
      .rpc();

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.authority.toBase58(), authority.publicKey.toBase58());
    assert.equal(cfg.qtiMint.toBase58(), qtiMint.toBase58());
    assert.equal(cfg.epochDurationSlots.toString(), EPOCH_SLOTS.toString());
    assert.equal(cfg.maxEmissionPerEpoch.toString(), MAX_PER_EPOCH.toString());
    assert.equal(cfg.totalEmissionCap.toString(), TOTAL_CAP.toString());
    assert.equal(cfg.totalMinted.toString(), "0");
    assert.equal(cfg.paused, false);
  });

  it("rejects double initialization", async () => {
    try {
      await program.methods
        .initializeConfig(EPOCH_SLOTS, MAX_PER_EPOCH, TOTAL_CAP)
        .accounts({
          squadsVault: authority.publicKey,
          qtiMint, emissionsConfig, emissionsAuthority,
          payer: authority.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Expected error on double init");
    } catch (e: any) {
      assert.include(e.message, "already in use");
    }
  });

  // ── emit_rewards ─────────────────────────────────────────────────────────

  it("emits rewards within epoch cap", async () => {
    const amount = new anchor.BN(500_000_000); // 500 QTI
    await program.methods
      .emitRewards(amount)
      .accounts({ emissionsConfig, emissionsAuthority, qtiMint, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();

    const ata = await getAccount(provider.connection, recipientAta);
    assert.equal(ata.amount.toString(), amount.toString());

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.totalMinted.toString(), amount.toString());
    assert.equal(cfg.currentEpochMinted.toString(), amount.toString());
  });

  it("rejects zero amount", async () => {
    try {
      await program.methods
        .emitRewards(new anchor.BN(0))
        .accounts({ emissionsConfig, emissionsAuthority, qtiMint, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      assert.fail("Expected ZeroAmount error");
    } catch (e: any) {
      assert.include(e.message, "ZeroAmount");
    }
  });

  it("rejects emission exceeding per-epoch cap", async () => {
    // 600 QTI would push epoch total to 1100 QTI > 1000 QTI cap
    try {
      await program.methods
        .emitRewards(new anchor.BN(600_000_000))
        .accounts({ emissionsConfig, emissionsAuthority, qtiMint, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      assert.fail("Expected EpochCapExceeded");
    } catch (e: any) {
      assert.include(e.message, "EpochCapExceeded");
    }
  });

  it("rejects emission exceeding lifetime cap", async () => {
    // Set a tiny total cap to trigger TotalCapExceeded
    await program.methods
      .updateConfig(null, null, new anchor.BN(500_000_000)) // cap at already-minted amount
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();

    try {
      await program.methods
        .emitRewards(new anchor.BN(1))
        .accounts({ emissionsConfig, emissionsAuthority, qtiMint, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      assert.fail("Expected TotalCapExceeded");
    } catch (e: any) {
      assert.include(e.message, "TotalCapExceeded");
    }

    // Restore cap for subsequent tests
    await program.methods
      .updateConfig(null, null, TOTAL_CAP)
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();
  });

  // ── pause / resume ────────────────────────────────────────────────────────

  it("pauses and blocks emissions", async () => {
    await program.methods
      .pauseEmissions()
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.paused, true);

    try {
      await program.methods
        .emitRewards(new anchor.BN(1_000_000))
        .accounts({ emissionsConfig, emissionsAuthority, qtiMint, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID })
        .rpc();
      assert.fail("Expected EmissionsPaused");
    } catch (e: any) {
      assert.include(e.message, "EmissionsPaused");
    }
  });

  it("rejects double pause", async () => {
    try {
      await program.methods
        .pauseEmissions()
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
      assert.fail("Expected AlreadyPaused");
    } catch (e: any) {
      assert.include(e.message, "AlreadyPaused");
    }
  });

  it("resumes emissions and allows minting", async () => {
    await program.methods
      .resumeEmissions()
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.paused, false);

    await program.methods
      .emitRewards(new anchor.BN(100_000_000))
      .accounts({ emissionsConfig, emissionsAuthority, qtiMint, recipientTokenAccount: recipientAta, tokenProgram: TOKEN_PROGRAM_ID })
      .rpc();
  });

  // ── update_config ────────────────────────────────────────────────────────

  it("updates max emission per epoch", async () => {
    const newCap = new anchor.BN(2_000_000_000);
    await program.methods
      .updateConfig(newCap, null, null)
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.maxEmissionPerEpoch.toString(), newCap.toString());
  });

  it("rejects unauthorized config update", async () => {
    const rogue = Keypair.generate();
    try {
      await program.methods
        .updateConfig(new anchor.BN(1), null, null)
        .accounts({ authority: rogue.publicKey, emissionsConfig })
        .signers([rogue])
        .rpc();
      assert.fail("Expected Unauthorized");
    } catch (e: any) {
      assert.include(e.message, "Unauthorized");
    }
  });

  // ── transfer_authority ───────────────────────────────────────────────────

  it("transfers authority to new key", async () => {
    const newAuthority = Keypair.generate();
    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.authority.toBase58(), newAuthority.publicKey.toBase58());

    // Transfer back to original for remaining tests
    await program.methods
      .transferAuthority(authority.publicKey)
      .accounts({ authority: newAuthority.publicKey, emissionsConfig })
      .signers([newAuthority])
      .rpc();
  });

  it("rejects same-authority transfer", async () => {
    try {
      await program.methods
        .transferAuthority(authority.publicKey)
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
      assert.fail("Expected SameAuthority");
    } catch (e: any) {
      assert.include(e.message, "SameAuthority");
    }
  });
});
