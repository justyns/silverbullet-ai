#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote environment)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "Installing dependencies for SilverBullet AI E2E testing..."

# Install npm dependencies for E2E tests if they exist
if [ -f "e2e-tests/package.json" ]; then
  echo "Installing E2E test dependencies..."
  cd e2e-tests
  npm install

  # Install Playwright browsers
  echo "Installing Playwright browsers..."
  npx playwright install chromium --with-deps || echo "Browser install failed, will retry on first test run"

  cd ..
fi

echo "✅ SessionStart hook completed successfully"
