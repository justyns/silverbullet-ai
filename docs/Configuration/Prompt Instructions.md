When using the built-in commands like [[Commands/AI: Suggest Page Name]], it can be useful to provide user-specific instructions or rules.

In the `SETTINGS` file, additional prompt instructions can be configured like this:

```yaml
ai:
  promptInstructions:
    pageRenameRules: ""
    tagRules: ""
```

For example, the following example does a few things:

- Quick notes will keep their timestamp prefix in the note title
- If a note is tagged with #receipt, it will automatically be moved to a receipts folder.  E.g. `Receipts/2024/06-June/2024-06-30 - lawncare-co payment.md`
- If a note looks like a receipt, automatically add the #receipt tag

```yaml
ai:
  promptInstructions:
    pageRenameRules: |
      If there is a date or time at the beginning, ensure a hyphen seperates the timestamp from the actual note title.  For example, try to name quick notes like this: "YYYY-MM-DD HH:MM:SS - A short title about the note"
      If tags include #receipt or otherwise looks like a receipt, move it to "Receipts/YYYY/MM-MMMM/" using the date from the note metadata.
    tagRules: |
      Tag notes that contain confirmations or receipts with #receipt.
```