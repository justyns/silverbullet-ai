---
tags: sidebar
navOrder: 2
---

Add the following to to your `PLUGS` file, run `Plugs: Update` command and off you go!

For in-development code from the main branch:
```yaml
- github:justyns/silverbullet-ai/silverbullet-ai.plug.js
```

For the latest [release](https://github.com/justyns/silverbullet-ai/releases) version:

```yaml
- ghr:justyns/silverbullet-ai/0.4.1
```

You can also use the `Plugs: Add` command and enter the above url to install.

After installing, be sure to make the necessary [[Configuration|config changes]] in **SETTINGS** and **SECRETS**.

After installing the plug, you can access its features through the command palette. To ensure the plug functions correctly, you must set the `OPENAI_API_KEY` on the SECRETS page.

If you do not have a SECRETS page, create one and name it `SECRETS`. Then, insert a YAML block as shown below, replacing `"openai key here"` with your actual OpenAI API key:

    ```yaml
    OPENAI_API_KEY: "openai key here"
    ```

OPENAI_API_KEY is required for any openai api compatible model currently, but may not get used for local models that don't use keys.

The secret does not necessary have to be `OPENAI_API_KEY`, it can be any name you want as long as you also change the `secretName` for the model to match.  This allows you to have multiple api keys for the same provider as an example.