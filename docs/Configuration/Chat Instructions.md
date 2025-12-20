The Chat section is optional, but may help provide better results when using the [[Commands/AI: Chat on current page]] command and the Chat Panel.

```lua
config.set {
  ai = {
    chat = {
      userInformation = "I'm a software developer who likes taking notes.",
      userInstructions = "Please give short and concise responses. When providing code, do so in python unless requested otherwise.",
      customContext = [["Today is " .. os.date("%Y-%m-%d") .. " (" .. os.date("%A") .. ")"]]
    }
  }
}
```

## Chat Custom Instructions

OpenAI introduced [custom instructions for ChatGPT](https://openai.com/blog/custom-instructions-for-chatgpt) a while back to help improve the responses from ChatGPT. We are emulating that feature by allowing a system prompt to be injected into each new chat session.

The system prompt is rendered similar to the one below, see the example config above for where to configure these settings:

Always added:
> This is an interactive chat session with a user in a note-taking tool called SilverBullet.

If **enableTools** is true (default), this is added:
> You have access to tools that can help you assist the user. Use them proactively when they would be helpful - for example, reading notes, searching, or performing actions the user requests.

If **userInformation** is set, this is added:
> The user has provided the following information about their self: **${ai.chat.userInformation}**

If **userInstructions** is set, this is added:
> The user has provided the following instructions for the chat, follow them as closely as possible: **${ai.chat.userInstructions}**

## Custom Context

The **customContext** option allows you to add dynamic context to each chat message. It accepts a Lua expression that is evaluated at chat time, so you can include things like the current date.

The result is prepended to your message in the Chat Panel, wrapped in `<context>` tags along with the current page content and selection.

**Note:** This context is sent with the latest message only, it is not persisted.

**Example - Add current date:**
```lua
config.set {
  ai = {
    chat = {
      customContext = [["Today is " .. os.date("%Y-%m-%d") .. " (" .. os.date("%A") .. ")"]]
    }
  }
}
```

**Example - Add multiple pieces of context:**
```lua
config.set {
  ai = {
    chat = {
      customContext = [[table.concat({
        "Date: " .. os.date("%Y-%m-%d"),
        "Time: " .. os.date("%H:%M"),
        "Day: " .. os.date("%A"),
      }, "\n")]]
    }
  }
}
```

This is useful for time-sensitive queries where you want the AI to know the current date without having to type it manually.

**Example - Include a profile page:**

Create a `Profile` page with your personal information:

```markdown
---
tags: meta
---
# Profile
Location: San Francisco, CA
Timezone: America/Los_Angeles
Preferred language: English
```

Then configure customContext to read it:

```lua
config.set {
  ai = {
    chat = {
      customContext = [[space.readPage("Profile") or ""]]
    }
  }
}
```

Now the assistant will know your location for weather queries, timezone for scheduling, etc.

**Example - Combine profile with date:**

```lua
config.set {
  ai = {
    chat = {
      customContext = [[table.concat({
        "Date: " .. os.date("%Y-%m-%d %H:%M"),
        space.readPage("Profile") or ""
      }, "\n\n")]]
    }
  }
}
```
