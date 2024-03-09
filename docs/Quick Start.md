---
tags: sidebar
navOrder: 1
---

This is a short introduction to installing and using the SilverBullet AI plug.

## Installation

Run `Plug: Add` and add `github:justyns/silverbullet-ai/silverbullet-ai.plug.js` (or the latest release version, see [[Installation]])

## Configuration

Create or update your `SECRETS` page and add an api key depending on which LLM provider you’re using.

For example, for OpenAI, use OPENAI_API_KEY:

    ```yaml
    OPENAI_API_KEY: "openai key here"
    ```

Update your `SETTINGS` page and configure one or more textModels, and optionally an image model.  Example below is for OpenAI and DallE.  You may also want to configure [[Configuration/Chat Instructions]] at this time.  See [[Providers]] for examples other than OpenAI, including self-hosted ones.

```yaml
ai:
  imageModels:
  - name: dall-e-3
    modelName: dall-e-3
    provider: dalle
  textModels:
  - name: gpt-4-turbo
    provider: openai
    modelName: gpt-4-0125-preview
  - name: gpt-3-turbo
    provider: openai
    modelName: gpt-3.5-turbo-0125

  # Chat section is optional, but may help provide better results when using the Chat On Page command
  chat:
    userInformation: >
      I'm a software developer who likes taking notes.
    userInstructions: >
      Please give short and concise responses.  When providing code, do so in python unless requested otherwise.
```

## Usage

Run `AI: Select Text Model from Config`, choose one of the models you just configured.

Open a new note, run [[Commands/AI: Chat on current page]] or press (CTRL|CMD)+SHIFT+ENTER to start a chat session.

And that’s it!  Look at the other [[Commands]] available, as well as check out the [[Templated Prompts]] to go futher.