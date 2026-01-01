#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote environment)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "🔧 Installing dependencies for SilverBullet AI E2E testing..."

# Install npm dependencies for E2E tests if they exist
if [ -f "e2e-tests/package.json" ]; then
  echo "📦 Installing E2E test dependencies..."
  cd e2e-tests
  npm install --quiet

  # Install Playwright browsers
  echo "🌐 Installing Playwright browsers..."
  if npx playwright install chromium --with-deps 2>&1 | tee /tmp/playwright-install.log; then
    echo "✅ Playwright browsers installed successfully"
  else
    echo "⚠️  Browser installation encountered issues (see /tmp/playwright-install.log)"
    echo "   This may happen in network-restricted environments"
    echo "   Tests will attempt to use any pre-installed browsers"
  fi

  cd ..
fi

echo "✅ SessionStart hook completed"
