import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { base64Encode } from "@silverbulletmd/silverbullet/lib/crypto";
import { initializeOpenAI } from "./init.ts";
import { extractImagesFromMarkdown, imageMimeFromPath } from "./images.ts";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

async function setup(config: Record<string, unknown> = {}) {
  await syscall("mock.setConfig", "ai", config);
  await initializeOpenAI(false);
}

beforeEach(async () => {
  await syscall("mock.clearClientStore");
  await syscall("mock.setDocument", "notes/img.png", PNG_BYTES);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("imageMimeFromPath maps known extensions", () => {
  expect(imageMimeFromPath("a/b/photo.PNG")).toEqual("image/png");
  expect(imageMimeFromPath("photo.jpeg")).toEqual("image/jpeg");
  expect(imageMimeFromPath("doc.pdf")).toEqual(undefined);
});

test("extracts markdown link relative to current page", async () => {
  await setup();
  const images = await extractImagesFromMarkdown("Look: ![alt](img.png)", "notes/Page");
  expect(images).toEqual([{
    name: "notes/img.png",
    mimeType: "image/png",
    url: `data:image/png;base64,${base64Encode(PNG_BYTES)}`,
  }]);
});

test("extracts wikilink image with absolute path", async () => {
  await setup();
  const images = await extractImagesFromMarkdown("![[notes/img.png]]", "Other Page");
  expect(images.length).toEqual(1);
  expect(images[0].name).toEqual("notes/img.png");
});

test("skips non-image links and missing documents", async () => {
  await setup();
  const images = await extractImagesFromMarkdown(
    "![[notes/doc.pdf]] ![alt](missing.png) [[Some Page]]",
    "notes/Page",
  );
  expect(images).toEqual([]);
});

test("skips images larger than the configured max", async () => {
  await setup({ chat: { maxImageSizeMB: 0.001 } });
  await syscall("mock.setDocument", "big.png", new Uint8Array(2048));
  const images = await extractImagesFromMarkdown("![[big.png]]", "Page");
  expect(images).toEqual([]);
});

test("dedupes images via shared seen set", async () => {
  await setup();
  const seen = new Set<string>();
  const first = await extractImagesFromMarkdown("![[notes/img.png]]", "Page", seen);
  const second = await extractImagesFromMarkdown("![alt](notes/img.png) ![[notes/img.png]]", "Page", seen);
  expect(first.length).toEqual(1);
  expect(second).toEqual([]);
});

test("skips remote images when downloadRemoteImages is off", async () => {
  await setup();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const images = await extractImagesFromMarkdown("![alt](https://example.com/cat.png)", "Page");
  expect(images).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("downloads and caches remote images when enabled", async () => {
  await setup({ chat: { downloadRemoteImages: true } });
  // Simulate SilverBullet's proxy reply: its own 200, upstream status/headers
  // carried in x-proxy-* headers.
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    headers: new Headers({
      "x-proxy-status-code": "200",
      "x-proxy-header-content-type": "image/png",
    }),
    arrayBuffer: () => Promise.resolve(PNG_BYTES.buffer),
  });
  vi.stubGlobal("fetch", fetchMock);

  const url = "https://example.com/cat.png";
  const first = await extractImagesFromMarkdown(`![alt](${url})`, "Page");
  expect(first).toEqual([{
    name: url,
    mimeType: "image/png",
    url: `data:image/png;base64,${base64Encode(PNG_BYTES)}`,
  }]);
  expect(fetchMock.mock.calls[0][0]).toContain("/.proxy/");

  const second = await extractImagesFromMarkdown(`![alt](${url})`, "Page");
  expect(second).toEqual(first);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("rejects remote responses without an image content type", async () => {
  await setup({ chat: { downloadRemoteImages: true } });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({
        "x-proxy-status-code": "200",
        "x-proxy-header-content-type": "text/html",
      }),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    }),
  );
  const images = await extractImagesFromMarkdown("![alt](https://example.com/page)", "Page");
  expect(images).toEqual([]);
});
