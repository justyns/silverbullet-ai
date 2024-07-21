import type { FileMeta, IndexTreeEvent } from "$sb/types.ts";
import type {
  AISummaryObject,
  CombinedEmbeddingResult,
  EmbeddingObject,
  EmbeddingResult,
} from "./types.ts";
import { indexObjects, queryObjects } from "$sbplugs/index/plug_api.ts";
import { renderToText } from "$sb/lib/tree.ts";
import { currentEmbeddingProvider, initIfNeeded } from "../src/init.ts";
import { log } from "./utils.ts";
import { editor, system } from "$sb/syscalls.ts";
import { aiSettings, configureSelectedModel } from "./init.ts";
import * as cache from "./cache.ts";

/**
 * Generate embeddings for each paragraph in a page, and then indexes
 * them.
 */
export async function indexEmbeddings({ name: page, tree }: IndexTreeEvent) {
  // TODO: Can we sync indexes from server to client?  Without this, each client generates its own embeddings and summaries
  if (await system.getEnv() !== "server") {
    return;
  }

  await initIfNeeded();

  // Only index pages if the user enabled it, and skip anything they want to exclude
  const excludePages = [
    "SETTINGS",
    "SECRETS",
    ...aiSettings.indexEmbeddingsExcludePages,
  ];
  if (
    !aiSettings.indexEmbeddings ||
    excludePages.includes(page) ||
    page.startsWith("_") ||
    page.startsWith("Library/") ||
    /\.conflicted\.\d+$/.test(page)
  ) {
    return;
  }

  if (!tree.children) {
    return;
  }

  // Splitting embeddings up by paragraph, but there could be better ways to do it
  //     ^ Some places suggest a sliding window so that each chunk has some overlap with the previous/next chunk
  //     ^ But in some limited testing, this seems to work alright only split by paragraph
  const paragraphs = tree.children.filter((node) => node.type === "Paragraph");

  const objects: EmbeddingObject[] = [];

  for (const paragraph of paragraphs) {
    const paragraphText = renderToText(paragraph).trim();

    // Skip empty paragraphs and lines with less than 10 characters (TODO: remove that limit?)
    if (!paragraphText || paragraphText.length < 10) {
      continue;
    }

    if (
      aiSettings.indexEmbeddingsExcludeStrings.some((s) =>
        paragraphText.includes(s)
      )
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

    // log("any", "Indexing embedding object", embeddingObject);
    objects.push(embeddingObject);
  }

  await indexObjects<EmbeddingObject>(page, objects);

  log(
    "any",
    `AI: Indexed ${objects.length} embedding objects for page ${page}`,
  );
}

/**
 * Generate a summary for a page, and then indexes it.
 */
export async function indexSummary({ name: page, tree }: IndexTreeEvent) {
  // TODO: Can we sync indexes from server to client?  Without this, each client generates its own embeddings and summaries
  if (await system.getEnv() !== "server") {
    return;
  }
  await initIfNeeded();

  // Only index pages if the user enabled it, and skip anything they want to exclude
  const excludePages = [
    "SETTINGS",
    "SECRETS",
    ...aiSettings.indexEmbeddingsExcludePages,
  ];
  if (
    !aiSettings.indexEmbeddings ||
    !aiSettings.indexSummary ||
    excludePages.includes(page) ||
    page.startsWith("_")
  ) {
    return;
  }

  if (!tree.children) {
    return;
  }

  const pageText = renderToText(tree);
  const summaryModel = aiSettings.textModels.find((model) =>
    model.name === aiSettings.indexSummaryModelName
  );
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

  //   console.log("summary", summary);

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

  await indexObjects<AISummaryObject>(page, [summaryObject]);

  log(
    "any",
    `AI: Indexed summary for page ${page}`,
  );
}

export async function getAllEmbeddings(): Promise<EmbeddingObject[]> {
  return (await queryObjects<EmbeddingObject>("embedding", {}));
}

export async function getAllAISummaries(): Promise<AISummaryObject[]> {
  return (await queryObjects<AISummaryObject>("aiSummary", {}));
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
  query: string,
  numResults = 10,
): Promise<EmbeddingResult[]> {
  // TODO: Is there a way to always search on the server instead of using the client's index?
  await initIfNeeded();
  const queryEmbedding = await currentEmbeddingProvider.generateEmbeddings({
    text: query,
  });
  const embeddings = await getAllEmbeddings();

  const results: EmbeddingResult[] = embeddings.map((embedding) => ({
    page: embedding.page,
    ref: embedding.ref,
    text: embedding.text,
    similarity: cosineSimilarity(queryEmbedding, embedding.embedding),
  }));

  if (aiSettings.indexSummary) {
    const summaries = await getAllAISummaries();
    const summaryResults: EmbeddingResult[] = summaries.map((summary) => ({
      page: summary.page,
      ref: summary.ref,
      text: `Page Summary: ${summary.text}`,
      similarity: cosineSimilarity(queryEmbedding, summary.embedding),
    }));
    results.push(...summaryResults);
  }

  //   log("client", "AI: searchEmbeddings", results);

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
  const queryEmbedding = await currentEmbeddingProvider.generateEmbeddings({
    text: query,
  });
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
  query: string,
  numResults = 10,
  minSimilarity = 0.15,
): Promise<CombinedEmbeddingResult[]> {
  const searchResults = await searchEmbeddings(query, -1);
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

export async function debugSearchEmbeddings() {
  const text = await editor.prompt("Enter some text to search for:");
  if (!text) {
    await editor.flashNotification("No text entered.", "error");
    return;
  }

  const searchResults = await searchCombinedEmbeddings(text);
  await editor.flashNotification(`Found ${searchResults.length} results`);
  log("any", "AI: Search results", searchResults);
  //   await editor.insertAtCursor(
  //     `\n\nSearch results: ${JSON.stringify(formattedResults)}`,
  //   );
}

const searchPrefix = "🤖 ";

/**
 * Display "AI: Search" results.
 */
export async function readFileEmbeddings(
  name: string,
): Promise<{ data: Uint8Array; meta: FileMeta }> {
  const phrase = name.substring(
    searchPrefix.length,
    name.length - ".md".length,
  );
  const results = await searchCombinedEmbeddings(phrase);
  log("client", "AI: Embedding search results", results);
  let text = `# Embedding search results for "${phrase}"\n\n`;
  if (!aiSettings.indexEmbeddings) {
    text += "> **warning** Embeddings generation is disabled.\n";
    text += "> You can enable it in the AI settings.\n\n\n";
  }
  for (const r of results) {
    text += `* [[${r.page}]] (score ${r.score})\n`;
    for (const child of r.children) {
      text += `  * [[${child.ref}]] (similarity ${child.similarity})\n`;
      text += `    > ${child.text}\n`;
    }
  }

  return {
    data: new TextEncoder().encode(text),
    meta: {
      name,
      contentType: "text/markdown",
      size: text.length,
      created: 0,
      lastModified: 0,
      perm: "ro",
    },
  };
}

export function getFileMetaEmbeddings(name: string): FileMeta {
  return {
    name,
    contentType: "text/markdown",
    size: -1,
    created: 0,
    lastModified: 0,
    perm: "ro",
  };
}

/**
 * Ask the user for a search query, and then navigate to the search results page.
 * Search results are provided by calculating the cosine similarity between the
 * query embedding and each indexed embedding.
 */
export async function searchCommand() {
  const phrase = await editor.prompt("Search for: ");
  if (phrase) {
    await editor.navigate({ page: `${searchPrefix}${phrase}` });
  }
}
