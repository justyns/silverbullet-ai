# SilverBullet AI Plug

This plug integrates various LLMs (Large Language Models) into [SilverBullet](https://silverbullet.md/), the markdown-based note taking tool, allowing users to perform various AI-related tasks directly within their notes. It requires SilverBullet to work, and also access to either a self-hosted or SaaS LLM such as Ollama, OpenAI (ChatGPT), Google Gemini, etc.

silverbullet-ai is very new and is still in early development.  It may not work as expected.  Please report any issues you encounter, or feature ideas.

If you are new here, start with either the `AI: Chat on current page` command or the custom templated prompts!

**Warning**: Please backup your notes before using this plug.  It inserts and replaces text at certain points and isn't well-tested yet, so back up your data!

## Features

- **Summarize Note**: Summarizes the content of a note or selected text.
- **Replace with Summary**: Replaces the selected text with its summary.
- **Insert Summary**: Inserts a summary of the selected text or note at the cursor position.
- **Call OpenAI with Note Context**: Sends the note or selected text to OpenAI based on a user-defined prompt.
- **Generate Tags for Note**: Generates tags for the current note using AI.
- **Generate and Insert Image using Dall-E**: Generates an image based on a prompt and inserts it into the note.

### Available commands

The list below are the commands available in this plugin.

<!-- start-commands-and-functions -->
- **AI: Summarize Note and open summary**: Uses a built-in prompt to ask the LLM for a summary of either the entire note, or the selected
text.  Opens the resulting summary in a temporary right pane.
- **AI: Call OpenAI with Note as context**: Prompts the user for a custom prompt to send to the LLM.  If the user has text selected, the selected text is used as the note content.
If the user has no text selected, the entire note is used as the note content.
The response is streamed to the cursor position.
- **AI: Generate tags for note**: Asks the LLM to generate tags for the current note.
Generated tags are added to the note's frontmatter.
- **AI: Generate and insert image using DallE**: Prompts the user for a custom prompt to send to DALL·E, then sends the prompt to DALL·E to generate an image.
The resulting image is then uploaded to the space and inserted into the note with a caption.
- **AI: Stream response with selection or note as prompt**: Streams a conversation with the LLM, inserting the responses at the cursor position as it is received.
- **AI: Chat on current page**: Streams a conversation with the LLM, but uses the current page as a sort of chat history.
New responses are always appended to the end of the page.
- **AI: Execute AI Prompt from Custom Template**: Prompts the user to select a template, renders that template, sends it to the LLM, and then inserts the result into the page.
Valid templates must have a value for aiprompt.description in the frontmatter.
- **AI: Select Text Model from Config**: undefined
- **AI: Select Image Model from Config**: undefined

<!-- end-commands-and-functions -->

