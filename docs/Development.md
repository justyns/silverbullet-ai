## Build
To build this plug, make sure you have [SilverBullet installed](https://silverbullet.md/Install). Then, build the plug with:

```shell
deno task build
```

Or to watch for changes and rebuild automatically

```shell
deno task watch
```

Then, copy the resulting `.plug.js` file into your space's `_plug` folder. Or build and copy in one command:

```shell
deno task build && cp *.plug.js /my/space/_plug/
```

SilverBullet will automatically sync and load the new version of the plug (or speed up this process by running the {[Sync: Now]} command).

## Testing

### Unit Tests

Run unit tests with Deno's built-in test runner:

```shell
deno task test
```

This runs all `*.test.ts` files and generates coverage reports in `cov_profile/`.

### E2E Tests (Browser Testing)

The project includes end-to-end tests using [Playwright](https://playwright.dev/) to test the plugin in a real browser.

#### Setup

First-time setup requires installing Playwright browsers:

```shell
deno task playwright:install
```

#### Running E2E Tests

Run all E2E tests:

```shell
deno task test:e2e
```

Run tests with interactive UI:

```shell
deno task test:e2e:ui
```

Run tests in headed mode (see the browser):

```shell
deno task test:e2e:headed
```

Run specific browser:

```shell
deno task test:e2e --project=chromium
deno task test:e2e --project=firefox
deno task test:e2e --project="Mobile Chrome"
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