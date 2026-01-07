# Space Style

Some of this plug's UI can be customized by overriding CSS variables using SilverBullet's [Space Style](https://silverbullet.md/Space%20Style) feature.

## CSS Variables

The following CSS variables control panel appearance.  If not set, they fall back to SilverBullet's default theme colors.

### Approval Buttons

| Variable | Description |
|----------|-------------|
| `--ai-approve-bg` | Background color for approve buttons (defaults to accent color) |
| `--ai-approve-text` | Text color for approve buttons |
| `--ai-reject-bg` | Background color for reject buttons |
| `--ai-reject-text` | Text color for reject buttons |
| `--ai-reject-border` | Border color for reject buttons |

### Diff Preview

| Variable | Description |
|----------|-------------|
| `--ai-diff-add-bg` | Background color for added lines |
| `--ai-diff-add-text` | Text color for added lines |
| `--ai-diff-remove-bg` | Background color for removed lines |
| `--ai-diff-remove-text` | Text color for removed lines |

## Example

Create a page in your space with a `space-style` code block:

~~~markdown
```space-style
:root {
  --ai-approve-bg: #22c55e;
  --ai-approve-text: #ffffff;

  --ai-reject-bg: transparent;
  --ai-reject-text: #ef4444;
  --ai-reject-border: #ef4444;

  --ai-diff-add-bg: #dcfce7;
  --ai-diff-add-text: #166534;
  --ai-diff-remove-bg: #fee2e2;
  --ai-diff-remove-text: #991b1b;
}
```
~~~

For dark mode overrides, use the `[data-theme="dark"]` selector:

~~~markdown
```space-style
[data-theme="dark"] {
  --ai-diff-add-bg: #14532d;
  --ai-diff-add-text: #bbf7d0;
  --ai-diff-remove-bg: #7f1d1d;
  --ai-diff-remove-text: #fecaca;
}
```
~~~
