import type {
  FileMeta,
  IndexTreeEvent,
  QueryProviderEvent,
} from "$sb/types.ts";
import { indexObjects, queryObjects } from "$sbplugs/index/plug_api.ts";
import { renderToText } from "$sb/lib/tree.ts";
import { ObjectValue } from "$sb/types.ts";
import { currentEmbeddingProvider, initIfNeeded } from "../src/init.ts";
import { log } from "./utils.ts";
import { editor } from "$sb/syscalls.ts";

export type EmbeddingObject = ObjectValue<
  {
    // It might be possible to retrieve the text using the page+pos, but this does make it simpler
    text: string;
    page: string;
    pos: number;
    embedding: number[];
    tag: "embedding";
  } & Record<string, any>
>;

export type EmbeddingResult = {
  page: string;
  ref: string;
  similarity: number;
  text: string;
};

export type CombinedEmbeddingResult = {
  page: string;
  score: number;
  children: EmbeddingResult[];
};

export async function indexEmbeddings({ name: page, tree }: IndexTreeEvent) {
  // TODO: Allow user to exclude certain pages
  const excludePages = ["_", "SETTINGS", "SECRETS"];
  if (excludePages.includes(page)) {
    return;
  }

  //   log("any", "AI: Indexing embeddings for", page);

  await initIfNeeded();

  // Some strings might appear in a ton of notes but aren't helpful for searching.
  // This only excludes strings that are an exact match for a paragraph.
  // TODO: Make this configurable, and maybe use regex
  const stringsToExclude = ["**user**:"];

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

    if (stringsToExclude.includes(paragraphText)) {
      continue;
    }

    // TODO: Would it help to cache embeddings?  e.g. someone reloading the same search page over and over, or updating the same page causing the same paragraphs to be re-indexed
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

export async function getAllEmbeddings(): Promise<EmbeddingObject[]> {
  return (await queryObjects<EmbeddingObject>("embedding", {}));
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

  log("any", "AI: searchEmbeddings", results);

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

// This doesnt seem to ever get triggered
export async function embeddingsQueryProvider({
  query,
}: QueryProviderEvent): Promise<any[]> {
  console.log("phraseFilter", query);
  const results: any[] = await searchCombinedEmbeddings(query);

  for (const r of results) {
    r.name = r.page;
    delete r.page;
  }

  return results;
}

const searchPrefix = "🤖 ";

export async function readFileEmbeddings(
  name: string,
): Promise<{ data: Uint8Array; meta: FileMeta }> {
  const phrase = name.substring(
    searchPrefix.length,
    name.length - ".md".length,
  );
  const results = await searchCombinedEmbeddings(phrase);
  console.log("results", results);
  let text = `# Embedding search results for "${phrase}"\n`;
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
