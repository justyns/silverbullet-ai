import { afterEach, beforeEach, expect, test, vi } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { base64Encode } from "@silverbulletmd/silverbullet/lib/crypto";
import { initializeOpenAI } from "./init.ts";
import {
  attachmentKind,
  extractFilesFromMarkdown,
  getFileHandlerExts,
  mimeFromPath,
  resolveFileToAttachment,
} from "./files.ts";
import type { AttachmentKind } from "./types.ts";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
// 3 bytes → padding-free base64, so the data URL passed into a Lua handler
// survives the test mock's naive Lua-literal parser.
const SMALL_BYTES = new Uint8Array([1, 2, 3]);
const IMAGES = new Set<AttachmentKind>(["image"]);
const IMAGES_DOCS = new Set<AttachmentKind>(["image", "document"]);
const NO_HANDLERS = new Set<string>();

function dataUrl(mime: string, bytes: Uint8Array) {
  return `data:${mime};base64,${base64Encode(bytes)}`;
}

async function setup(config: Record<string, unknown> = {}) {
  await syscall("mock.setConfig", "ai", config);
  await initializeOpenAI(false);
}

function extract(
  content: string,
  page: string,
  opts: {
    kinds?: Set<AttachmentKind>;
    handlers?: Set<string>;
    seen?: Set<string>;
  } = {},
) {
  return extractFilesFromMarkdown(
    content,
    page,
    opts.kinds ?? IMAGES,
    opts.handlers ?? NO_HANDLERS,
    opts.seen,
  );
}

beforeEach(async () => {
  await syscall("mock.clearClientStore");
  await syscall("mock.clearLuaFunctions");
  await syscall("mock.setDocument", "notes/img.png", PNG_BYTES);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("mimeFromPath maps known extensions", () => {
  expect(mimeFromPath("a/b/photo.PNG")).toEqual("image/png");
  expect(mimeFromPath("photo.jpeg")).toEqual("image/jpeg");
  expect(mimeFromPath("report.pdf")).toEqual("application/pdf");
  expect(mimeFromPath("notes/data.csv")).toEqual(undefined);
});

test("attachmentKind classifies mime types", () => {
  expect(attachmentKind("image/png")).toEqual("image");
  expect(attachmentKind("application/pdf")).toEqual("document");
  expect(attachmentKind("text/plain")).toEqual(undefined);
});

test("extracts markdown link relative to current page", async () => {
  await setup();
  const files = await extract("Look: ![alt](img.png)", "notes/Page");
  expect(files).toEqual([{
    name: "notes/img.png",
    type: "image",
    binary: { mimeType: "image/png", url: dataUrl("image/png", PNG_BYTES) },
    alt: "alt",
  }]);
});

test("extracts wikilink image with absolute path", async () => {
  await setup();
  const files = await extract("![[notes/img.png]]", "Other Page");
  expect(files.length).toEqual(1);
  expect(files[0].name).toEqual("notes/img.png");
});

test("routes pdf to a document attachment when documents enabled", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/report.pdf", SMALL_BYTES);
  const files = await extract("![[notes/report.pdf]]", "Page", {
    kinds: IMAGES_DOCS,
  });
  expect(files).toEqual([{
    name: "notes/report.pdf",
    type: "document",
    binary: {
      mimeType: "application/pdf",
      url: dataUrl("application/pdf", SMALL_BYTES),
    },
  }]);
});

test("skips pdf when documents are not enabled", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/report.pdf", SMALL_BYTES);
  const files = await extract("![[notes/report.pdf]]", "Page", { kinds: IMAGES });
  expect(files).toEqual([]);
});

test("skips unknown types, missing docs, and plain wikilinks", async () => {
  await setup();
  const files = await extract(
    "![[notes/data.csv]] ![alt](missing.png) [[Some Page]]",
    "notes/Page",
    { kinds: IMAGES_DOCS },
  );
  expect(files).toEqual([]);
});

test("skips files larger than the configured max", async () => {
  await setup({ chat: { maxFileSizeMB: 0.001 } });
  await syscall("mock.setDocument", "big.png", new Uint8Array(2048));
  const files = await extract("![[big.png]]", "Page");
  expect(files).toEqual([]);
});

test("dedupes via shared seen set", async () => {
  await setup();
  const seen = new Set<string>();
  const first = await extract("![[notes/img.png]]", "Page", { seen });
  const second = await extract(
    "![alt](notes/img.png) ![[notes/img.png]]",
    "Page",
    { seen },
  );
  expect(first.length).toEqual(1);
  expect(second).toEqual([]);
});

test("runs a registered handler returning text", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/meeting.note", SMALL_BYTES);
  let received: any;
  await syscall("mock.setLuaFunction", "ai.runFileHandler", (req: any) => {
    received = req;
    return { text: "transcribed notes" };
  });
  const files = await extract("![[notes/meeting.note]]", "Page", {
    kinds: new Set(),
    handlers: new Set(["note"]),
  });
  expect(received.ext).toEqual("note");
  expect(received.file.path).toEqual("notes/meeting.note");
  expect(files).toEqual([{
    name: "notes/meeting.note",
    type: "file",
    content: "transcribed notes",
  }]);
});

test("runs a handler returning a converted binary", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/photo.heic", SMALL_BYTES);
  await syscall("mock.setLuaFunction", "ai.runFileHandler", () => ({
    mimeType: "image/png",
    data: base64Encode(PNG_BYTES),
  }));
  const files = await extract("![[notes/photo.heic]]", "Page", {
    kinds: IMAGES,
    handlers: new Set(["heic"]),
  });
  expect(files).toEqual([{
    name: "notes/photo.heic",
    type: "image",
    binary: { mimeType: "image/png", url: dataUrl("image/png", PNG_BYTES) },
  }]);
});

test("skips a handler binary whose kind is not enabled", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/photo.heic", SMALL_BYTES);
  await syscall("mock.setLuaFunction", "ai.runFileHandler", () => ({
    mimeType: "image/png",
    data: base64Encode(PNG_BYTES),
  }));
  const files = await extract("![[notes/photo.heic]]", "Page", {
    kinds: new Set(["document"]),
    handlers: new Set(["heic"]),
  });
  expect(files).toEqual([]);
});

test("skips a handler that throws", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/x.note", SMALL_BYTES);
  await syscall("mock.setLuaFunction", "ai.runFileHandler", () => {
    throw new Error("boom");
  });
  const files = await extract("![[notes/x.note]]", "Page", {
    kinds: new Set(),
    handlers: new Set(["note"]),
  });
  expect(files).toEqual([]);
});

test("getFileHandlerExts reads ai.listFileHandlers (dot/case normalized)", async () => {
  await setup();
  await syscall("mock.setLuaFunction", "ai.listFileHandlers", () => [".note", "CSV"]);
  expect(await getFileHandlerExts()).toEqual(new Set(["note", "csv"]));
});

test("getFileHandlerExts returns empty when unavailable", async () => {
  await setup();
  expect(await getFileHandlerExts()).toEqual(new Set());
});

test("resolveFileToAttachment resolves a local image (view_file path)", async () => {
  await setup();
  const a = await resolveFileToAttachment("notes/img.png", IMAGES, NO_HANDLERS);
  expect(a).toEqual({
    name: "notes/img.png",
    type: "image",
    binary: { mimeType: "image/png", url: dataUrl("image/png", PNG_BYTES) },
  });
});

test("resolveFileToAttachment returns null when the kind isn't supported", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/report.pdf", SMALL_BYTES);
  const a = await resolveFileToAttachment("notes/report.pdf", IMAGES, NO_HANDLERS);
  expect(a).toBeNull();
});

test("resolveFileToAttachment uses a registered handler", async () => {
  await setup();
  await syscall("mock.setDocument", "notes/x.note", SMALL_BYTES);
  await syscall("mock.setLuaFunction", "ai.runFileHandler", () => ({
    text: "ocr text",
  }));
  const a = await resolveFileToAttachment("notes/x.note", new Set(), new Set(["note"]));
  expect(a).toEqual({ name: "notes/x.note", type: "file", content: "ocr text" });
});

test("skips remote files when downloadRemoteImages is off", async () => {
  await setup();
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const files = await extract("![alt](https://example.com/cat.png)", "Page");
  expect(files).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("downloads and caches remote images through the proxy", async () => {
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
  const first = await extract(`![alt](${url})`, "Page");
  expect(first).toEqual([{
    name: url,
    type: "image",
    binary: { mimeType: "image/png", url: dataUrl("image/png", PNG_BYTES) },
    alt: "alt",
  }]);
  expect(fetchMock.mock.calls[0][0]).toContain("/.proxy/");

  const second = await extract(`![alt](${url})`, "Page");
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
  const files = await extract("![alt](https://example.com/page)", "Page");
  expect(files).toEqual([]);
});
