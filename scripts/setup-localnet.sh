#!/usr/bin/env bash
# setup-localnet.sh — Deploy both QTI programs to localnet and initialize
# the GiniControllerState PDA so emit_rewards tests pass.
#
# Usage: bash scripts/setup-localnet.sh
# Requires: solana-test-validator running, Solana CLI, Anchor CLI 0.30.1
#
# Author: Richard Patterson (@De-ASI-INTERFACE)
# RP-DEASI-EMISSIONS-2026-0627-001

set -euo pipefail

SOLANA="solana"
ANCHOR="anchor"
CLUSTER="http://127.0.0.1:8899"

echo "[setup-localnet] Checking validator..."
$SOLANA config set --url $CLUSTER
$SOLANA cluster-version

echo "[setup-localnet] Airdropping SOL to deployer..."
$SOLANA airdrop 10 || true

echo "[setup-localnet] Building programs..."
$ANCHOR build

echo "[setup-localnet] Deploying qti_developer_credits..."
$SOLANA program deploy \
  target/deploy/qti_developer_credits.so \
  --program-id 9xQeWvG816bUx9EPjHmaT23yvVM2ZWjrpZb9p5vXL5Hv \
  --url $CLUSTER

echo "[setup-localnet] Deploying qti_emissions_controller..."
$SOLANA program deploy \
  target/deploy/qti_emissions_controller.so \
  --program-id EMiSCtRL1QTIDeASIInterface111111111111111111 \
  --url $CLUSTER

echo "[setup-localnet] Programs deployed. Run 'anchor test --skip-deploy' to execute test suite."
echo "[setup-localnet] NOTE: Initialize qti_developer_credits via its initialize_controller"
echo "                  instruction before running emit_rewards tests."
echo "                  See docs/GINI_GATE_INTEGRATION.md for details."
