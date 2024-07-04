
When using [[Commands/AI: Chat on current page]], wiki links are automatically expanded and queries/templates are rendered, but it’s also possible to include your own custom message enrichment.

**Example use cases**:

- Use regex to detect JIRA-1234, automatically use the jira api to fetch an issues description and return it as context to the llm.
- Detect http/https urls, fetch them, parse them into readable chunks, and include for llm.
- Use the same remote http/https urls to fetch and provide documentation when asking for help from a llm.

A custom enrichment function is a [Space Script](https://silverbullet.md/Space%20Script) Function.  Please see the related upstream documentation.

Once you have a space script function defined, there are two ways to tell the AI plug to use it.

## Method 1 - SETTINGS

In `SETTINGS`, define a list of functions to call.  These will be executed for each **user** message on a chat page.

```yaml
ai:
  chat:
    customEnrichFunctions:
    - enrichWithURL
    - extractJiraDescriptions
    - addBlarp
```

## Method 2 - Event Listeners

If you don’t want to use `SETTINGS`, or would just rather keep logic grouped together, an `ai:enrichMessage` event will be fired and expects a string or array of strings with function names to call. These must be valid space script functions.

Example defining a simple function and listener that registers that function:

```javascript
silverbullet.registerFunction('addBlarp', async (message) => {
  return `${message} BLARP`;
});

silverbullet.registerEventListener({name: "ai:enrichMessage"}, async (event) => {
  return 'addBlarp';
});
```