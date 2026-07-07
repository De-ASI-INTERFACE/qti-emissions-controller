# Changelog — QTI Emissions Controller

**Author:** Richard Patterson (@De-ASI-INTERFACE)  
**Ref:** RP-DEASI-EMISSIONS-2026-0627-001

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- GitHub Actions CI workflow: `anchor build`, `anchor test`, `cargo clippy`, `cargo fmt` checks
- Secret scanning via Gitleaks on all pushes and PRs
- `DEPLOY.md`: Squads multisig setup, devnet verification, mainnet deploy checklist
- `CHANGELOG.md`: versioned deployment and change history
- Pinned `anchor-lang` and `anchor-spl` to exact version `=0.30.1` for deterministic builds

### Pending (open validation gates)
- [ ] V3-G3: Emissions controller integration tests with `solana-defi-protocol-core`
- [ ] V3-G4: 30-day public testnet + bug bounty
- [ ] V3-G8: First monthly NAV report

---

## [1.0.0] — 2026-06-27

### Added
- Initial Anchor program: `qti_emissions_controller`
- `initialize` instruction with Squads-gated authority
- `emit_rewards` with rate limiting and epoch-based caps
- `update_config` with governance-only access control
- `pause` / `unpause` emergency controls
- `transfer_authority` for multisig handoff
- SPL token minting via `anchor-spl`
- `qti_developer_credits` program
