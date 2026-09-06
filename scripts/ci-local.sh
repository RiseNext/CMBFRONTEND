#!/usr/bin/env bash
#
# RUN THE CI PIPELINE LOCALLY — CMBFRONTEND.
#
#     bash scripts/ci-local.sh
#
# The same commands as `.github/workflows/ci.yml`, in the same order, on the
# machine you are sitting at. It is not a substitute for the real thing: it uses
# the checkout you have rather than a clean one, and it cannot prove `npm ci`
# resolves on a fresh runner.
#
# Every step prints PASS or FAIL and the script exits non-zero if any failed.

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PASSED=0
FAILED=0
declare -a RESULTS=()

step() {
  local name="$1"; shift
  printf '\n\033[1m── %s\033[0m\n' "$name"
  if "$@"; then
    RESULTS+=("PASS  $name")
    PASSED=$((PASSED + 1))
  else
    RESULTS+=("FAIL  $name")
    FAILED=$((FAILED + 1))
  fi
}

step "frontend · typecheck"       npm run typecheck
step "frontend · tests"           npm test
step "frontend · build"           npm run build
step "frontend · demo exclusion"  npm run verify:demo-exclusion

# Reported, not gated — matching the workflow, and for the reason stated there:
# a 57-warning baseline plus one known error in `use-auth.tsx`.
printf '\n\033[1m── frontend · lint (reported, not gated)\033[0m\n'
npm run lint 2>&1 | tail -3 || true

# ── hygiene ────────────────────────────────────────────────────────────────
step "hygiene · no tracked .env"  bash -c '
  tracked=$(git ls-files | grep -E "(^|/)\.env($|\.)" | grep -v "\.env\.example$" || true)
  if [ -n "$tracked" ]; then echo "Tracked env files:"; echo "$tracked"; exit 1; fi
  echo "No tracked .env files."'

step "hygiene · no tracked build output" bash -c '
  tracked=$(git ls-files | grep -E "(^|/)(node_modules|\.next|out)/" || true)
  if [ -n "$tracked" ]; then echo "Tracked build output:"; echo "$tracked" | head; exit 1; fi
  echo "No tracked build output."'

step "hygiene · no tracked .pyc"  bash -c '
  tracked=$(git ls-files | grep -E "(^|/)__pycache__/|\.pyc$" || true)
  if [ -n "$tracked" ]; then echo "Tracked Python artefacts (D-009):"; echo "$tracked"; exit 1; fi
  echo "No tracked Python artefacts."'

printf '\n\033[1m════ CI SUMMARY ════\033[0m\n'
for line in "${RESULTS[@]}"; do printf '  %s\n' "$line"; done
printf '\n  %d passed, %d failed\n' "$PASSED" "$FAILED"
exit $(( FAILED > 0 ? 1 : 0 ))
