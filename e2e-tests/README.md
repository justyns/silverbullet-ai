# E2E Tests for SilverBullet AI Plugin

This directory contains end-to-end browser tests for the SilverBullet AI plugin using [Playwright](https://playwright.dev/).

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later) and npm installed
- SilverBullet CLI installed globally

### Install Dependencies and Playwright Browsers

Before running tests for the first time, install dependencies and Playwright browsers:

```bash
npm install
npx playwright install
```

This will download Chromium, Firefox, and WebKit browsers.

## Running Tests

### Run all tests

```bash
npx playwright test
```

### Run tests in UI mode (interactive)

```bash
npx playwright test --ui
```

### Run tests in a specific browser

```bash
# Chromium only
npx playwright test --project=chromium

# Firefox only
npx playwright test --project=firefox

# Mobile Chrome
npx playwright test --project="Mobile Chrome"
```

### Run tests in headed mode (see the browser)

```bash
npx playwright test --headed
```

### Run specific test file

```bash
npx playwright test tests/chat-panel.spec.ts
```

## Test Structure

```
e2e-tests/
├── playwright.config.ts    # Playwright configuration
├── tests/                  # Test files
│   └── chat-panel.spec.ts # Chat panel E2E tests
└── README.md              # This file
```

## Writing Tests

Tests use Playwright's test framework. Example:

```typescript
import { test, expect } from "@playwright/test";

test("my test", async ({ page }) => {
  await page.goto("/");

  // Your test code here
  await expect(page.locator("h1")).toHaveText("SilverBullet");
});
```

## Test Reports

After running tests, you can view the HTML report:

```bash
npx playwright show-report
```

## CI/CD Integration

E2E tests are configured to run in GitHub Actions on every push and pull request.

## Debugging

### Debug mode

Run tests in debug mode with Playwright Inspector:

```bash
npx playwright test --debug
```

### Screenshots and Videos

On test failure, Playwright automatically captures:
- Screenshots (in `test-results/`)
- Videos (in `test-results/`)
- Traces (viewable with `npx playwright show-trace`)

## Troubleshooting

### SilverBullet not starting

If the test web server fails to start:

1. Check that port 3000 is available
2. Ensure SilverBullet is installed: `npm install -g silverbullet`
3. Manually test: `silverbullet ./test-space --port 3000`

### Tests timing out

Increase timeout in `playwright.config.ts`:

```typescript
use: {
  timeout: 30000, // 30 seconds per test
}
```

### Browser not found

Reinstall browsers:

```bash
npx playwright install --force
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [SilverBullet Documentation](https://silverbullet.md/)
