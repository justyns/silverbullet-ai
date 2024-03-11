

In `SETTINGS`, the Chat section is optional, but may help provide better results when using the [[Commands/AI: Chat on current page]] command.

```yaml
ai:
  chat:
    userInformation: >
      I'm a software developer who likes taking notes.
    userInstructions: >
      Please give short and concise responses.  When providing code, do so in python unless requested otherwise.
```

## Chat Custom Instructions

OpenAI introduced [custom instructions for ChatGPT](https://openai.com/blog/custom-instructions-for-chatgpt) a while back to help improve the responses from ChatGPT.  We are emulating that feature by allowing a system prompt to be injected into each new chat session.

The system prompt is rendered similar to the one below, see the example config above for where to configure these settings:

Always added:
> This is an interactive chat session with a user in a note-taking tool called SilverBullet.

If **userInformation** is set, this is added:
> The user has provided the following information about their self: **${ai.chat.userInformation}**

If **userInstructions** is set, this is added:
> The user has provided the following instructions for the chat, follow them as closely as possible: **${ai.chat.userInstructions}**