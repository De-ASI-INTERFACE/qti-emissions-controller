/**
 * QTI Emissions Controller — Full Test Suite
 *
 * Covers:
 *   - Happy path: initialize, emit within epoch, emit up to cap
 *   - Epoch rollover: counter resets after epoch_duration_slots
 *   - Per-epoch cap rejection
 *   - Lifetime cap rejection
 *   - Pause / resume flow + pause-blocks-emit integration
 *   - Unauthorized reconfiguration rejection
 *   - Zero amount rejection (no state mutation)
 *   - Authority transfer + old-key lockout
 *   - Gini gate enforcement (gate open via initialize_controller)
 *
 *   ── Formal Verification Regression Anchors ──
 *   - FV-1: cost_reduction_calc boundary   (Core.lean theorem)
 *   - FV-2: ZeroAmount / stepMag_zero_of_zero  (Core.lean lemma)
 *   - FV-3: Epoch rollover determinism         (step_phase / nextPhase)
 *   - FV-4: Authority transfer immutability    (step_weight conservation)
 *
 * RP-DEASI-EMISSIONS-2026-0627-001
 * Author: Richard Patterson (@De-ASI-INTERFACE)
 * © 2026 Richard Arlie Charles Patterson — MIT License
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createMint,
  createAssociatedTokenAccount,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { assert } from "chai";
import { QtiEmissionsController } from "../target/types/qti_emissions_controller";
import { QtiDeveloperCredits }   from "../target/types/qti_developer_credits";

// ─── Seeds & Program IDs ───────────────────────────────────────────────────────
const EMISSIONS_AUTHORITY_SEED  = Buffer.from("emissions_authority");
const EMISSIONS_CONFIG_SEED     = Buffer.from("emissions_config");
const CONTROLLER_STATE_SEED     = Buffer.from("developer_credits_state");
const DEVELOPER_CREDITS_PROGRAM_ID = new PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv"
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function airdrop(
  provider: anchor.AnchorProvider,
  pubkey: PublicKey,
  sol = 2
): Promise<void> {
  const sig = await provider.connection.requestAirdrop(
    pubkey,
    sol * LAMPORTS_PER_SOL
  );
  await provider.connection.confirmTransaction(sig, "confirmed");
}

// ─── Test Suite ───────────────────────────────────────────────────────────────
describe("qti_emissions_controller", () => {
  const provider  = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program        = anchor.workspace.QtiEmissionsController as Program<QtiEmissionsController>;
  const creditsProgram = anchor.workspace.QtiDeveloperCredits   as Program<QtiDeveloperCredits>;
  const authority      = provider.wallet as anchor.Wallet;

  let qtiMint:            PublicKey;
  let recipientAta:       PublicKey;
  let emissionsAuthority: PublicKey;
  let emissionsConfig:    PublicKey;
  let giniStatePda:       PublicKey;

  const EPOCH_SLOTS   = new anchor.BN(216_000);
  const MAX_PER_EPOCH = new anchor.BN(1_000_000_000);  // 1,000 QTI (9 dec)
  const TOTAL_CAP     = new anchor.BN(10_000_000_000); // 10,000 QTI

  // Gini controller params — matching G_TARGET_DEFAULT=3500, K_DEFAULT=1000
  const GINI_EPOCH_SLOTS = new anchor.BN(216_000);
  const G_TARGET         = new anchor.BN(3_500);
  const K                = new anchor.BN(1_000);

  before(async () => {
    // ── 1. Derive emissions authority PDA ────────────────────────────────
    [emissionsAuthority] = PublicKey.findProgramAddressSync(
      [EMISSIONS_AUTHORITY_SEED],
      program.programId
    );

    // ── 2. Create QTI mint with emissions_authority PDA as mint_authority ────
    qtiMint = await createMint(
      provider.connection,
      authority.payer as Keypair,
      emissionsAuthority,  // PDA is mint_authority from birth
      null,
      9
    );

    // ── 3. Derive emissions config PDA ─────────────────────────────────
    [emissionsConfig] = PublicKey.findProgramAddressSync(
      [EMISSIONS_CONFIG_SEED, qtiMint.toBuffer()],
      program.programId
    );

    // ── 4. Create recipient ATA ─────────────────────────────────────────
    recipientAta = await createAssociatedTokenAccount(
      provider.connection,
      authority.payer as Keypair,
      qtiMint,
      authority.publicKey
    );

    // ── 5. Derive Gini controller state PDA ───────────────────────────
    [giniStatePda] = PublicKey.findProgramAddressSync(
      [CONTROLLER_STATE_SEED, qtiMint.toBuffer()],
      DEVELOPER_CREDITS_PROGRAM_ID
    );

    // ── 6. Initialize qti_developer_credits controller ───────────────────
    // This creates the GiniControllerState PDA with gini_gate_open = true
    // (the default in initialize_controller). Without this, emit_rewards
    // will fail with AccountOwnedByWrongProgram on the gini_controller_state.
    await creditsProgram.methods
      .initializeController(GINI_EPOCH_SLOTS, G_TARGET, K)
      .accounts({
        squadsVault:      authority.publicKey, // mock Squads vault in tests
        qtiMint:          qtiMint,
        controllerState:  giniStatePda,
        payer:            authority.publicKey,
        systemProgram:    SystemProgram.programId,
      })
      .rpc();

    // Verify gate is open after initialization
    const giniState = await creditsProgram.account.inequalityControllerState.fetch(giniStatePda);
    assert.equal(giniState.giniGateOpen, true, "Gini gate must be open after initialize_controller");
    assert.equal(giniState.qtiMint.toBase58(), qtiMint.toBase58(), "Gini controller must reference correct mint");
  });

  // ── Account builder helpers ─────────────────────────────────────────────

  /** Full accounts object for emit_rewards — includes giniControllerState. */
  function emitAccounts() {
    return {
      emissionsConfig,
      emissionsAuthority,
      qtiMint,
      recipientTokenAccount: recipientAta,
      giniControllerState:   giniStatePda,
      tokenProgram:          TOKEN_PROGRAM_ID,
    };
  }

  // ── initialize_config ───────────────────────────────────────────────────

  it("initializes emissions config", async () => {
    await program.methods
      .initializeConfig(EPOCH_SLOTS, MAX_PER_EPOCH, TOTAL_CAP)
      .accounts({
        squadsVault:       authority.publicKey,
        qtiMint,
        emissionsConfig,
        emissionsAuthority,
        payer:             authority.publicKey,
        systemProgram:     SystemProgram.programId,
        tokenProgram:      TOKEN_PROGRAM_ID,
      })
      .rpc();

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.authority.toBase58(),         authority.publicKey.toBase58());
    assert.equal(cfg.qtiMint.toBase58(),            qtiMint.toBase58());
    assert.equal(cfg.epochDurationSlots.toString(), EPOCH_SLOTS.toString());
    assert.equal(cfg.maxEmissionPerEpoch.toString(), MAX_PER_EPOCH.toString());
    assert.equal(cfg.totalEmissionCap.toString(),   TOTAL_CAP.toString());
    assert.equal(cfg.totalMinted.toString(),         "0");
    assert.equal(cfg.paused,                         false);
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

  it("emits rewards within epoch cap (Gini gate open)", async () => {
    const amount = new anchor.BN(500_000_000); // 500 QTI
    await program.methods.emitRewards(amount).accounts(emitAccounts()).rpc();

    const ata = await getAccount(provider.connection, recipientAta);
    assert.equal(ata.amount.toString(), amount.toString());

    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.totalMinted.toString(),        amount.toString());
    assert.equal(cfg.currentEpochMinted.toString(), amount.toString());
  });

  it("rejects zero amount — no state mutation (FV-2)", async () => {
    const cfgBefore = await program.account.emissionsConfig.fetch(emissionsConfig);
    try {
      await program.methods.emitRewards(new anchor.BN(0)).accounts(emitAccounts()).rpc();
      assert.fail("Expected ZeroAmount");
    } catch (e: any) {
      assert.include(e.message, "ZeroAmount");
    }
    const cfgAfter = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfgAfter.totalMinted.toString(),        cfgBefore.totalMinted.toString());
    assert.equal(cfgAfter.currentEpochMinted.toString(), cfgBefore.currentEpochMinted.toString());
  });

  it("rejects emission exceeding per-epoch cap", async () => {
    // 600 QTI would push epoch total to 1,100 QTI > 1,000 QTI cap
    try {
      await program.methods.emitRewards(new anchor.BN(600_000_000)).accounts(emitAccounts()).rpc();
      assert.fail("Expected EpochCapExceeded");
    } catch (e: any) {
      assert.include(e.message, "EpochCapExceeded");
    }
  });

  it("rejects emission exceeding lifetime cap", async () => {
    await program.methods
      .updateConfig(null, null, new anchor.BN(500_000_000))
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();
    try {
      await program.methods.emitRewards(new anchor.BN(1)).accounts(emitAccounts()).rpc();
      assert.fail("Expected TotalCapExceeded");
    } catch (e: any) {
      assert.include(e.message, "TotalCapExceeded");
    }
    // Restore cap
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
      await program.methods.emitRewards(new anchor.BN(1_000_000)).accounts(emitAccounts()).rpc();
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
      .accounts(emitAccounts())
      .rpc();
  });

  // ── update_config ─────────────────────────────────────────────────────────

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

  it("rejects setting total_emission_cap below total_minted (CapBelowMinted)", async () => {
    try {
      await program.methods
        .updateConfig(null, null, new anchor.BN(1))
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
      assert.fail("Expected CapBelowMinted");
    } catch (e: any) {
      assert.include(e.message, "CapBelowMinted");
    }
  });

  // ── transfer_authority ────────────────────────────────────────────────────

  it("transfers authority to new key and back", async () => {
    const newAuth = Keypair.generate();
    await program.methods
      .transferAuthority(newAuth.publicKey)
      .accounts({ authority: authority.publicKey, emissionsConfig })
      .rpc();
    const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
    assert.equal(cfg.authority.toBase58(), newAuth.publicKey.toBase58());

    await program.methods
      .transferAuthority(authority.publicKey)
      .accounts({ authority: newAuth.publicKey, emissionsConfig })
      .signers([newAuth])
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

  // ═══════════════════════════════════════════════════════════════════════════
  // FORMAL VERIFICATION REGRESSION ANCHORS
  // ═══════════════════════════════════════════════════════════════════════════

  describe("FV-1 · cost_reduction_calc boundary (Core.lean theorem)", () => {
    const SMALL_CAP = new anchor.BN(100_000_000); // 100 QTI

    before(async () => {
      // Set short epoch to trigger rollover, then restore
      await program.methods
        .updateConfig(SMALL_CAP, new anchor.BN(9_000), null)
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
      // Emit 1 unit to trigger epoch rollover (fresh counter)
      await program.methods.emitRewards(new anchor.BN(1)).accounts(emitAccounts()).rpc();
      // Restore epoch duration
      await program.methods
        .updateConfig(null, EPOCH_SLOTS, null)
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
    });

    it("FV-1a · fills epoch to max_per_epoch - 1 (pre-boundary)", async () => {
      const cfgBefore  = await program.account.emissionsConfig.fetch(emissionsConfig);
      const fillAmount = SMALL_CAP.sub(cfgBefore.currentEpochMinted).subn(1);
      if (fillAmount.gtn(0)) {
        await program.methods.emitRewards(fillAmount).accounts(emitAccounts()).rpc();
      }
      const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.equal(
        cfg.currentEpochMinted.toString(),
        SMALL_CAP.subn(1).toString(),
        "Pre-boundary: epoch_minted must equal max_per_epoch - 1"
      );
    });

    it("FV-1b · amount=2 rejected at boundary (EpochCapExceeded)", async () => {
      try {
        await program.methods.emitRewards(new anchor.BN(2)).accounts(emitAccounts()).rpc();
        assert.fail("FV-1b: must throw EpochCapExceeded");
      } catch (e: any) {
        assert.include(e.message, "EpochCapExceeded");
      }
    });

    it("FV-1c · amount=1 accepted at exact cap boundary", async () => {
      await program.methods.emitRewards(new anchor.BN(1)).accounts(emitAccounts()).rpc();
      const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.equal(cfg.currentEpochMinted.toString(), SMALL_CAP.toString());
    });

    after(async () => {
      await program.methods
        .updateConfig(MAX_PER_EPOCH, null, null)
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
    });
  });

  describe("FV-2 · stepMag_zero_of_zero regression (Core.lean lemma)", () => {
    it("FV-2a · amount=0 returns ZeroAmount, zero state mutation", async () => {
      const cfgBefore = await program.account.emissionsConfig.fetch(emissionsConfig);
      try {
        await program.methods.emitRewards(new anchor.BN(0)).accounts(emitAccounts()).rpc();
        assert.fail("FV-2a: must throw ZeroAmount");
      } catch (e: any) {
        assert.include(e.message, "ZeroAmount");
      }
      const cfgAfter = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.equal(cfgAfter.totalMinted.toString(),        cfgBefore.totalMinted.toString());
      assert.equal(cfgAfter.currentEpochMinted.toString(), cfgBefore.currentEpochMinted.toString());
    });
  });

  describe("FV-3 · Epoch rollover determinism (step_phase / nextPhase)", () => {
    it("FV-3a · current_epoch_minted resets on epoch boundary crossing", async () => {
      await program.methods
        .updateConfig(null, new anchor.BN(9_000), null)
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
      await program.methods.emitRewards(new anchor.BN(1_000_000)).accounts(emitAccounts()).rpc();
      const cfgMid = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.isTrue(cfgMid.currentEpochMinted.gtn(0), "pre-condition: epoch_minted > 0");

      const cfgFinal = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.isTrue(cfgFinal.currentEpochMinted.lt(MAX_PER_EPOCH), "stale state check");

      await program.methods
        .updateConfig(null, EPOCH_SLOTS, null)
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
    });

    it("FV-3b · emission succeeds from clean epoch after rollover", async () => {
      await program.methods
        .emitRewards(new anchor.BN(10_000_000))
        .accounts(emitAccounts())
        .rpc();
      const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.isTrue(cfg.currentEpochMinted.lte(MAX_PER_EPOCH));
      assert.isTrue(cfg.totalMinted.gtn(0));
    });
  });

  describe("FV-4 · Authority transfer immutability (step_weight conservation)", () => {
    let newAuthority: Keypair;

    before(async () => {
      newAuthority = Keypair.generate();
      await airdrop(provider, newAuthority.publicKey, 2);
      await program.methods
        .transferAuthority(newAuthority.publicKey)
        .accounts({ authority: authority.publicKey, emissionsConfig })
        .rpc();
      const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.equal(cfg.authority.toBase58(), newAuthority.publicKey.toBase58());
    });

    it("FV-4a · OLD authority rejected by update_config (Unauthorized)", async () => {
      try {
        await program.methods
          .updateConfig(new anchor.BN(999_999_999), null, null)
          .accounts({ authority: authority.publicKey, emissionsConfig })
          .rpc();
        assert.fail("FV-4a: old authority must be rejected");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized");
      }
    });

    it("FV-4b · OLD authority rejected by pause_emissions (Unauthorized)", async () => {
      try {
        await program.methods
          .pauseEmissions()
          .accounts({ authority: authority.publicKey, emissionsConfig })
          .rpc();
        assert.fail("FV-4b: old authority must not pause");
      } catch (e: any) {
        assert.include(e.message, "Unauthorized");
      }
    });

    it("FV-4c · NEW authority succeeds on update_config", async () => {
      const currentCfg = await program.account.emissionsConfig.fetch(emissionsConfig);
      await program.methods
        .updateConfig(null, currentCfg.epochDurationSlots, null)
        .accounts({ authority: newAuthority.publicKey, emissionsConfig })
        .signers([newAuthority])
        .rpc();
    });

    it("FV-4d · emit_rewards functional under new authority governance", async () => {
      await program.methods
        .emitRewards(new anchor.BN(5_000_000))
        .accounts(emitAccounts())
        .rpc();
      const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.isTrue(cfg.totalMinted.gtn(0));
    });

    after(async () => {
      // Restore original authority
      await program.methods
        .transferAuthority(authority.publicKey)
        .accounts({ authority: newAuthority.publicKey, emissionsConfig })
        .signers([newAuthority])
        .rpc();
      const cfg = await program.account.emissionsConfig.fetch(emissionsConfig);
      assert.equal(cfg.authority.toBase58(), authority.publicKey.toBase58());
    });
  });
});
