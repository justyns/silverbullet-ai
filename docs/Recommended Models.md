# Recommended Models

This page lists AI models and their compatibility with silverbullet-ai features, particularly tool/function calling, streaming, and structured responses.  If a model does not support tool calling, related features will not work, but you can still use the basic chat support with those models.

**Last updated**: 2026-01-06

**Note**: This is not a very thorough benchmark, and was mostly meant as a quick sanity check to see if certain models will work at all. Please consider other benchmarks like [Aider's Polygot leaderboard](https://aider.chat/docs/leaderboards/).

## Model Compatibility

| Model | Provider | Stream | JSON | Schema | Tools | Read | Section | List | Update | Replace | No Tool | Score | Notes |
|-------|----------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|-------|-------|
| gpt-4o | OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| gpt-4o-mini | OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| o3-mini | OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| gpt-5-mini | OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| gpt-5-nano | OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| gpt-5.1 | OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| gpt-5.2 | OpenAI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| qwen2.5:32b | Ollama | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| qwen3:8b | Ollama | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 10/10 | |
| qwen2.5:14b | Ollama | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 9/10 | |
| qwen2.5:7b | Ollama | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | 9/10 | |
| gpt-5 | OpenAI | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | 8/10 | API calls timed out repeatedly |
| hermes3:8b | Ollama | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ✅ | 7/10 | |
| mistral-nemo:12b | Ollama | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | 7/10 | |
| llama3.2:3b | Ollama | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | 6/10 | |
| llama3.2:latest | Ollama | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | 6/10 | |
| qwen2.5-coder:7b | Ollama | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | 4/10 | No native tool support |
| qwen2.5-coder:32b | Ollama | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | 4/10 | No native tool support |
| granite3.2:8b | Ollama | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | 4/10 | No native tool support |
| phi4:14b | Ollama | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 3/10 | No native tool support |
| gemma2:9b | Ollama | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 3/10 | No native tool support |
| deepseek-coder:6.7b | Ollama | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 3/10 | No native tool support |
| deepseek-r1:8b | Ollama | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 1/10 | No native tool support |

### Legend

- ✅ Pass - Test completed successfully
- ⚠️ Warning - Completed with issues
- ❌ Error - Failed or not supported

### Test Descriptions

| Test | Description |
|------|-------------|
| Stream | Streaming response support |
| JSON | JSON output mode |
| Schema | Structured output with schema validation |
| Tools | Basic tool/function calling support |
| Read | Read a page by name |
| Section | Read a specific section from a page |
| List | List pages in a folder |
| Update | Append content to a section |
| Replace | Search and replace text in a page |
| No Tool | Correctly answers without using tools when not needed |

## Notes

### Running Your Own Benchmark

To test a model's compatibility:

1. Select the model using **AI: Select Text Model from Config**
2. Run **AI: Run Benchmark**
3. View results on the **🧪 AI Benchmark** page

### Contributing Results

If you've tested a model not listed here, please contribute your results via a GitHub issue or pull request.
