# QTI Protocol — Bug Bounty Program

**Program Version:** v3.0  
**Spec Reference:** QTI Protocol v3 Specification — Section 7, Validation Gate V3-G4  
**Architect:** Richard Patterson — De-ASI-INTERFACE  
**Program Status:** 🟢 ACTIVE (Testnet Phase)  
**Testnet Window:** 2026-07-09 to 2026-08-08 (30 calendar days)  
**Maintainer Contact:** See `SECURITY.md` for private disclosure channel

---

## Scope

This program covers vulnerabilities discovered in the QTI Emissions Controller programs
deployed on Solana devnet during the V3-G4 public testnet window.

### In-Scope Programs

| Program | Address | Cluster |
|---|---|---|
| `qti_emissions_controller` | `EMiSCtRL1QTIDeASIInterface111111111111111111` | Solana Devnet |
| `qti_developer_credits` | `9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv` | Solana Devnet |
| Squads v4 Vault PDA | _(authority PDA — see `DEPLOY.md` for derivation)_ | Solana Devnet |

> Vault authority is a Squads v4 multisig PDA, not a standalone program.
> Governance interactions route through [app.squads.so](https://app.squads.so).

### In-Scope Vulnerability Categories

- Unauthorized minting or emission schedule bypass
- Squads multi-sig authority bypass or spoofing
- Rate-limit circumvention or underflow/overflow in emission accounting
- Vault fund drainage or unauthorized withdrawal
- Governance proposal manipulation (vote stuffing, quorum bypass)
- CPI reentrancy or account substitution attacks
- PDA derivation collisions or seed manipulation
- Signer privilege escalation

### Out of Scope

- Devnet SOL or token value (no real assets at risk during testnet)
- UI/frontend bugs that do not directly affect on-chain program behavior
- Theoretical attacks with no viable exploit path on Solana
- Issues already documented in open GitHub issues or the CHANGELOG
- Social engineering, phishing, or off-chain attacks
- Spam transactions or network-level DoS (Solana validator-level issues)

---

## Severity Matrix

Severity is assessed on **impact × exploitability** against mainnet-equivalent logic.

| Severity | Definition | Response SLA | Max Reward |
|---|---|---|---|
| 🔴 **Critical** | Direct loss of funds, unauthorized mint, or complete governance takeover | 24 hours | $5,000 USDC |
| 🟠 **High** | Significant protocol disruption, rate-limit bypass, or partial authority escalation | 72 hours | $2,000 USDC |
| 🟡 **Medium** | Logic errors with limited impact, state corruption without fund loss | 7 days | $500 USDC |
| 🟢 **Low** | Minor edge cases, documentation mismatches, non-exploitable anomalies | 14 days | $100 USDC |
| ℹ️ **Informational** | Compute optimizations, style issues, best-practice suggestions | Best effort | Non-monetary recognition |

Reward amounts are denominated in USDC and paid to the reporter's verified Solana wallet
upon mainnet launch, conditional on responsible disclosure and finding verification.
Rewards are discretionary and subject to the duplication and good-faith conditions below.

---

## Submission Process

### Step 1 — Private Disclosure

All findings **must be submitted privately** before any public disclosure. Do not open a
public GitHub issue for a security finding. Use the channel defined in `SECURITY.md`.

Your submission must include:

- **Title:** Short descriptive name of the vulnerability
- **Severity:** Your assessment (Critical / High / Medium / Low)
- **Program:** Which in-scope program is affected
- **Description:** Full technical description of the vulnerability
- **Proof of Concept:** Transaction signatures on devnet demonstrating the issue,
  or a minimal reproducer script (TypeScript/Rust)
- **Impact:** What an attacker could achieve on mainnet
- **Suggested Fix:** Optional but appreciated

### Step 2 — Triage & Acknowledgement

You will receive acknowledgement within the SLA period defined in the severity matrix.
The triage team will confirm receipt, assign a finding ID (`QTI-BB-2026-NNN`), and
begin verification. You will be kept informed of status changes.

### Step 3 — Remediation

For Critical and High findings, a fix will be developed and deployed to the testnet
branch. You will be credited in the fix commit and the V3-G4 gate closure report.
Reporters are invited (but not required) to verify the fix.

### Step 4 — Disclosure

Coordinated public disclosure occurs **after** mainnet launch and after all Critical/High
findings are remediated. Reporters may publish their own write-ups after the coordinated
disclosure date with prior written approval.

---

## Rules of Engagement

To be eligible for a reward, submissions must comply with the following:

- Testing must occur **only on devnet** using the published program addresses above.
- Do not attempt to exploit vulnerabilities against mainnet or any other live protocol.
- Do not access, modify, or exfiltrate data beyond what is necessary to demonstrate
  the vulnerability.
- Do not perform denial-of-service attacks against shared devnet infrastructure.
- Submit findings independently — only the **first reporter** of a unique finding is
  eligible for a reward. Duplicate findings receive recognition but not monetary reward.
- Act in good faith. Researchers found to be acting maliciously forfeit all rewards
  and may be reported to relevant authorities.

---

## Safe Harbor

De-ASI-INTERFACE and the QTI Protocol commit that researchers who comply with this
policy and act in good faith will not face legal action for security research conducted
within the defined scope. This safe harbor does not extend to activities outside the
scope or in violation of the rules of engagement above.

---

## Findings Register

All triaged findings are tracked in the V3-G4 gate closure report at
[`reports/v3-g4-bug-bounty-report.md`](./reports/v3-g4-bug-bounty-report.md).
The findings register is published upon gate closure as evidence for the validation gate.

---

## Recognition

All researchers who submit valid findings (any severity) will be listed in the
V3-G4 gate closure report and credited in the protocol's public audit log.
Critical and High reporters will additionally be named in the mainnet launch announcement.

---

*This document is immutable once the testnet window opens (2026-07-09). Any amendments
are versioned and timestamped in the git history.*

*Accredited to: Richard Patterson — QTI Protocol v3 Architecture*  
*Ref: RP-DEASI-EMISSIONS-2026-0627-001*
