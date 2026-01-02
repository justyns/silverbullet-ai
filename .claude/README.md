# Claude Code Configuration

This directory contains Claude Code configuration for the SilverBullet AI plugin.

## SessionStart Hook

The `hooks/session-start.sh` script automatically sets up the testing environment when Claude Code on the web sessions
start.

### What it does

1. Detects if running in Claude Code on the web (via `$CLAUDE_CODE_REMOTE`)
2. Installs npm dependencies from `e2e-tests/package.json`
3. Downloads Playwright browsers for E2E testing
4. Caches the container state for faster subsequent sessions

### Testing locally

You can test the hook locally by simulating the web environment:

```bash
CLAUDE_CODE_REMOTE=true ./.claude/hooks/session-start.sh
```

### Configuration

The hook is registered in `settings.json` and runs automatically when:

- Starting a new Claude Code on the web session
- Resuming an existing session
- After `/clear` or `/compact` commands

### Notes

- The hook runs **synchronously** by default to ensure dependencies are installed before the session starts
- Container state is cached after the hook completes, making subsequent sessions faster
- The hook is **idempotent** - safe to run multiple times

For more information, see the [Claude Code Hooks documentation](https://docs.claude.com/en/docs/claude-code/hooks).
