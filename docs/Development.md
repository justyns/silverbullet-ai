## Build

To build this plug, make sure you have [Node.js](https://nodejs.org/) (v18 or later) and npm installed. Then install dependencies and build:

```shell
npm install
npm run build
```

This compiles the plug to `silverbullet-ai.plug.js`. Copy it into your space's `_plug` folder:

```shell
npm run build && cp silverbullet-ai.plug.js /my/space/_plug/
```

SilverBullet will automatically sync and load the new version of the plug (or speed up this process by running the {[Sync: Now]} command).

### Distribution Build

To generate a full distribution (plug + combined Space Lua library):

```shell
npm run dist
```

This creates the following files in `dist/`:
- `silverbullet-ai.plug.js` — the compiled plug
- `silverbullet-ai-library.md` — combined Space Lua pages for installation
- `PLUG.md` — the installable library page

Copy `silverbullet-ai-library.md` to your space root so SilverBullet can load the Space Lua functions.

## Testing

### Unit Tests

Run unit tests with vitest:

```shell
npm test
```

### E2E Tests (Browser Testing)

The project includes end-to-end tests using [Playwright](https://playwright.dev/) to test the plugin in a real browser.

#### Setup

First-time setup requires installing dependencies and Playwright browsers:

```shell
cd e2e-tests
npm install
npx playwright install
```

#### Running E2E Tests

Run all E2E tests:

```shell
cd e2e-tests
npx playwright test
```

Run tests with interactive UI:

```shell
npx playwright test --ui
```

Run tests in headed mode (see the browser):

```shell
npx playwright test --headed
```

Run specific browser:

```shell
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project="Mobile Chrome"
```

#### Test Structure

E2E tests are located in `e2e-tests/tests/`. See `e2e-tests/README.md` for detailed documentation.

The tests automatically:
- Start a SilverBullet instance on port 3000
- Load the test space from `test-space/`
- Run tests across multiple browsers and viewports
- Capture screenshots and videos on failure

For more information, see the [E2E Testing README](../e2e-tests/README.md).


## Docs

Documentation is located in the `docs/` directory and rendered using [mkdocs](https://github.com/mkdocs/mkdocs).

To make changes, use silverbullet (or any markdown editor) locally like: `silverbullet docs/`

If you want to see changes in real-time, open up two terminals and run these two commands:

- `mkdocs serve -a localhost:9000`
- `find docs -name \*.md -type f | egrep -v 'public' | entr bash ./render-docs.sh`

The first starts a local development server of mkdocs. The second uses the [entr](https://github.com/eradman/entr) command to run silverbullet-pub every time a file changes inside the silverbullet docs/ directory.

Markdown files inside of docs/ can also be manually edited using any editor.
