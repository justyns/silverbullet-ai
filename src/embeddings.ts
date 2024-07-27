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
import { log, supportsServerProxyCall } from "./utils.ts";
import { editor, system } from "$sb/syscalls.ts";
import { aiSettings, configureSelectedModel } from "./init.ts";
import * as cache from "./cache.ts";

const searchPrefix = "🤖 ";

/**
 * Check whether a page is allowed to be indexed or not.
 */
function canIndexPage(pageName: string): boolean {
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

/**
 * Generate embeddings for each paragraph in a page, and then indexes
 * them.
 */
export async function indexEmbeddings({ name: page, tree }: IndexTreeEvent) {
  if (await system.getEnv() !== "server") {
    return;
  }

  await initIfNeeded();

  if (!canIndexPage(page)) {
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

  const startTime = Date.now();

  // TODO: Filter out images, or send images to a vision model to get a summary and index that instead
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

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;

  log(
    "any",
    `AI: Indexed ${objects.length} embedding objects for page ${page} in ${duration} seconds`,
  );
}

/**
 * Generate a summary for a page, and then indexes it.
 */
export async function indexSummary({ name: page, tree }: IndexTreeEvent) {
  if (await system.getEnv() !== "server") {
    return;
  }
  await initIfNeeded();

  if (!aiSettings.indexSummary) {
    return;
  }

  if (!canIndexPage(page)) {
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
  if (await supportsServerProxyCall()) {
    return (await syscall(
      "system.invokeFunctionOnServer",
      "index.queryObjects",
      "embedding",
      {},
    ));
  } else {
    return (await queryObjects<EmbeddingObject>("embedding", {}));
  }
}

export async function getAllAISummaries(): Promise<AISummaryObject[]> {
  if (await supportsServerProxyCall()) {
    return (await syscall(
      "system.invokeFunctionOnServer",
      "index.queryObjects",
      "aiSummary",
      {},
    ));
  } else {
    return (await queryObjects<AISummaryObject>("aiSummary", {}));
  }
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
  const queryEmbedding = typeof query === "string"
    ? await currentEmbeddingProvider.generateEmbeddings({ text: query })
    : query;
  const endEmbeddingGeneration = Date.now();
  console.log(
    `searchEmbeddings: Query embedding generation took ${
      endEmbeddingGeneration - startEmbeddingGeneration
    } ms`,
  );

  const startRetrievingEmbeddings = Date.now();
  const embeddings = await getAllEmbeddings();
  const endRetrievingEmbeddings = Date.now();

  console.log(
    `Retrieved ${embeddings.length} embeddings in ${
      endRetrievingEmbeddings - startRetrievingEmbeddings
    } ms`,
  );

  let progressText = "";
  let progressStartPos = 0;

  if (updateEditorProgress && (await system.getEnv()) !== "server") {
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
      (i % 100 === 0 || Date.now() - lastUpdateTime >= 100) &&
      (await system.getEnv()) !== "server"
    ) {
      const pageLength = progressStartPos + progressText.length;
      progressText = `\n\nProcessed ${
        i + 1
      } of ${embeddings.length} embeddings...\n\n`;
      await editor.replaceRange(progressStartPos, pageLength, progressText);
      lastUpdateTime = Date.now();
    }
  }

  console.log(
    `Finished searching embeddings in ${
      Date.now() - startRetrievingEmbeddings
    } ms`,
  );

  if (aiSettings.indexSummary) {
    const startRetrievingSummaries = Date.now();
    const summaries = await getAllAISummaries();
    const endRetrievingSummaries = Date.now();

    console.log(
      `Retrieved ${summaries.length} summaries in ${
        endRetrievingSummaries - startRetrievingSummaries
      } ms`,
    );

    let progressText = "";
    let progressStartPos = 0;

    if (updateEditorProgress && (await system.getEnv()) !== "server") {
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
        (i % 100 === 0 || Date.now() - lastUpdateTime >= 100) &&
        (await system.getEnv()) !== "server"
      ) {
        const pageLength = progressStartPos + progressText.length;
        progressText = `\n\nProcessed ${
          i + 1
        } of ${summaries.length} summaries...\n\n`;
        await editor.replaceRange(progressStartPos, pageLength, progressText);
        lastUpdateTime = Date.now();
      }
    }

    console.log(
      `Finished searching summaries in ${
        Date.now() - startRetrievingSummaries
      } ms`,
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
  query: string | number[],
  numResults = 10,
  minSimilarity = 0.15,
  updateEditorProgress = false,
): Promise<CombinedEmbeddingResult[]> {
  let searchResults;

  searchResults = await searchEmbeddings(query, -1, updateEditorProgress);

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
}

/**
 * Display an empty "AI: Search" page
 */
export function readFileEmbeddings(
  name: string,
): { data: Uint8Array; meta: FileMeta } {
  return {
    data: new TextEncoder().encode(""),
    meta: {
      name,
      contentType: "text/markdown",
      size: 0,
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

// Just return nothing to prevent saving a file
export function writeFileEmbeddings(
  name: string,
): FileMeta {
  return getFileMetaEmbeddings(name);
}

/**
 * Actual search logic for "AI: Search" page. This gets triggered
 * by the pageLoaded event. Once triggered, the search starts.
 *
 * We are doing it this way instead of in eadFileEmbeddings to have
 * more control over the UI.
 */
export async function updateSearchPage() {
  const page = await editor.getCurrentPage();
  if (page.startsWith(searchPrefix)) {
    await initIfNeeded();
    const phrase = page.substring(searchPrefix.length);
    const pageHeader = `# Search results for "${phrase}"`;
    let text = pageHeader + "\n\n";
    if (!aiSettings.indexEmbeddings) {
      text += "> **warning** Embeddings generation is disabled.\n";
      text += "> You can enable it in the AI settings.\n\n\n";
      await editor.setText(text);
      return;
    }
    let loadingText = `${pageHeader}\n\nSearching for "${phrase}"...`;
    loadingText += "\nGenerating query vector embeddings..";
    await editor.setText(loadingText);
    const queryEmbedding = await currentEmbeddingProvider.generateEmbeddings({
      text: phrase,
    });
    loadingText += "\nSearching for similar embeddings...";
    await editor.setText(loadingText);

    const results = await searchCombinedEmbeddings(
      queryEmbedding,
      undefined,
      undefined,
      true,
    );
    const pageLength = loadingText.length;
    text = pageHeader + "\n\n";

    if (results.length === 0) {
      text += "No results found.\n\n";
    }

    for (const r of results) {
      text += `## [[${r.page}]]\n`;
      for (const child of r.children) {
        const childLineNo = child.ref.split("@")[1];
        const childLineNoPadded = childLineNo.padStart(4, " ");
        text += `> [[${child.ref}|${childLineNoPadded}]] | ${child.text}\n`;
      }
    }
    // Some reason editor.setText doesn't work again, maybe a race condition
    await editor.replaceRange(0, pageLength, text);
  }
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
