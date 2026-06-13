import { clientStore, markdown, space } from "@silverbulletmd/silverbullet/syscalls";
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
import { log } from "./utils.ts";
import {
  buildProxyHeaders,
  buildProxyUrl,
  readResponseHeader,
  readStatus,
} from "./proxy.ts";
import type { ChatImage } from "./types.ts";

// nativeFetch is the original fetch before SilverBullet's proxy monkey-patching;
// we build the proxy URL/headers ourselves, so call it directly when not proxying.
// Wrapped so it resolves at call time with the global scope as `this`.
const nativeFetch: typeof fetch = (url, init) =>
  ((globalThis as any).nativeFetch as typeof fetch)(url, init);

const DEFAULT_MAX_IMAGE_MB = 10;

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const REMOTE_CACHE_PREFIX = "ai.remoteImageCache.";

function maxImageBytes(): number {
  const mb = aiSettings?.chat?.maxImageSizeMB ?? DEFAULT_MAX_IMAGE_MB;
  return mb * 1024 * 1024;
}

export function imageMimeFromPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? IMAGE_MIME_TYPES[ext] : undefined;
}

async function fetchRemoteImage(url: string): Promise<ChatImage | null> {
  const cacheKey = `${REMOTE_CACHE_PREFIX}${url}`;
  const cached = (await clientStore.get(cacheKey)) as {
    dataUrl: string;
    mimeType: string;
  } | null;
  if (cached) {
    return { name: url, mimeType: cached.mimeType, url: cached.dataUrl };
  }

  try {
    // Route through SilverBullet's proxy (like every other outbound fetch) so
    // cross-origin image hosts aren't blocked by browser CORS.
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
    if (bytes.length > maxImageBytes()) {
      throw new Error(`too large (${bytes.length} bytes)`);
    }
    const dataUrl = base64EncodedDataUrl(mimeType, bytes);
    await clientStore.set(cacheKey, { dataUrl, mimeType });
    return { name: url, mimeType, url: dataUrl };
  } catch (error) {
    log.warn(`Failed to fetch remote image ${url}:`, error);
    return null;
  }
}

/**
 * Finds image links (`![alt](url)` and `![[doc.png]]`) in markdown content and
 * loads them as data URLs for sending to vision models.
 */
export async function extractImagesFromMarkdown(
  content: string,
  currentPage: string,
  seen: Set<string> = new Set(),
): Promise<ChatImage[]> {
  const images: ChatImage[] = [];

  const tree = await markdown.parseMarkdown(content);
  for (const node of collectNodesOfType(tree, "Image")) {
    const transclusion = parseTransclusion(renderToText(node));
    if (!transclusion) continue;

    let url = transclusion.url;
    if (!isLocalURL(url)) {
      if (!aiSettings?.chat?.downloadRemoteImages) {
        log.debug(
          `Skipping remote image (downloadRemoteImages is off): ${url}`,
        );
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      const remote = await fetchRemoteImage(url);
      if (remote) images.push(remote);
      continue;
    }

    if (transclusion.linktype === "markdownlink") {
      url = resolveMarkdownLink(currentPage, decodeURI(url));
    }
    const mimeType = imageMimeFromPath(url);
    if (!mimeType || seen.has(url)) continue;
    seen.add(url);

    try {
      const bytes = await space.readDocument(url);
      if (bytes.length > maxImageBytes()) {
        throw new Error(`too large (${bytes.length} bytes)`);
      }
      images.push({
        name: url,
        mimeType,
        url: base64EncodedDataUrl(mimeType, bytes),
      });
    } catch (error) {
      log.warn(`Failed to read image ${url}:`, error);
    }
  }

  return images;
}
