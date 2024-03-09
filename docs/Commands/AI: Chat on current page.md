---
tags: commands
commandName: "AI: Chat on current page"
commandSummary: "Streams a conversation with the LLM, but uses the current page as a sort of chat history.
New responses are always appended to the end of the page."
---


Ever wanted to chat with an AI/LLM directly from your editor or notes?  Now you can!

Run `AI: Chat on current page` or press (CTRL|CMD)+SHIFT+ENTER on any page and that page will become a new chat.

Simple example of what this looks like:
![](2024-03-09_04-01-31-chat-example.gif)
In addition to a normal chat you could have in any chatgpt-like interface, you can also reference your own notes (or others’ via federation) and those notes will automatically be sent as context to the LLM.

**Note**:  Be careful with this and what information you are sending to 3rd parties.
![](2024-03-09_05-23-45-wikilink-context.gif)

One more helpful chat feature is the ability to specify [[Configuration/Chat Instructions]] to customize the LLM’s responses towards you.

![](2024-03-08-chat-custom-instructions.gif)