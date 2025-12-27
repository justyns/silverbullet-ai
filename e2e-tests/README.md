# E2E Tests for SilverBullet AI Plugin

This directory contains end-to-end browser tests for the SilverBullet AI plugin using [Playwright](https://playwright.dev/).

## Setup

### Prerequisites

- [Deno](https://deno.land/) installed (v2.0 or later)
- SilverBullet CLI installed globally

### Install Playwright Browsers

Before running tests for the first time, install Playwright browsers:

```bash
deno run -A npm:playwright install
```

This will download Chromium, Firefox, and WebKit browsers.

## Running Tests

### Run all tests

```bash
deno task test:e2e
```

### Run tests in UI mode (interactive)

```bash
deno task test:e2e:ui
```

### Run tests in a specific browser

```bash
# Chromium only
deno task test:e2e --project=chromium

# Firefox only
deno task test:e2e --project=firefox

# Mobile Chrome
deno task test:e2e --project="Mobile Chrome"
```

### Run tests in headed mode (see the browser)

```bash
deno task test:e2e --headed
```

### Run specific test file

```bash
deno run -A npm:playwright test tests/chat-panel.spec.ts
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
import { test, expect } from "npm:@playwright/test@1.49.0";

test("my test", async ({ page }) => {
  await page.goto("/");

  // Your test code here
  await expect(page.locator("h1")).toHaveText("SilverBullet");
});
```

## Test Reports

After running tests, you can view the HTML report:

```bash
deno run -A npm:playwright show-report
```

## CI/CD Integration

E2E tests are configured to run in GitHub Actions on every push and pull request.

## Debugging

### Debug mode

Run tests in debug mode with Playwright Inspector:

```bash
deno run -A npm:playwright test --debug
```

### Screenshots and Videos

On test failure, Playwright automatically captures:
- Screenshots (in `test-results/`)
- Videos (in `test-results/`)
- Traces (viewable with `playwright show-trace`)

## Troubleshooting

### SilverBullet not starting

If the test web server fails to start:

1. Check that port 3000 is available
2. Ensure SilverBullet is installed: `deno install -A --global npm:silverbullet`
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
deno run -A npm:playwright install --force
```

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Playwright with Deno](https://www.kapp.technology/en/blog/run-playwright-on-deno-javascript-runtime/)
- [SilverBullet Documentation](https://silverbullet.md/)
