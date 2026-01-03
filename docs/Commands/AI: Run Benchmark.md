Navigates to a benchmark page that runs tests against configured models to verify their capabilities.

## What It Tests

**Capability Tests:**

| Test | Description |
|------|-------------|
| Stream | Verifies streaming responses work |
| JSON | Tests JSON mode (structured output) |
| Schema | Tests JSON schema mode with strict validation |
| Tools | Verifies the model can make tool calls |

**Execution Tests:**

| Test | Description |
|------|-------------|
| Read | Can the model read a note using tools? |
| Section | Can it read a specific section? |
| List | Can it list pages in a directory? |
| Update | Can it append content to a page? |
| Replace | Can it find and replace text? |
| No Tool | Does it correctly avoid tools when not needed? |

## When to Use

Run this command to:

- Verify a new model works correctly with the Assistant
- Compare capabilities across different models
- Troubleshoot tool-related issues

## Running the Benchmark

1. Run the command
2. Select models to test (single, multiple, or all)
3. Wait for tests to complete
4. View results on the benchmark page

Multiple models can be tested in one run for easy comparison.
