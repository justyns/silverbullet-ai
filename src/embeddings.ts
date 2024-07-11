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
    // TODO: Do we need to store the text?  Maybe just the page+pos is enough
    // text: string;
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
};

export async function indexEmbeddings({ name: page, tree }: IndexTreeEvent) {
  // TODO: Allow user to exclude certain pages
  const excludePatterns = ["_", "SETTINGS", "SECRETS"];
  if (excludePatterns.some((pattern) => page.includes(pattern))) {
    return;
  }

  log("any", "AI: Indexing embeddings for", page);

  await initIfNeeded();

  // Splitting embeddings up by paragraph, but there could be better ways to do it
  const paragraphs = tree.children.filter((node) => node.type === "Paragraph");

  const objects: EmbeddingObject[] = [];

  for (const paragraph of paragraphs) {
    const paragraphText = renderToText(paragraph);
    // Skip empty paragraphs and lines with less than 10 characters (TODO: remove that limit?)
    if (!paragraphText.trim() || paragraphText.length < 10) {
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
    similarity: cosineSimilarity(queryEmbedding, embedding.embedding),
  }));

  log("any", "AI: searchEmbeddings", results);

  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, numResults);
}

/**
 * Combine similar embeddings into one object per page
 */
export async function searchCombinedEmbeddings(
  query: string,
  numResults = 10,
): Promise<EmbeddingResult[]> {
  const searchResults = await searchEmbeddings(query, -1);
  const combinedResults: { [page: string]: EmbeddingResult } = {};

  for (const result of searchResults) {
    if (combinedResults[result.page]) {
      combinedResults[result.page].similarity += result.similarity;
    } else {
      combinedResults[result.page] = { ...result };
    }
  }

  const combinedResultsArray = Object.values(combinedResults);

  return combinedResultsArray
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, numResults);
}

export async function debugSearchEmbeddings() {
  const text = await editor.prompt("Enter some text to embed:");
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
    r.name = r.ref;
    delete r.ref;
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
  const text = `# Embedding search results for "${phrase}"\n${
    results
      .map((r) => `* [[${r.ref}]] (similarity ${r.similarity})`)
      .join("\n")
  }
    `;

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
