import {
  clientStore,
  markdown,
  space,
} from "@silverbulletmd/silverbullet/syscalls";
import {
  isLocalURL,
  resolveMarkdownLink,
} from "@silverbulletmd/silverbullet/lib/resolve";
import { parseTransclusion } from "@silverbulletmd/silverbullet/lib/transclusion";
import { base64EncodedDataUrl } from "@silverbulletmd/silverbullet/lib/crypto";
import {
  collectNodesOfType,
  renderToText,
} from "@silverbulletmd/silverbullet/lib/tree";

import { aiSettings, currentModel } from "./init.ts";
import { invokeSpaceLuaFunction, log } from "./utils.ts";
import {
  buildProxyHeaders,
  buildProxyUrl,
  readResponseHeader,
  readStatus,
} from "./proxy.ts";
import type { Attachment, AttachmentKind } from "./types.ts";

// nativeFetch is the original fetch before SilverBullet's proxy monkey-patching;
// we build the proxy URL/headers ourselves, so call it directly when not proxying.
// Wrapped so it resolves at call time with the global scope as `this`.
const nativeFetch: typeof fetch = (url, init) =>
  ((globalThis as any).nativeFetch as typeof fetch)(url, init);

const DEFAULT_MAX_FILE_MB = 10;

// Built-in file types that map directly to a native provider part.
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

const REMOTE_CACHE_PREFIX = "ai.remoteImageCache.";

function maxFileBytes(): number {
  const mb = aiSettings?.chat?.maxFileSizeMB ?? DEFAULT_MAX_FILE_MB;
  return mb * 1024 * 1024;
}

function extOf(path: string): string | undefined {
  const dot = path.lastIndexOf(".");
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return dot > slash && dot >= 0
    ? path.slice(dot + 1).toLowerCase()
    : undefined;
}

export function mimeFromPath(path: string): string | undefined {
  const ext = extOf(path);
  return ext ? MIME_BY_EXT[ext] : undefined;
}

export function attachmentKind(mimeType: string): AttachmentKind | undefined {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "document";
  return undefined;
}

/**
 * Extensions registered as user file handlers in `ai.fileHandlers`. Looked up
 * once per enrichment..
 */
export async function getFileHandlerExts(): Promise<Set<string>> {
  try {
    const keys = await invokeSpaceLuaFunction<unknown>(
      "ai.listFileHandlers",
      {},
    );
    const arr = Array.isArray(keys)
      ? keys
      : keys && typeof keys === "object"
        ? Object.values(keys as Record<string, unknown>)
        : [];
    return new Set(arr.map((k) => String(k).replace(/^\./, "").toLowerCase()));
  } catch (error) {
    log.debug("ai.listFileHandlers() unavailable:", error);
    return new Set();
  }
}

async function fetchRemoteImage(url: string): Promise<Attachment | null> {
  const cacheKey = `${REMOTE_CACHE_PREFIX}${url}`;
  const cached = (await clientStore.get(cacheKey)) as {
    dataUrl: string;
    mimeType: string;
  } | null;
  if (cached) {
    return {
      name: url,
      type: "image",
      binary: { mimeType: cached.mimeType, url: cached.dataUrl },
    };
  }

  try {
    const useProxy = currentModel?.useProxy ?? true;
    const response = await (useProxy ? fetch : nativeFetch)(
      useProxy ? buildProxyUrl(url) : url,
      useProxy ? { headers: buildProxyHeaders() } : {},
    );
    const status = readStatus(response, useProxy);
    if (status < 200 || status >= 300) {
      throw new Error(`HTTP ${status}`);
    }
    const mimeType =
      readResponseHeader(response, "content-type", useProxy)?.split(";")[0] ||
      "";
    if (!mimeType.startsWith("image/")) {
      throw new Error(`not an image (${mimeType})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > maxFileBytes()) {
      throw new Error(`too large (${bytes.length} bytes)`);
    }
    const dataUrl = base64EncodedDataUrl(mimeType, bytes);
    await clientStore.set(cacheKey, { dataUrl, mimeType });
    return { name: url, type: "image", binary: { mimeType, url: dataUrl } };
  } catch (error) {
    log.warn(`Failed to fetch remote image ${url}:`, error);
    return null;
  }
}

async function readLocalBinary(
  url: string,
  mimeType: string,
  kind: AttachmentKind,
): Promise<Attachment | null> {
  try {
    const bytes = await space.readDocument(url);
    if (bytes.length > maxFileBytes()) {
      throw new Error(`too large (${bytes.length} bytes)`);
    }
    return {
      name: url,
      type: kind,
      binary: { mimeType, url: base64EncodedDataUrl(mimeType, bytes) },
    };
  } catch (error) {
    log.warn(`Failed to read file ${url}:`, error);
    return null;
  }
}

async function runFileHandler(
  ext: string,
  url: string,
  enabledKinds: Set<AttachmentKind>,
): Promise<Attachment | null> {
  const mimeType = mimeFromPath(url) ?? "application/octet-stream";
  let bytes: Uint8Array;
  try {
    bytes = await space.readDocument(url);
  } catch (error) {
    log.warn(`Failed to read file ${url} for handler:`, error);
    return null;
  }
  if (bytes.length > maxFileBytes()) {
    log.warn(`File ${url} too large for handler (${bytes.length} bytes)`);
    return null;
  }
  const dataUrl = base64EncodedDataUrl(mimeType, bytes);

  let result: any;
  try {
    result = await invokeSpaceLuaFunction("ai.runFileHandler", {
      ext,
      file: { path: url, mimeType, dataUrl },
    });
  } catch (error) {
    log.warn(`File handler for .${ext} failed on ${url}:`, error);
    return null;
  }

  if (result && typeof result === "object") {
    if (typeof result.text === "string") {
      return { name: url, type: "file", content: result.text };
    }
    if (
      typeof result.mimeType === "string" &&
      typeof result.data === "string"
    ) {
      const kind = attachmentKind(result.mimeType);
      if (!kind || !enabledKinds.has(kind)) {
        log.warn(
          `Handler for .${ext} returned ${result.mimeType}, which this model can't take; skipping`,
        );
        return null;
      }
      return {
        name: url,
        type: kind,
        binary: {
          mimeType: result.mimeType,
          url: `data:${result.mimeType};base64,${result.data}`,
        },
      };
    }
  }
  return null;
}

/**
 * Resolves a single local path into an Attachment
 * Returns null when the file isn't deliverable to the current model.
 */
export async function resolveFileToAttachment(
  path: string,
  kinds: Set<AttachmentKind>,
  handlerExts: Set<string>,
): Promise<Attachment | null> {
  const ext = extOf(path);
  if (ext && handlerExts.has(ext)) {
    return await runFileHandler(ext, path, kinds);
  }
  const mimeType = mimeFromPath(path);
  const kind = mimeType ? attachmentKind(mimeType) : undefined;
  if (!kind || !kinds.has(kind)) return null;
  return await readLocalBinary(path, mimeType!, kind);
}

/**
 * Finds embedded files (`![alt](url)` and `![[doc.ext]]`) in markdown and resolves
 * each into a unified Attachment: built-in image/pdf become a binary part, a
 * registered `ai.fileHandlers[ext]` returns text (e.g. OCR) or a converted binary.
 * Document order is preserved so it should be cacheable.
 */
export async function extractFilesFromMarkdown(
  content: string,
  currentPage: string,
  enabledKinds: Set<AttachmentKind>,
  handlerExts: Set<string>,
  seen: Set<string> = new Set(),
): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  const tree = await markdown.parseMarkdown(content);
  for (const node of collectNodesOfType(tree, "Image")) {
    const transclusion = parseTransclusion(renderToText(node));
    if (!transclusion) continue;

    let url = transclusion.url;

    // Remote images only for now
    // TODO: maybe support remote files like pdfs too?
    if (!isLocalURL(url)) {
      if (
        !aiSettings?.chat?.downloadRemoteImages ||
        !enabledKinds.has("image")
      ) {
        log.debug(`Skipping remote file: ${url}`);
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      const remote = await fetchRemoteImage(url);
      if (remote) {
        if (transclusion.alias) remote.alt = transclusion.alias;
        attachments.push(remote);
      }
      continue;
    }

    if (transclusion.linktype === "markdownlink") {
      url = resolveMarkdownLink(currentPage, decodeURI(url));
    }
    if (seen.has(url)) continue;
    seen.add(url);

    const resolved = await resolveFileToAttachment(
      url,
      enabledKinds,
      handlerExts,
    );
    if (resolved) {
      if (transclusion.alias) resolved.alt = transclusion.alias;
      attachments.push(resolved);
    }
  }

  return attachments;
}
