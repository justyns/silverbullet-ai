---
tags: template
---

* **{{ref}}** {{#if aiprompt}}{{aiprompt.description}}{{else}}{{description}}{{/if}}
{{#if aiprompt.usage}}
  * **Usage:** {{aiprompt.usage}}
{{/if}}
