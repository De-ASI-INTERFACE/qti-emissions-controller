# Security Policy

**Project:** QTI Emissions Controller
**Org:** [De-ASI-INTERFACE](https://github.com/De-ASI-INTERFACE)
**Identifier:** RP-DEASI-EMISSIONS-2026-0627-001

## Security Architecture

This program is designed with defense-in-depth:

- `emissions_authority` is a PDA — no private key exists; only this program can sign mint CPIs
- `mint_authority` on the QTI SPL mint is validated on **every** `emit_rewards` call
- All emission accounting uses `checked_add` — integer overflow is impossible
- Per-epoch and lifetime caps are enforced independently
- Emergency pause controlled exclusively by the Squads vault (2-of-3 multisig)
- Authority transfer is permissioned and emits an on-chain event
- `total_emission_cap` can only be reduced, never increased via `update_config`

## Supported Versions

| Version | Supported |
|---------|----------|
| 1.0.x   | ✅        |

## Reporting a Vulnerability

Do **not** open a public GitHub issue for security vulnerabilities.

Report privately to: **security@de-asi-interface.xyz** (or via GitHub private advisory)

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Suggested fix (if available)

We commit to acknowledging reports within **48 hours** and resolving critical issues within **7 days**.

## Audit Status

See [AUDIT_REPORT.md](https://github.com/De-ASI-INTERFACE/De-ASI-INTERFACE/blob/main/AUDIT_REPORT.md) in the org base repo.
