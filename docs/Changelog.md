For the full changelog, please refer to the individual release notes on https://github.com/justyns/silverbullet-ai/releases or the commits themselves.

This page is a brief overview of each version.

---
## Unreleased
- Don't index and generate embeddings for pages in Library/
- Add new `AI: Enhance Note` command to call existing `AI: Tag Note` and `AI: Suggest Page Name` commands on a note, and the new frontmatter command
- Add new `AI: Generate Note FrontMatter` command to extract useful facts from a note and add them to the frontmatter

---
## 0.2.0

* Vector search and embeddings generation [[embe]] by [@justyns](https://github.com/justyns) in [#37](https://github.com/justyns/silverbullet-ai/pull/37)
* Enrich chat messages with RAG by searching our local embeddings by [@justyns](https://github.com/justyns) in [#38](https://github.com/justyns/silverbullet-ai/pull/38)
* Refactor: Re-organize providers, interfaces, and types by [@justyns](https://github.com/justyns) in [#39](https://github.com/justyns/silverbullet-ai/pull/39)
* Add try/catch to tests by [@justyns](https://github.com/justyns) in [#40](https://github.com/justyns/silverbullet-ai/pull/40)
* Fix bug causing silverbullet to break when aiSettings isn't configured at all by [@justyns](https://github.com/justyns) in [#42](https://github.com/justyns/silverbullet-ai/pull/42)
* Add option to generate summaries of each note and index them. by [@justyns](https://github.com/justyns) in [#43](https://github.com/justyns/silverbullet-ai/pull/43)
* Disable indexing on clients, index only on server by [@justyns](https://github.com/justyns) in [#44](https://github.com/justyns/silverbullet-ai/pull/44)
* Set index and search events to server only by [@justyns](https://github.com/justyns) in [#45](https://github.com/justyns/silverbullet-ai/pull/45)
---
## 0.1.0
- **BREAKING**: Removed deprecated parameters: summarizePrompt, tagPrompt, imagePrompt, temperature, maxTokens, defaultTextModel, backwardsCompat. Except for defaultTextModel, these were no longer used.
- New [[Commands/AI: Suggest Page Name]] command
- Bake queries and templates in chat by [@justyns](https://github.com/justyns) in [#30](https://github.com/justyns/silverbullet-ai/pull/30)
* Allow completely overriding page rename system prompt, improve ux by [@justyns](https://github.com/justyns) in [#31](https://github.com/justyns/silverbullet-ai/pull/31)
* Always select a model if it's the only one in the list by [@justyns](https://github.com/justyns) in [#33](https://github.com/justyns/silverbullet-ai/pull/33)
* Pass all existing tags to generate tag command, allow user to add their own instructions too
---
## 0.0.11
- Support for custom chat message enrichment functions, see [[Configuration/Custom Enrichment Functions]]
---
## 0.0.10
- Add WIP docs and docs workflow by [@justyns](https://github.com/justyns) in [#20](https://github.com/justyns/silverbullet-ai/pull/20)
- Enable slash completion for ai prompts
- Don't die if clientStore.get doesn't work, like in cli mode
---
## 0.0.9
- Add github action for deno build-release by [@justyns](https://github.com/justyns) in [#18](https://github.com/justyns/silverbullet-ai/pull/18)
- Add ability to configure multiple text and image models, and switch between them by [@justyns](https://github.com/justyns) in [#17](https://github.com/justyns/silverbullet-ai/pull/17)
- Fix error when imageModels is undefined in SETTINGS by [@justyns](https://github.com/justyns) in [#22](https://github.com/justyns/silverbullet-ai/pull/22)
- Re-add summarizeNote and insertSummary commands, fixes [#19](https://github.com/justyns/silverbullet-ai/issues/19). Also add non-streaming support to gemini by [@justyns](https://github.com/justyns) in [#24](https://github.com/justyns/silverbullet-ai/pull/24)
---
## 0.0.8
- Add wikilink enrichment to chat messages for [#9](https://github.com/justyns/silverbullet-ai/issues/9) by [@justyns](https://github.com/justyns) in [#12](https://github.com/justyns/silverbullet-ai/pull/12)
- Add a newline when the first message from the LLM is either a code fence or markdown block by [@justyns](https://github.com/justyns) in [#13](https://github.com/justyns/silverbullet-ai/pull/13)
---
## 0.0.7
- Added Perplexity AI API info by [@zefhemel](https://github.com/zefhemel) in [#6](https://github.com/justyns/silverbullet-ai/pull/6)
- Add Custom Instructions for chat by [@justyns](https://github.com/justyns) in [#8](https://github.com/justyns/silverbullet-ai/pull/8)
- Interfaces refactor by [@justyns](https://github.com/justyns) in [#10](https://github.com/justyns/silverbullet-ai/pull/10)
- Add experimental Google Gemini support for [#3](https://github.com/justyns/silverbullet-ai/issues/3) by [@justyns](https://github.com/justyns) in [#11](https://github.com/justyns/silverbullet-ai/pull/11)
---
## 0.0.6
- Add a new command to prompt for a template to execute and render as a prompt
- Add insertAt option for prompt templates (page-start, page-end, cursor)
- Make the cursor behave nicer in interactive chats, fixes [#1](https://github.com/justyns/silverbullet-ai/issues/1)
- Remove 'Contacting LLM' notification and replace it with a loading placeholder for now [#1](https://github.com/justyns/silverbullet-ai/issues/1)
- Move some of the flashNotifications to console.log instead
- Dall-e: Use finalFileName instead of the prompt to prevent long prompts form breaking the markdown
- Add queryOpenAI function to use in templates later
- Update Readme for templated prompts, build potential release version
---
## 0.0.5
- Rename test stream command
- Add better error handling and notifications
- Misc refactoring to make the codebase easier to work on
- Automatically reload config from SETTINGS and SECRETS page
- Update readme for ollama/mistral.ai examples
- Use editor.insertAtPos instead of insertAtCursor to make streaming text more sane
- Add requireAuth variable to fix cors issue on chrome w/ ollama
- Remove redundant commands, use streaming for others
- Let chat on page work on any page. Add keyboard shortcut for it
- Move cursor to follow streaming response
---
## 0.0.4
- Add command for 'Chat on current page' to have an interactive chat on a note page
- Use relative image path name for dall-e generated images
- First attempt at supporting streaming responses from openai directly into the editor
---
## 0.0.3
- Add a new command to call openai using a user note or selection as the prompt, ignoring built-in prompts
- Add support for changing the openai-compatible api url and using a local LLM like Ollama
- Update jsdoc descriptions for each command and add to readme
- Save dall-e generated image locally
- Add script to update readme automatically
- Save and display the revised prompt from dall-e-3
---