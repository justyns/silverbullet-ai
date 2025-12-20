import type { IndexTreeEvent } from "@silverbulletmd/silverbullet/type/event";
import type { MQMessage } from "@silverbulletmd/silverbullet/type/datastore";
import type { AISummaryObject, CombinedEmbeddingResult, EmbeddingObject, EmbeddingResult } from "./types.ts";
import { renderToText } from "@silverbulletmd/silverbullet/lib/tree";
import { currentEmbeddingModel, currentEmbeddingProvider, initIfNeeded } from "../src/init.ts";
import { log } from "./utils.ts";
import { editor, index, markdown, mq, space } from "@silverbulletmd/silverbullet/syscalls";
import { aiSettings, configureSelectedModel } from "./init.ts";
import * as cache from "./cache.ts";

const searchPrefix = "🤖 ";

// Cache for search results - keyed by query
let cachedSearchResults: Map<string, string> = new Map();

/**
 * Check whether a page is allowed to be indexed or not.
 */
export function canIndexPage(pageName: string): boolean {
  // Only index pages if the user enabled it, and skip anything they want to exclude
  const excludePages = [
    "SETTINGS",
    "SECRETS",
    ...aiSettings.indexEmbeddingsExcludePages,
  ];
  if (
    excludePages.includes(pageName) ||
    pageName.startsWith("_") ||
    pageName.startsWith("Library/") ||
    /\.conflicted\.\d+$/.test(pageName)
  ) {
    return false;
  }
  return true;
}

// Logic for whether or not to index something:
//  - With embeddings enabled
//  - With a valid embedding model and provider

export async function shouldIndexEmbeddings() {
  await initIfNeeded();
  return aiSettings.indexEmbeddings &&
    currentEmbeddingProvider !== undefined &&
    currentEmbeddingModel !== undefined &&
    aiSettings.embeddingModels.length > 0;
}

export async function shouldIndexSummaries() {
  await initIfNeeded();
  return aiSettings.indexEmbeddings &&
    aiSettings.indexSummary &&
    currentEmbeddingProvider !== undefined &&
    currentEmbeddingModel !== undefined &&
    aiSettings.embeddingModels.length > 0;
}

/**
 * Generate embeddings for each paragraph in a page, and then indexes
 * them.
 */
export async function indexEmbeddings(page: string) {
  if (!await shouldIndexEmbeddings()) {
    return;
  }

  if (!canIndexPage(page)) {
    return;
  }

  const pageText = await space.readPage(page);
  const tree = await markdown.parseMarkdown(pageText);

  if (!tree.children) {
    return;
  }

  // Splitting embeddings up by paragraph, but there could be better ways to do it
  //     ^ Some places suggest a sliding window so that each chunk has some overlap with the previous/next chunk
  //     ^ But in some limited testing, this seems to work alright only split by paragraph
  const paragraphs = tree.children.filter((node) => node.type === "Paragraph");

  const objects: EmbeddingObject[] = [];

  const startTime = Date.now();

  // TODO: Filter out images, or send images to a vision model to get a summary and index that instead
  for (const paragraph of paragraphs) {
    const paragraphText = renderToText(paragraph).trim();

    // Skip empty paragraphs and lines with less than 10 characters (TODO: remove that limit?)
    if (!paragraphText || paragraphText.length < 10) {
      continue;
    }

    if (
      aiSettings.indexEmbeddingsExcludeStrings.some((s) => paragraphText.includes(s))
    ) {
      // Some strings might appear in a ton of notes but aren't helpful for searching.
      // This only excludes strings that are an exact match for a paragraph.
      continue;
    }

    const embedding = await currentEmbeddingProvider.generateEmbeddings({
      text: paragraphText,
    });

    const pos = paragraph.from ?? 0;

    const embeddingObject: EmbeddingObject = {
      ref: `${page}@${pos}`,
      page: page,
      pos: pos,
      embedding: embedding,
      text: paragraphText,
      tag: "embedding",
    };

    // log("Indexing embedding object", embeddingObject);
    objects.push(embeddingObject);
  }

  await index.indexObjects(page, objects);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  log(
    `AI: Indexed ${objects.length} embedding objects for page ${page} in ${duration} seconds`,
  );
}

/**
 * Generate a summary for a page, and then indexes it.
 */
export async function indexSummary(page: string) {
  if (!await shouldIndexSummaries()) {
    return;
  }

  if (!canIndexPage(page)) {
    return;
  }

  const text = await space.readPage(page);
  const tree = await markdown.parseMarkdown(text);

  if (!tree.children) {
    return;
  }

  const startTime = Date.now();
  const pageText = renderToText(tree);
  const summaryModel = aiSettings.textModels.find((model) => model.name === aiSettings.indexSummaryModelName);
  if (!summaryModel) {
    throw new Error(
      `Could not find summary model ${aiSettings.indexSummaryModelName}`,
    );
  }
  const summaryProvider = await configureSelectedModel(summaryModel);
  let summaryPrompt;

  if (aiSettings.promptInstructions.indexSummaryPrompt !== "") {
    summaryPrompt = aiSettings.promptInstructions.indexSummaryPrompt;
  } else {
    summaryPrompt =
      "Provide a concise and informative summary of the above page. The summary should capture the key points and be useful for search purposes. Avoid any formatting or extraneous text.  No more than one paragraph.  Summary:\n";
  }

  const cacheKey = await cache.hashStrings(
    summaryModel.name,
    pageText,
    summaryPrompt,
  );
  let summary = cache.getCache(cacheKey);
  if (!summary) {
    summary = await summaryProvider.singleMessageChat(
      "Contents of " + page + ":\n" + pageText + "\n\n" + summaryPrompt,
    );
    cache.setCache(cacheKey, summary);
  }

  const summaryEmbeddings = await currentEmbeddingProvider.generateEmbeddings({
    text: summary,
  });

  const summaryObject: AISummaryObject = {
    ref: `${page}@0`,
    page: page,
    embedding: summaryEmbeddings,
    text: summary,
    tag: "aiSummary",
  };

  await index.indexObjects(page, [summaryObject]);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  log(`AI: Indexed summary for page ${page} in ${duration} seconds`);
}

// Listen for page:index events and queue up embedding and summary indexing to
// prevent the main SB indexing process from being blocked.
export async function queueEmbeddingGeneration(
  { name: page, tree }: IndexTreeEvent,
) {
  await initIfNeeded();

  if (!canIndexPage(page)) {
    return;
  }

  if (!tree.children) {
    return;
  }

  if (await shouldIndexEmbeddings()) {
    await mq.send("aiEmbeddingsQueue", page);
  }

  if (await shouldIndexSummaries()) {
    await mq.send("aiSummaryQueue", page);
  }
}

export async function processEmbeddingsQueue(messages: MQMessage[]) {
  await initIfNeeded();
  for (const message of messages) {
    const pageName: string = message.body;
    console.log(`AI: Generating and indexing embeddings for file ${pageName}`);
    await indexEmbeddings(pageName);
  }
  const queueStats = await mq.getQueueStats("aiEmbeddingsQueue");
  console.log(`AI: Embeddings queue stats: ${JSON.stringify(queueStats)}`);
}

export async function processSummaryQueue(messages: MQMessage[]) {
  await initIfNeeded();
  for (const message of messages) {
    const pageName: string = message.body;
    console.log(`AI: Generating and indexing summary for ${pageName}`);
    await indexSummary(pageName);
  }
  const queueStats = await mq.getQueueStats("aiSummaryQueue");
  console.log(`AI: Summary queue stats: ${JSON.stringify(queueStats)}`);
}

export async function getAllEmbeddings(): Promise<EmbeddingObject[]> {
  return await index.queryLuaObjects<EmbeddingObject>("embedding", {});
}

export async function getAllAISummaries(): Promise<AISummaryObject[]> {
  return await index.queryLuaObjects<AISummaryObject>("aiSummary", {});
}

export async function generateEmbeddings(text: string): Promise<number[]> {
  await initIfNeeded();
  if (!currentEmbeddingProvider || !currentEmbeddingModel) {
    throw new Error("No embedding provider found");
  }
  return await currentEmbeddingProvider.generateEmbeddings({ text });
}

// Full disclosure, I don't really understand how this part works - thanks chatgpt!
//   ^ If anyone can make it better, please do.
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Loop over every single embedding object and calculate the cosine similarity between the query embedding and each embedding object.
 * Return the most similar embedding objects.
 */
export async function searchEmbeddings(
  query: string | number[],
  numResults = 10,
  updateEditorProgress = false,
): Promise<EmbeddingResult[]> {
  await initIfNeeded();

  // Allow passing in pre-generated embeddings, but generate them if its a string
  const startEmbeddingGeneration = Date.now();
  const queryEmbedding = typeof query === "string" ? await generateEmbeddings(query) : query;
  const endEmbeddingGeneration = Date.now();
  console.log(
    `searchEmbeddings: Query embedding generation took ${endEmbeddingGeneration - startEmbeddingGeneration} ms`,
  );

  const startRetrievingEmbeddings = Date.now();
  const embeddings = await getAllEmbeddings();
  const endRetrievingEmbeddings = Date.now();

  console.log(
    `Retrieved ${embeddings.length} embeddings in ${endRetrievingEmbeddings - startRetrievingEmbeddings} ms`,
  );

  let progressText = "";
  let progressStartPos = 0;

  if (updateEditorProgress) {
    progressText = `Retrieved ${embeddings.length} embeddings in ${
      endRetrievingEmbeddings - startRetrievingEmbeddings
    } ms\n\n`;
    progressStartPos = (await editor.getText()).length;
    await editor.replaceRange(progressStartPos, progressStartPos, progressText);
  }

  const results: EmbeddingResult[] = [];
  let lastUpdateTime = Date.now();
  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    if (!canIndexPage(embedding.page)) {
      // Even if we have previously indexed a page, skip it if it should be excluded
      continue;
    }

    results.push({
      page: embedding.page,
      ref: embedding.ref,
      text: embedding.text,
      similarity: cosineSimilarity(queryEmbedding, embedding.embedding),
    });

    // Update progress on page based on time or every 100 embeddings
    // This actually slows the overall search down a bit, but I think it will
    // prevent more timeout issues and at least show what its doing.
    if (
      updateEditorProgress &&
      (i % 100 === 0 || Date.now() - lastUpdateTime >= 100)
    ) {
      const pageLength = progressStartPos + progressText.length;
      progressText = `\n\nProcessed ${i + 1} of ${embeddings.length} embeddings...\n\n`;
      await editor.replaceRange(progressStartPos, pageLength, progressText);
      lastUpdateTime = Date.now();
    }

    if (updateEditorProgress && i >= embeddings.length - 1) {
      const pageLength = progressStartPos + progressText.length;
      await editor.replaceRange(progressStartPos, pageLength, "");
    }
  }

  console.log(
    `Finished searching embeddings in ${Date.now() - startRetrievingEmbeddings} ms`,
  );

  if (aiSettings.indexSummary) {
    const startRetrievingSummaries = Date.now();
    const summaries = await getAllAISummaries();
    const endRetrievingSummaries = Date.now();

    console.log(
      `Retrieved ${summaries.length} summaries in ${endRetrievingSummaries - startRetrievingSummaries} ms`,
    );

    let progressText = "";
    let progressStartPos = 0;

    if (updateEditorProgress) {
      progressText = `Retrieved ${summaries.length} summaries in ${
        endRetrievingSummaries - startRetrievingSummaries
      } ms\n\n`;
      progressStartPos = (await editor.getText()).length;
      await editor.replaceRange(
        progressStartPos,
        progressStartPos,
        progressText,
      );
    }

    const summaryResults: EmbeddingResult[] = [];
    let lastUpdateTime = Date.now();
    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      if (!canIndexPage(summary.page)) {
        continue;
      }
      summaryResults.push({
        page: summary.page,
        ref: summary.ref,
        text: `Page Summary: ${summary.text}`,
        similarity: cosineSimilarity(queryEmbedding, summary.embedding),
      });

      // Update progress on page based on time or every 100 summaries
      if (
        updateEditorProgress &&
        (i % 100 === 0 || Date.now() - lastUpdateTime >= 100)
      ) {
        const pageLength = progressStartPos + progressText.length;
        progressText = `\n\nProcessed ${i + 1} of ${summaries.length} summaries...\n\n`;
        await editor.replaceRange(progressStartPos, pageLength, progressText);
        lastUpdateTime = Date.now();
      }

      if (updateEditorProgress && i >= summaries.length - 1) {
        const pageLength = progressStartPos + progressText.length;
        await editor.replaceRange(progressStartPos, pageLength, "");
      }
    }

    console.log(
      `Finished searching summaries in ${Date.now() - startRetrievingSummaries} ms`,
    );

    results.push(...summaryResults);
  }

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, numResults);
}

/**
 * Loop over every single summary object and calculate the cosine similarity between the query embedding and each summary object.
 * Return the most similar summary objects.
 */
export async function searchSummaryEmbeddings(
  query: string,
  numResults = 10,
): Promise<EmbeddingResult[]> {
  await initIfNeeded();
  const queryEmbedding = await generateEmbeddings(query);
  const summaries = await getAllAISummaries();

  const results: EmbeddingResult[] = summaries.map((summary) => ({
    page: summary.page,
    ref: summary.ref,
    text: summary.text,
    similarity: cosineSimilarity(queryEmbedding, summary.embedding),
  }));

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, numResults);
}

/**
 * Combine and group similar embeddings into one object per page.
 * Without this, we could easily use up the results limit from a single page.
 * With this, the user will be able to see multiple pages in addition to seeing
 * that one page may have multiple matches.
 */
export async function searchCombinedEmbeddings(
  query: string | number[],
  numResults = 10,
  minSimilarity = 0.15,
  updateEditorProgress = false,
): Promise<CombinedEmbeddingResult[]> {
  const searchResults = await searchEmbeddings(query, -1, updateEditorProgress);

  const combinedResults: { [page: string]: CombinedEmbeddingResult } = {};

  for (const result of searchResults) {
    if (result.similarity < minSimilarity) {
      continue;
    }
    if (combinedResults[result.page]) {
      combinedResults[result.page].score += result.similarity;
      combinedResults[result.page].children.push(result);
    } else {
      combinedResults[result.page] = {
        page: result.page,
        score: result.similarity,
        children: [result],
      };
    }
  }

  // Sort child embedding objects per page so the most similar show first
  for (const page in combinedResults) {
    combinedResults[page].children = combinedResults[page].children
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, numResults);
  }

  const combinedResultsArray = Object.values(combinedResults);

  // And then sort the overall page objects by score (sum of children similarities)
  return combinedResultsArray
    .sort((a, b) => b.score - a.score)
    .slice(0, numResults);
}

export async function searchEmbeddingsForChat(
  query: string | number[],
  numResults = 10,
): Promise<string> {
  try {
    const searchResults = await searchCombinedEmbeddings(query, numResults);
    let results = "";
    if (searchResults.length > 0) {
      for (const r of searchResults) {
        results += `>>${r.page}<<\n`;
        for (const child of r.children) {
          results += `> ${child.text}\n\n`;
        }
      }
    } else {
      return "No relevant pages found.";
    }
    return results;
  } catch (error) {
    console.error("Error in searchEmbeddingsForChat:", error);
    return "An error occurred during the search.";
  }
}

/**
 * Runs the search and caches results. Shows a modal while searching.
 */
export async function runSearch(phrase: string): Promise<string> {
  await initIfNeeded();

  // Show modal while searching
  await editor.showPanel(
    "modal",
    20,
    `<style>
      .ai-modal-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 10px;
        box-sizing: border-box;
      }
      .ai-modal {
        padding: 24px 32px;
        text-align: center;
        background: var(--editor-background-color, var(--root-background-color, Canvas));
        color: var(--editor-text-color, var(--root-text-color, CanvasText));
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 400px;
        width: 100%;
      }
      .ai-modal h3 { margin-top: 0; }
      .ai-modal p { margin-bottom: 0; }
    </style>
    <div class="ai-modal-wrapper">
      <div class="ai-modal">
        <h3>🤖 Searching...</h3>
        <p>Searching for "${phrase}"</p>
      </div>
    </div>`,
  );

  const pageHeader = `# Search results for "${phrase}"`;
  let text = pageHeader + "\n\n";

  try {
    if (!aiSettings.indexEmbeddings) {
      text += "> **warning** Embeddings generation is disabled.\n";
      text += "> You can enable it in the AI settings.\n\n";
      return text;
    }

    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await generateEmbeddings(phrase);
    } catch (error) {
      console.error("Error generating query vector embeddings", error);
      text += "> **error** ⚠️ Failed to generate query vector embeddings.\n";
      text += `> ${error}\n\n`;
      return text;
    }

    let results: CombinedEmbeddingResult[] = [];
    try {
      results = await searchCombinedEmbeddings(
        queryEmbedding,
        undefined,
        undefined,
        true,
      );
    } catch (error) {
      console.error("Error searching embeddings", error);
      text += "> **error** ⚠️ Failed to search through embeddings.\n";
      text += `> ${error}\n\n`;
      return text;
    }

    if (results.length === 0) {
      text += "No results found.\n\n";
    } else {
      for (const r of results) {
        text += `## [[${r.page}]]\n`;
        for (const child of r.children) {
          const childLineNo = child.ref.split("@")[1];
          const childLineNoPadded = childLineNo.padStart(4, " ");
          text += `> [[${child.ref}|${childLineNoPadded}]] | ${child.text}\n`;
        }
      }
    }

    return text;
  } finally {
    await editor.hidePanel("modal");
  }
}

/**
 * Returns cached search results for a query.
 * Used by the virtual page to display results.
 */
export function getSearchResults(query: string): string {
  const cached = cachedSearchResults.get(query);
  if (cached) {
    return cached;
  }
  return `# Search results for "${query}"\n\n> ℹ️ No search results available.\n\nUse the **AI: Search** command to search.\n`;
}

/**
 * Ask the user for a search query, run the search, and navigate to the results page.
 * Search results are provided by calculating the cosine similarity between the
 * query embedding and each indexed embedding.
 */
export async function searchCommand() {
  const phrase = await editor.prompt("Search for: ");
  if (phrase) {
    const results = await runSearch(phrase);
    cachedSearchResults.set(phrase, results);
    await editor.navigate(`${searchPrefix}${phrase}`);
  }
}
