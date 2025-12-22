## Chat & Conversation

- **Interactive Chat**: Multi-turn conversations using the current note as the chat interface
- **AI Assistant Panel**: Right-side chat panel for persistent conversations across pages
- **RAG (Retrieval Augmented Generation)**: Automatic vector embedding search for relevant context
- **Context Enrichment**: Wiki-link parsing, template expansion, and custom enrichment functions

## AI Agents

- **Custom Agents**: Create specialized AI personas with custom system prompts
- **Tool Filtering**: Restrict which tools agents can access
- **Page-Based Agents**: Define agents as pages with embedded context via wiki-links
- **Lua-Defined Agents**: Define agents directly in Space Lua

## AI Tools

- **Built-in Tools**: Read, create, update notes; search, navigate; execute Lua
- **Custom Tools**: Define your own tools in Space Lua
- **Approval Gates**: Require user confirmation before tools execute
- **Diff Previews**: See proposed changes before writing to pages

## Templated Prompts

- **Custom Templates**: Define AI prompts as pages with `meta/template/aiPrompt` tag
- **Space Lua Prompts**: Define prompts directly in Lua
- **Multiple Insertion Modes**: Insert at cursor, page start/end, replace selection, etc.
- **Post-Processing**: Transform LLM responses with custom functions

## Embeddings & Search

- **Vector Embeddings**: Chunk-based embeddings stored in SilverBullet's datastore
- **Similarity Search**: Semantic search across indexed pages
- **Note Summaries**: *Experimental* - Generate and index page summaries

## Bundled Prompts

Pre-built AI prompt templates that ship with the plug:

- **Generate Tags**: Suggests tags based on note content
- **Suggest Page Name**: Recommends titles for notes
- **Generate FrontMatter**: *Experimental* - Extracts metadata from content
- **Enhance Note**: Runs all three above in sequence

## Image Generation

- **DALL-E Integration**: Generate images from text prompts
- **Auto-Upload**: Generated images are uploaded to your space
- **Caption Insertion**: Images inserted with descriptive captions

## Provider Support

- OpenAI (GPT-4, GPT-3.5, etc.)
- Google Gemini
- Ollama (local)
- Mistral AI
- Perplexity AI
- OpenRouter
- Any OpenAI-compatible API

## Utilities

- **Model Selection**: Switch between configured models on the fly
- **Connectivity Testing**: Verify API endpoints and model access
- **Benchmarking**: Test model performance and capabilities
