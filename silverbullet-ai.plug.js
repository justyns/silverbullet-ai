var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// https://deno.land/x/silverbullet@0.7.1/plugos/worker_runtime.ts
var runningAsWebWorker = typeof window === "undefined" && // @ts-ignore: globalThis
typeof globalThis.WebSocketPair === "undefined";
if (typeof Deno === "undefined") {
  self.Deno = {
    args: [],
    // @ts-ignore: Deno hack
    build: {
      arch: "x86_64"
    },
    env: {
      // @ts-ignore: Deno hack
      get() {
      }
    }
  };
}
var pendingRequests = /* @__PURE__ */ new Map();
var syscallReqId = 0;
function workerPostMessage(msg) {
  self.postMessage(msg);
}
if (runningAsWebWorker) {
  globalThis.syscall = async (name, ...args) => {
    return await new Promise((resolve, reject) => {
      syscallReqId++;
      pendingRequests.set(syscallReqId, { resolve, reject });
      workerPostMessage({
        type: "sys",
        id: syscallReqId,
        name,
        args
      });
    });
  };
}
function setupMessageListener(functionMapping2, manifest2) {
  if (!runningAsWebWorker) {
    return;
  }
  self.addEventListener("message", (event) => {
    (async () => {
      const data = event.data;
      switch (data.type) {
        case "inv":
          {
            const fn = functionMapping2[data.name];
            if (!fn) {
              throw new Error(`Function not loaded: ${data.name}`);
            }
            try {
              const result = await Promise.resolve(fn(...data.args || []));
              workerPostMessage({
                type: "invr",
                id: data.id,
                result
              });
            } catch (e) {
              console.error(
                "An exception was thrown as a result of invoking function",
                data.name,
                "error:",
                e.message
              );
              workerPostMessage({
                type: "invr",
                id: data.id,
                error: e.message
              });
            }
          }
          break;
        case "sysr":
          {
            const syscallId = data.id;
            const lookup = pendingRequests.get(syscallId);
            if (!lookup) {
              throw Error("Invalid request id");
            }
            pendingRequests.delete(syscallId);
            if (data.error) {
              lookup.reject(new Error(data.error));
            } else {
              lookup.resolve(data.result);
            }
          }
          break;
      }
    })().catch(console.error);
  });
  workerPostMessage({
    type: "manifest",
    manifest: manifest2
  });
}
function base64Decode(s) {
  const binString = atob(s);
  const len = binString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}
function base64Encode(buffer) {
  if (typeof buffer === "string") {
    buffer = new TextEncoder().encode(buffer);
  }
  let binary = "";
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}
async function sandboxFetch(reqInfo, options) {
  if (typeof reqInfo !== "string") {
    const body = new Uint8Array(await reqInfo.arrayBuffer());
    const encodedBody = body.length > 0 ? base64Encode(body) : void 0;
    options = {
      method: reqInfo.method,
      headers: Object.fromEntries(reqInfo.headers.entries()),
      base64Body: encodedBody
    };
    reqInfo = reqInfo.url;
  }
  return syscall("sandboxFetch.fetch", reqInfo, options);
}
globalThis.nativeFetch = globalThis.fetch;
function monkeyPatchFetch() {
  globalThis.fetch = async function(reqInfo, init) {
    const encodedBody = init && init.body ? base64Encode(
      new Uint8Array(await new Response(init.body).arrayBuffer())
    ) : void 0;
    const r = await sandboxFetch(
      reqInfo,
      init && {
        method: init.method,
        headers: init.headers,
        base64Body: encodedBody
      }
    );
    return new Response(r.base64Body ? base64Decode(r.base64Body) : null, {
      status: r.status,
      headers: r.headers
    });
  };
}
if (runningAsWebWorker) {
  monkeyPatchFetch();
}

// ../../../../../../Users/justyns/dev/silverbullet/lib/tree.ts
function addParentPointers(tree) {
  if (!tree.children) {
    return;
  }
  for (const child of tree.children) {
    if (child.parent) {
      return;
    }
    child.parent = tree;
    addParentPointers(child);
  }
}
function collectNodesMatching(tree, matchFn) {
  if (matchFn(tree)) {
    return [tree];
  }
  let results = [];
  if (tree.children) {
    for (const child of tree.children) {
      results = [...results, ...collectNodesMatching(child, matchFn)];
    }
  }
  return results;
}
async function collectNodesMatchingAsync(tree, matchFn) {
  if (await matchFn(tree)) {
    return [tree];
  }
  let results = [];
  if (tree.children) {
    for (const child of tree.children) {
      results = [
        ...results,
        ...await collectNodesMatchingAsync(child, matchFn)
      ];
    }
  }
  return results;
}
async function replaceNodesMatchingAsync(tree, substituteFn) {
  if (tree.children) {
    const children = tree.children.slice();
    for (const child of children) {
      const subst = await substituteFn(child);
      if (subst !== void 0) {
        const pos = tree.children.indexOf(child);
        if (subst) {
          tree.children.splice(pos, 1, subst);
        } else {
          tree.children.splice(pos, 1);
        }
      } else {
        await replaceNodesMatchingAsync(child, substituteFn);
      }
    }
  }
}
function findNodeOfType(tree, nodeType) {
  return collectNodesMatching(tree, (n) => n.type === nodeType)[0];
}
function traverseTree(tree, matchFn) {
  collectNodesMatching(tree, matchFn);
}
async function traverseTreeAsync(tree, matchFn) {
  await collectNodesMatchingAsync(tree, matchFn);
}
function renderToText(tree) {
  if (!tree) {
    return "";
  }
  const pieces = [];
  if (tree.text !== void 0) {
    return tree.text;
  }
  for (const child of tree.children) {
    pieces.push(renderToText(child));
  }
  return pieces.join("");
}

// ../../../../../../Users/justyns/dev/silverbullet/lib/json.ts
function expandPropertyNames(a) {
  if (!a) {
    return a;
  }
  if (typeof a !== "object") {
    return a;
  }
  if (Array.isArray(a)) {
    return a.map(expandPropertyNames);
  }
  const expanded = {};
  for (const key of Object.keys(a)) {
    const parts = key.split(".");
    let target = expanded;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!target[part]) {
        target[part] = {};
      }
      target = target[part];
    }
    target[parts[parts.length - 1]] = expandPropertyNames(a[key]);
  }
  return expanded;
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscalls/editor.ts
var editor_exports = {};
__export(editor_exports, {
  confirm: () => confirm,
  dispatch: () => dispatch,
  downloadFile: () => downloadFile,
  filterBox: () => filterBox,
  flashNotification: () => flashNotification,
  fold: () => fold,
  foldAll: () => foldAll,
  getCurrentPage: () => getCurrentPage,
  getCursor: () => getCursor,
  getSelection: () => getSelection,
  getText: () => getText,
  getUiOption: () => getUiOption,
  goHistory: () => goHistory,
  hidePanel: () => hidePanel,
  insertAtCursor: () => insertAtCursor,
  insertAtPos: () => insertAtPos,
  moveCursor: () => moveCursor,
  navigate: () => navigate,
  openCommandPalette: () => openCommandPalette,
  openPageNavigator: () => openPageNavigator,
  openSearchPanel: () => openSearchPanel,
  openUrl: () => openUrl,
  prompt: () => prompt,
  reloadPage: () => reloadPage,
  reloadSettingsAndCommands: () => reloadSettingsAndCommands,
  reloadUI: () => reloadUI,
  replaceRange: () => replaceRange,
  save: () => save,
  setPage: () => setPage,
  setSelection: () => setSelection,
  setText: () => setText,
  setUiOption: () => setUiOption,
  showPanel: () => showPanel,
  toggleFold: () => toggleFold,
  unfold: () => unfold,
  unfoldAll: () => unfoldAll,
  uploadFile: () => uploadFile,
  vimEx: () => vimEx
});

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscall.ts
if (typeof self === "undefined") {
  self = {
    syscall: () => {
      throw new Error("Not implemented here");
    }
  };
}
var syscall2 = globalThis.syscall;

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscalls/editor.ts
function getCurrentPage() {
  return syscall2("editor.getCurrentPage");
}
function setPage(newName) {
  return syscall2("editor.setPage", newName);
}
function getText() {
  return syscall2("editor.getText");
}
function setText(newText) {
  return syscall2("editor.setText", newText);
}
function getCursor() {
  return syscall2("editor.getCursor");
}
function getSelection() {
  return syscall2("editor.getSelection");
}
function setSelection(from, to) {
  return syscall2("editor.setSelection", from, to);
}
function save() {
  return syscall2("editor.save");
}
function navigate(pageRef, replaceState = false, newWindow = false) {
  return syscall2("editor.navigate", pageRef, replaceState, newWindow);
}
function openPageNavigator(mode = "page") {
  return syscall2("editor.openPageNavigator", mode);
}
function openCommandPalette() {
  return syscall2("editor.openCommandPalette");
}
function reloadPage() {
  return syscall2("editor.reloadPage");
}
function reloadUI() {
  return syscall2("editor.reloadUI");
}
function reloadSettingsAndCommands() {
  return syscall2("editor.reloadSettingsAndCommands");
}
function openUrl(url, existingWindow = false) {
  return syscall2("editor.openUrl", url, existingWindow);
}
function goHistory(delta) {
  return syscall2("editor.goHistory", delta);
}
function downloadFile(filename, dataUrl) {
  return syscall2("editor.downloadFile", filename, dataUrl);
}
function uploadFile(accept, capture) {
  return syscall2("editor.uploadFile", accept, capture);
}
function flashNotification(message, type = "info") {
  return syscall2("editor.flashNotification", message, type);
}
function filterBox(label, options, helpText = "", placeHolder = "") {
  return syscall2("editor.filterBox", label, options, helpText, placeHolder);
}
function showPanel(id, mode, html, script = "") {
  return syscall2("editor.showPanel", id, mode, html, script);
}
function hidePanel(id) {
  return syscall2("editor.hidePanel", id);
}
function insertAtPos(text, pos) {
  return syscall2("editor.insertAtPos", text, pos);
}
function replaceRange(from, to, text) {
  return syscall2("editor.replaceRange", from, to, text);
}
function moveCursor(pos, center = false) {
  return syscall2("editor.moveCursor", pos, center);
}
function insertAtCursor(text) {
  return syscall2("editor.insertAtCursor", text);
}
function dispatch(change) {
  return syscall2("editor.dispatch", change);
}
function prompt(message, defaultValue = "") {
  return syscall2("editor.prompt", message, defaultValue);
}
function confirm(message) {
  return syscall2("editor.confirm", message);
}
function getUiOption(key) {
  return syscall2("editor.getUiOption", key);
}
function setUiOption(key, value) {
  return syscall2("editor.setUiOption", key, value);
}
function vimEx(exCommand) {
  return syscall2("editor.vimEx", exCommand);
}
function fold() {
  return syscall2("editor.fold");
}
function unfold() {
  return syscall2("editor.unfold");
}
function toggleFold() {
  return syscall2("editor.toggleFold");
}
function foldAll() {
  return syscall2("editor.foldAll");
}
function unfoldAll() {
  return syscall2("editor.unfoldAll");
}
function openSearchPanel() {
  return syscall2("editor.openSearchPanel");
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscalls/markdown.ts
var markdown_exports = {};
__export(markdown_exports, {
  parseMarkdown: () => parseMarkdown
});
function parseMarkdown(text) {
  return syscall2("markdown.parseMarkdown", text);
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscalls/space.ts
var space_exports = {};
__export(space_exports, {
  deleteAttachment: () => deleteAttachment,
  deleteFile: () => deleteFile,
  deletePage: () => deletePage,
  getAttachmentMeta: () => getAttachmentMeta,
  getFileMeta: () => getFileMeta,
  getPageMeta: () => getPageMeta,
  listAttachments: () => listAttachments,
  listFiles: () => listFiles,
  listPages: () => listPages,
  listPlugs: () => listPlugs,
  readAttachment: () => readAttachment,
  readFile: () => readFile,
  readPage: () => readPage,
  writeAttachment: () => writeAttachment,
  writeFile: () => writeFile,
  writePage: () => writePage
});
function listPages(unfiltered = false) {
  return syscall2("space.listPages", unfiltered);
}
function getPageMeta(name) {
  return syscall2("space.getPageMeta", name);
}
function readPage(name) {
  return syscall2("space.readPage", name);
}
function writePage(name, text) {
  return syscall2("space.writePage", name, text);
}
function deletePage(name) {
  return syscall2("space.deletePage", name);
}
function listPlugs() {
  return syscall2("space.listPlugs");
}
function listAttachments() {
  return syscall2("space.listAttachments");
}
function getAttachmentMeta(name) {
  return syscall2("space.getAttachmentMeta", name);
}
function readAttachment(name) {
  return syscall2("space.readAttachment", name);
}
function writeAttachment(name, data) {
  return syscall2("space.writeAttachment", name, data);
}
function deleteAttachment(name) {
  return syscall2("space.deleteAttachment", name);
}
function listFiles() {
  return syscall2("space.listFiles");
}
function readFile(name) {
  return syscall2("space.readFile", name);
}
function getFileMeta(name) {
  return syscall2("space.getFileMeta", name);
}
function writeFile(name, data) {
  return syscall2("space.writeFile", name, data);
}
function deleteFile(name) {
  return syscall2("space.deleteFile", name);
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscalls/system.ts
var system_exports = {};
__export(system_exports, {
  getEnv: () => getEnv,
  getMode: () => getMode,
  getVersion: () => getVersion,
  invokeCommand: () => invokeCommand,
  invokeFunction: () => invokeFunction,
  listCommands: () => listCommands,
  listSyscalls: () => listSyscalls,
  reloadPlugs: () => reloadPlugs
});
function invokeFunction(name, ...args) {
  return syscall2("system.invokeFunction", name, ...args);
}
function invokeCommand(name, args) {
  return syscall2("system.invokeCommand", name, args);
}
function listCommands() {
  return syscall2("system.listCommands");
}
function listSyscalls() {
  return syscall2("system.listSyscalls");
}
function reloadPlugs() {
  syscall2("system.reloadPlugs");
}
function getEnv() {
  return syscall2("system.getEnv");
}
function getMode() {
  return syscall2("system.getMode");
}
function getVersion() {
  return syscall2("system.getVersion");
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscalls/template.ts
var template_exports = {};
__export(template_exports, {
  parseTemplate: () => parseTemplate,
  renderTemplate: () => renderTemplate
});
function renderTemplate(template, obj, globals = {}) {
  return syscall2("template.renderTemplate", template, obj, globals);
}
function parseTemplate(template) {
  return syscall2("template.parseTemplate", template);
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/syscalls/yaml.ts
var yaml_exports = {};
__export(yaml_exports, {
  parse: () => parse,
  stringify: () => stringify
});
function parse(text) {
  return syscall2("yaml.parse", text);
}
function stringify(obj) {
  return syscall2("yaml.stringify", obj);
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/lib/frontmatter.ts
async function extractFrontmatter(tree, options = {}) {
  let data = {
    tags: []
  };
  const tags = [];
  addParentPointers(tree);
  await replaceNodesMatchingAsync(tree, async (t) => {
    if (t.type === "Paragraph" && t.parent?.type === "Document") {
      let onlyTags = true;
      const collectedTags = /* @__PURE__ */ new Set();
      for (const child of t.children) {
        if (child.text) {
          if (child.text.startsWith("\n") && child.text !== "\n") {
            break;
          }
          if (child.text.trim()) {
            onlyTags = false;
            break;
          }
        } else if (child.type === "Hashtag") {
          const tagname = child.children[0].text.substring(1);
          collectedTags.add(tagname);
          if (options.removeTags === true || options.removeTags?.includes(tagname)) {
            child.children[0].text = "";
          }
        } else if (child.type) {
          onlyTags = false;
          break;
        }
      }
      if (onlyTags) {
        tags.push(...collectedTags);
      }
    }
    if (t.type === "FrontMatter") {
      const yamlNode = t.children[1].children[0];
      const yamlText = renderToText(yamlNode);
      try {
        const parsedData = await yaml_exports.parse(yamlText);
        const newData = { ...parsedData };
        data = { ...data, ...parsedData };
        if (!data.tags) {
          data.tags = [];
        }
        if (typeof data.tags === "string") {
          tags.push(...data.tags.split(/,\s*|\s+/));
        }
        if (Array.isArray(data.tags)) {
          tags.push(...data.tags);
        }
        if (options.removeKeys && options.removeKeys.length > 0) {
          let removedOne = false;
          for (const key of options.removeKeys) {
            if (key in newData) {
              delete newData[key];
              removedOne = true;
            }
          }
          if (removedOne) {
            yamlNode.text = await yaml_exports.stringify(newData);
          }
        }
        if (Object.keys(newData).length === 0 || options.removeFrontmatterSection) {
          return null;
        }
      } catch (e) {
        console.warn("Could not parse frontmatter", e.message);
      }
    }
    return void 0;
  });
  data.tags = [.../* @__PURE__ */ new Set([...tags.map((t) => t.replace(/^#/, ""))])];
  data = expandPropertyNames(data);
  return data;
}
async function prepareFrontmatterDispatch(tree, data) {
  let dispatchData = null;
  await traverseTreeAsync(tree, async (t) => {
    if (t.type === "FrontMatter") {
      const bodyNode = t.children[1].children[0];
      const yamlText = renderToText(bodyNode);
      try {
        let frontmatterText = "";
        if (typeof data === "string") {
          frontmatterText = yamlText + data + "\n";
        } else {
          const parsedYaml = await yaml_exports.parse(yamlText);
          const newData = { ...parsedYaml, ...data };
          frontmatterText = await yaml_exports.stringify(newData);
        }
        dispatchData = {
          changes: {
            from: bodyNode.from,
            to: bodyNode.to,
            insert: frontmatterText
          }
        };
      } catch (e) {
        console.error("Error parsing YAML", e);
      }
      return true;
    }
    return false;
  });
  if (!dispatchData) {
    let frontmatterText = "";
    if (typeof data === "string") {
      frontmatterText = data + "\n";
    } else {
      frontmatterText = await yaml_exports.stringify(data);
    }
    const fullFrontmatterText = "---\n" + frontmatterText + "---\n";
    dispatchData = {
      changes: {
        from: 0,
        to: 0,
        insert: fullFrontmatterText
      }
    };
  }
  return dispatchData;
}

// https://deno.land/std@0.216.0/encoding/_util.ts
var encoder = new TextEncoder();

// https://deno.land/std@0.216.0/encoding/base64.ts
function decodeBase64(b64) {
  const binString = atob(b64);
  const size = binString.length;
  const bytes = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    bytes[i] = binString.charCodeAt(i);
  }
  return bytes;
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/src/editorUtils.ts
async function getSelectedText() {
  const selectedRange = await editor_exports.getSelection();
  let selectedText = "";
  if (selectedRange.from === selectedRange.to) {
    selectedText = "";
  } else {
    const pageText = await editor_exports.getText();
    selectedText = pageText.slice(selectedRange.from, selectedRange.to);
  }
  return {
    from: selectedRange.from,
    to: selectedRange.to,
    text: selectedText
  };
}
async function getSelectedTextOrNote() {
  const selectedTextInfo = await getSelectedText();
  const pageText = await editor_exports.getText();
  if (selectedTextInfo.text === "") {
    return {
      from: 0,
      to: pageText.length,
      text: pageText,
      isWholeNote: true
    };
  }
  const isWholeNote = selectedTextInfo.from === 0 && selectedTextInfo.to === pageText.length;
  return {
    ...selectedTextInfo,
    isWholeNote
  };
}
async function getPageLength() {
  const pageText = await editor_exports.getText();
  return pageText.length;
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/lib/yaml_page.ts
async function readCodeBlockPage(pageName, allowedLanguages) {
  const text = await space_exports.readPage(pageName);
  const tree = await markdown_exports.parseMarkdown(text);
  let codeText;
  traverseTree(tree, (t) => {
    if (t.type !== "FencedCode") {
      return false;
    }
    const codeInfoNode = findNodeOfType(t, "CodeInfo");
    if (allowedLanguages && !codeInfoNode) {
      return false;
    }
    if (allowedLanguages && !allowedLanguages.includes(codeInfoNode.children[0].text)) {
      return false;
    }
    const codeTextNode = findNodeOfType(t, "CodeText");
    if (!codeTextNode) {
      return false;
    }
    codeText = codeTextNode.children[0].text;
    return true;
  });
  return codeText;
}
async function readYamlPage(pageName, allowedLanguages = ["yaml"]) {
  const codeText = await readCodeBlockPage(pageName, allowedLanguages);
  if (codeText === void 0) {
    return void 0;
  }
  try {
    return yaml_exports.parse(codeText);
  } catch (e) {
    console.error("YAML Page parser error", e);
    throw new Error(`YAML Error: ${e.message}`);
  }
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/lib/secrets_page.ts
async function readSecret(key) {
  try {
    const allSecrets = await readYamlPage("SECRETS", ["yaml", "secrets"]);
    const val = allSecrets[key];
    if (val === void 0) {
      throw new Error(`No such secret: ${key}`);
    }
    return val;
  } catch (e) {
    if (e.message === "Not found") {
      throw new Error(`No such secret: ${key}`);
    }
    throw e;
  }
}

// https://deno.land/x/silverbullet@0.7.3/plug-api/lib/settings_page.ts
var SETTINGS_PAGE = "SETTINGS";
async function readSetting(key, defaultValue) {
  try {
    const allSettings = await readYamlPage(SETTINGS_PAGE, ["yaml"]) || {};
    const val = allSettings[key];
    return val === void 0 ? defaultValue : val;
  } catch (e) {
    if (e.message === "Not found") {
      return defaultValue;
    }
    throw e;
  }
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/src/init.ts
var apiKey;
var aiSettings;
var chatSystemPrompt;
async function initializeOpenAI() {
  const newApiKey = await readSecret("OPENAI_API_KEY");
  if (newApiKey !== apiKey) {
    apiKey = newApiKey;
    console.log("silverbullet-ai API key updated");
  }
  if (!apiKey) {
    const errorMessage = "OpenAI API key is missing. Please set it in the secrets page.";
    await editor_exports.flashNotification(errorMessage, "error");
    throw new Error(errorMessage);
  }
  const defaultSettings = {
    // TODO: These aren't used yet
    // summarizePrompt:
    //   "Summarize this note. Use markdown for any formatting. The note name is ${noteName}",
    // tagPrompt:
    //   'You are an AI tagging assistant. Given the note titled "${noteName}" with the content below, please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.',
    // imagePrompt:
    //   "Please rewrite the following prompt for better image generation:",
    // temperature: 0.5,
    // maxTokens: 1000,
    defaultTextModel: "gpt-3.5-turbo",
    openAIBaseUrl: "https://api.openai.com/v1",
    dallEBaseUrl: "https://api.openai.com/v1",
    requireAuth: true,
    chat: {}
  };
  const newSettings = await readSetting("ai", {});
  const newCombinedSettings = { ...defaultSettings, ...newSettings };
  if (JSON.stringify(aiSettings) !== JSON.stringify(newCombinedSettings)) {
    console.log("aiSettings updating from", aiSettings);
    aiSettings = newCombinedSettings;
    console.log("aiSettings updated to", aiSettings);
  } else {
    console.log("aiSettings unchanged", aiSettings);
  }
  chatSystemPrompt = {
    role: "system",
    content: `This is an interactive chat session with a user in a markdown-based note-taking tool called SilverBullet.`
  };
  if (aiSettings.chat.userInformation) {
    chatSystemPrompt.content += `
The user has provided the following information about their self: ${aiSettings.chat.userInformation}`;
  }
  if (aiSettings.chat.userInstructions) {
    chatSystemPrompt.content += `
The user has provided the following instructions for the chat, follow them as closely as possible: ${aiSettings.chat.userInstructions}`;
  }
}

// ../../../../../../Users/justyns/Library/Caches/deno/deno_esbuild/sse.js@2.2.0/node_modules/sse.js/lib/sse.js
var SSE = function(url, options) {
  if (!(this instanceof SSE)) {
    return new SSE(url, options);
  }
  this.INITIALIZING = -1;
  this.CONNECTING = 0;
  this.OPEN = 1;
  this.CLOSED = 2;
  this.url = url;
  options = options || {};
  this.headers = options.headers || {};
  this.payload = options.payload !== void 0 ? options.payload : "";
  this.method = options.method || (this.payload && "POST" || "GET");
  this.withCredentials = !!options.withCredentials;
  this.debug = !!options.debug;
  this.FIELD_SEPARATOR = ":";
  this.listeners = {};
  this.xhr = null;
  this.readyState = this.INITIALIZING;
  this.progress = 0;
  this.chunk = "";
  this.addEventListener = function(type, listener) {
    if (this.listeners[type] === void 0) {
      this.listeners[type] = [];
    }
    if (this.listeners[type].indexOf(listener) === -1) {
      this.listeners[type].push(listener);
    }
  };
  this.removeEventListener = function(type, listener) {
    if (this.listeners[type] === void 0) {
      return;
    }
    var filtered = [];
    this.listeners[type].forEach(function(element) {
      if (element !== listener) {
        filtered.push(element);
      }
    });
    if (filtered.length === 0) {
      delete this.listeners[type];
    } else {
      this.listeners[type] = filtered;
    }
  };
  this.dispatchEvent = function(e) {
    if (!e) {
      return true;
    }
    if (this.debug) {
      console.debug(e);
    }
    e.source = this;
    var onHandler = "on" + e.type;
    if (this.hasOwnProperty(onHandler)) {
      this[onHandler].call(this, e);
      if (e.defaultPrevented) {
        return false;
      }
    }
    if (this.listeners[e.type]) {
      return this.listeners[e.type].every(function(callback) {
        callback(e);
        return !e.defaultPrevented;
      });
    }
    return true;
  };
  this._setReadyState = function(state) {
    var event = new CustomEvent("readystatechange");
    event.readyState = state;
    this.readyState = state;
    this.dispatchEvent(event);
  };
  this._onStreamFailure = function(e) {
    var event = new CustomEvent("error");
    event.data = e.currentTarget.response;
    this.dispatchEvent(event);
    this.close();
  };
  this._onStreamAbort = function(e) {
    this.dispatchEvent(new CustomEvent("abort"));
    this.close();
  };
  this._onStreamProgress = function(e) {
    if (!this.xhr) {
      return;
    }
    if (this.xhr.status !== 200) {
      this._onStreamFailure(e);
      return;
    }
    if (this.readyState == this.CONNECTING) {
      this.dispatchEvent(new CustomEvent("open"));
      this._setReadyState(this.OPEN);
    }
    var data = this.xhr.responseText.substring(this.progress);
    this.progress += data.length;
    var parts = (this.chunk + data).split(/(\r\n\r\n|\r\r|\n\n)/g);
    var lastPart = parts.pop();
    parts.forEach(function(part) {
      if (part.trim().length > 0) {
        this.dispatchEvent(this._parseEventChunk(part));
      }
    }.bind(this));
    this.chunk = lastPart;
  };
  this._onStreamLoaded = function(e) {
    this._onStreamProgress(e);
    this.dispatchEvent(this._parseEventChunk(this.chunk));
    this.chunk = "";
  };
  this._parseEventChunk = function(chunk) {
    if (!chunk || chunk.length === 0) {
      return null;
    }
    if (this.debug) {
      console.debug(chunk);
    }
    var e = { "id": null, "retry": null, "data": null, "event": null };
    chunk.split(/\n|\r\n|\r/).forEach(function(line) {
      var index = line.indexOf(this.FIELD_SEPARATOR);
      var field, value;
      if (index > 0) {
        var skip = line[index + 1] === " " ? 2 : 1;
        field = line.substring(0, index);
        value = line.substring(index + skip);
      } else if (index < 0) {
        field = line;
        value = "";
      } else {
        return;
      }
      if (!(field in e)) {
        return;
      }
      if (field === "data" && e[field] !== null) {
        e["data"] += "\n" + value;
      } else {
        e[field] = value;
      }
    }.bind(this));
    var event = new CustomEvent(e.event || "message");
    event.data = e.data || "";
    event.id = e.id;
    return event;
  };
  this._checkStreamClosed = function() {
    if (!this.xhr) {
      return;
    }
    if (this.xhr.readyState === XMLHttpRequest.DONE) {
      this._setReadyState(this.CLOSED);
    }
  };
  this.stream = function() {
    if (this.xhr) {
      return;
    }
    this._setReadyState(this.CONNECTING);
    this.xhr = new XMLHttpRequest();
    this.xhr.addEventListener("progress", this._onStreamProgress.bind(this));
    this.xhr.addEventListener("load", this._onStreamLoaded.bind(this));
    this.xhr.addEventListener("readystatechange", this._checkStreamClosed.bind(this));
    this.xhr.addEventListener("error", this._onStreamFailure.bind(this));
    this.xhr.addEventListener("abort", this._onStreamAbort.bind(this));
    this.xhr.open(this.method, this.url);
    for (var header in this.headers) {
      this.xhr.setRequestHeader(header, this.headers[header]);
    }
    this.xhr.withCredentials = this.withCredentials;
    this.xhr.send(this.payload);
  };
  this.close = function() {
    if (this.readyState === this.CLOSED) {
      return;
    }
    this.xhr.abort();
    this.xhr = null;
    this._setReadyState(this.CLOSED);
  };
  if (options.start === void 0 || options.start) {
    this.stream();
  }
};
if (typeof exports !== "undefined") {
  exports.SSE = SSE;
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/src/openai.ts
async function streamChatWithOpenAI({
  messages,
  cursorStart = void 0,
  cursorFollow = false,
  scrollIntoView = true,
  includeChatSystemPrompt = false
}) {
  try {
    if (!apiKey)
      await initializeOpenAI();
    const sseUrl = `${aiSettings.openAIBaseUrl}/chat/completions`;
    const payloadMessages = [];
    if (includeChatSystemPrompt) {
      payloadMessages.push(chatSystemPrompt);
    }
    if ("systemMessage" in messages && "userMessage" in messages) {
      payloadMessages.push(
        { role: "system", content: messages.systemMessage },
        { role: "user", content: messages.userMessage }
      );
    } else {
      payloadMessages.push(...messages);
    }
    const headers = {
      "Content-Type": "application/json"
    };
    if (aiSettings.requireAuth) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const sseOptions = {
      method: "POST",
      headers,
      payload: JSON.stringify({
        model: aiSettings.defaultTextModel,
        stream: true,
        messages: payloadMessages
      }),
      withCredentials: false
    };
    const source = new SSE(sseUrl, sseOptions);
    let cursorPos;
    if (!cursorStart) {
      cursorPos = await getPageLength();
    } else {
      cursorPos = cursorStart;
    }
    let loadingMsg = ` \u{1F914} Thinking \u2026\u2026 `;
    await editor_exports.insertAtPos(loadingMsg, cursorPos);
    let stillLoading = true;
    const updateLoadingSpinner = async () => {
      while (stillLoading) {
        const replaceTo = cursorPos + loadingMsg.length;
        currentStateIndex = (currentStateIndex + 1) % spinnerStates.length;
        loadingMsg = ` \u{1F914} Thinking ${spinnerStates[currentStateIndex]} \u2026`;
        await editor_exports.replaceRange(cursorPos, replaceTo, loadingMsg);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    };
    source.addEventListener("message", function(e) {
      try {
        if (e.data == "[DONE]") {
          source.close();
          stillLoading = false;
        } else {
          const data = JSON.parse(e.data);
          const msg = data.choices[0]?.delta?.content || "";
          if (stillLoading) {
            stillLoading = false;
            editor_exports.replaceRange(cursorPos, cursorPos + loadingMsg.length, msg);
          } else {
            editor_exports.insertAtPos(msg, cursorPos);
          }
          cursorPos += msg.length;
        }
        if (cursorFollow) {
          editor_exports.moveCursor(cursorPos, true);
        }
        if (scrollIntoView) {
        }
      } catch (error) {
        console.error("Error processing message event:", error, e.data);
      }
    });
    source.addEventListener("end", function() {
      source.close();
    });
    source.stream();
  } catch (error) {
    console.error("Error streaming from OpenAI chat endpoint:", error);
    await editor_exports.flashNotification(
      "Error streaming from OpenAI chat endpoint.",
      "error"
    );
    throw error;
  }
}
async function chatWithOpenAI(systemMessage, userMessages) {
  try {
    if (!apiKey)
      await initializeOpenAI();
    if (!apiKey || !aiSettings || !aiSettings.openAIBaseUrl) {
      await editor_exports.flashNotification(
        "API key or AI settings are not properly configured.",
        "error"
      );
      throw new Error("API key or AI settings are not properly configured.");
    }
    const body = JSON.stringify({
      model: aiSettings.defaultTextModel,
      messages: [
        { role: "system", content: systemMessage },
        ...userMessages
      ]
    });
    console.log("Sending body", body);
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };
    console.log("Request headers:", headers);
    const response = await nativeFetch(
      aiSettings.openAIBaseUrl + "/chat/completions",
      {
        method: "POST",
        headers,
        body
      }
    );
    if (!response.ok) {
      console.error("http response: ", response);
      console.error("http response body: ", await response.json());
      throw new Error(`HTTP error, status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.choices || data.choices.length === 0) {
      throw new Error("Invalid response from OpenAI.");
    }
    return data;
  } catch (error) {
    console.error("Error calling OpenAI chat endpoint:", error);
    await editor_exports.flashNotification(
      "Error calling OpenAI chat endpoint.",
      "error"
    );
    throw error;
  }
}
async function generateImageWithDallE(prompt2, n, size = "1024x1024", quality = "hd") {
  try {
    if (!apiKey)
      await initializeOpenAI();
    await editor_exports.flashNotification("Contacting DALL\xB7E, please wait...");
    const response = await nativeFetch(
      aiSettings.dallEBaseUrl + "/images/generations",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt: prompt2,
          quality,
          n,
          size,
          response_format: "b64_json"
        })
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error, status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error calling DALL\xB7E image generation endpoint:", error);
    throw error;
  }
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/src/utils.ts
function folderName(path) {
  return path.split("/").slice(0, -1).join("/");
}
async function convertPageToMessages() {
  const pageText = await editor_exports.getText();
  const lines = pageText.split("\n");
  const messages = [];
  let currentRole = "user";
  let contentBuffer = "";
  lines.forEach((line) => {
    const match = line.match(/^\*\*(\w+)\*\*:/);
    if (match) {
      const newRole = match[1].toLowerCase();
      if (currentRole && currentRole !== newRole) {
        messages.push(
          { role: currentRole, content: contentBuffer.trim() }
        );
        contentBuffer = "";
      }
      currentRole = newRole;
      contentBuffer += line.replace(/^\*\*(\w+)\*\*:/, "").trim() + "\n";
    } else if (currentRole) {
      contentBuffer += line.trim() + "\n";
    }
  });
  if (contentBuffer && currentRole) {
    messages.push(
      { role: currentRole, content: contentBuffer.trim() }
    );
  }
  return messages;
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/sbai.ts
async function reloadConfig(pageName) {
  if (pageName === "SETTINGS" || pageName === "SECRETS") {
    await initializeOpenAI();
  }
}
async function summarizeNote() {
  const selectedTextInfo = await getSelectedTextOrNote();
  console.log("selectedTextInfo", selectedTextInfo);
  if (selectedTextInfo.text.length > 0) {
    const noteName = await editor_exports.getCurrentPage();
    const response = await chatWithOpenAI(
      "You are an AI Note assistant here to help summarize the user's personal notes.",
      [{
        role: "user",
        content: `Please summarize this note using markdown for any formatting.  Your summary will be appended to the end of this note, do not include any of the note contents yourself.  Keep the summary brief. The note name is ${noteName}.

${selectedTextInfo.text}`
      }]
    );
    console.log("OpenAI response:", response);
    return {
      summary: response.choices[0].message.content,
      selectedTextInfo
    };
  }
  return { summary: "", selectedTextInfo: null };
}
async function callOpenAIwithNote() {
  const selectedTextInfo = await getSelectedTextOrNote();
  const userPrompt = await editor_exports.prompt(
    "Please enter a prompt to send to the LLM. Selected text or the entire note will also be sent as context."
  );
  const noteName = await editor_exports.getCurrentPage();
  const currentDate = /* @__PURE__ */ new Date();
  const dateString = currentDate.toISOString().split("T")[0];
  const dayString = currentDate.toLocaleDateString("en-US", {
    weekday: "long"
  });
  await streamChatWithOpenAI({
    messages: {
      systemMessage: "You are an AI note assistant.  Follow all user instructions and use the note context and note content to help follow those instructions.  Use Markdown for any formatting.",
      userMessage: `Note Context: Today is ${dayString}, ${dateString}. The current note name is "${noteName}".
User Prompt: ${userPrompt}
Note Content:
${selectedTextInfo.text}`
    },
    cursorStart: selectedTextInfo.isWholeNote ? void 0 : selectedTextInfo.to
  });
}
async function openSummaryPanel() {
  const { summary } = await summarizeNote();
  if (summary) {
    await editor_exports.showPanel("rhs", 2, summary);
  } else {
    await editor_exports.flashNotification("No summary available.");
  }
}
async function insertSummary() {
  const { summary, selectedTextInfo } = await summarizeNote();
  if (summary && selectedTextInfo) {
    await editor_exports.insertAtPos(
      "\n\n" + summary,
      selectedTextInfo.to
    );
  }
}
async function tagNoteWithAI() {
  const noteContent = await editor_exports.getText();
  const noteName = await editor_exports.getCurrentPage();
  const response = await chatWithOpenAI(
    "You are an AI tagging assistant. Please provide a short list of tags, separated by spaces. Only return tags and no other content. Tags must be one word only and lowercase.  Suggest tags sparringly, do not treat them as keywords.",
    [{
      role: "user",
      content: `Given the note titled "${noteName}" with the content below, please provide tags.

${noteContent}`
    }]
  );
  const tags = response.choices[0].message.content.trim().replace(/,/g, "").split(/\s+/);
  const tree = await markdown_exports.parseMarkdown(noteContent);
  const frontMatter = await extractFrontmatter(tree);
  const updatedTags = [.../* @__PURE__ */ new Set([...frontMatter.tags || [], ...tags])];
  frontMatter.tags = updatedTags;
  console.log("Current frontmatter:", frontMatter);
  const frontMatterChange = await prepareFrontmatterDispatch(tree, frontMatter);
  console.log("updatedNoteContent", frontMatterChange);
  await editor_exports.dispatch(frontMatterChange);
  await editor_exports.flashNotification("Note tagged successfully.");
}
async function streamOpenAIWithSelectionAsPrompt() {
  const selectedTextInfo = await getSelectedTextOrNote();
  await streamChatWithOpenAI({
    messages: {
      systemMessage: "You are an AI note assistant in a markdown-based note tool.",
      userMessage: selectedTextInfo.text
    }
  });
}
async function streamChatOnPage() {
  const messages = await convertPageToMessages();
  if (messages.length === 0) {
    await editor_exports.flashNotification(
      "Error: The page does not match the required format for a chat."
    );
    return;
  }
  const currentPageLength = await getPageLength();
  await editor_exports.insertAtPos("\n\n**assistant**: ", currentPageLength);
  const newPageLength = currentPageLength + "\n\n**assistant**: ".length;
  await editor_exports.insertAtPos("\n\n**user**: ", newPageLength);
  await editor_exports.moveCursor(newPageLength + "\n\n**user**: ".length);
  await streamChatWithOpenAI({
    messages,
    cursorStart: newPageLength,
    scrollIntoView: true,
    includeChatSystemPrompt: true
  });
}
async function promptAndGenerateImage() {
  try {
    const prompt2 = await editor_exports.prompt("Enter a prompt for DALL\xB7E:");
    if (!prompt2 || !prompt2.trim()) {
      await editor_exports.flashNotification(
        "No prompt entered. Operation cancelled.",
        "error"
      );
      return;
    }
    const imageData = await generateImageWithDallE(prompt2, 1);
    if (imageData && imageData.data && imageData.data.length > 0) {
      const base64Image = imageData.data[0].b64_json;
      const revisedPrompt = imageData.data[0].revised_prompt;
      const decodedImage = new Uint8Array(decodeBase64(base64Image));
      const finalFileName = `dall-e-${Date.now()}.png`;
      let prefix = folderName(await editor_exports.getCurrentPage()) + "/";
      if (prefix === "/") {
        prefix = "";
      }
      await space_exports.writeAttachment(prefix + finalFileName, decodedImage);
      const markdownImg = `![${finalFileName}](${finalFileName})
*${revisedPrompt}*`;
      await editor_exports.insertAtCursor(markdownImg);
      await editor_exports.flashNotification(
        "Image generated and inserted with caption successfully."
      );
    } else {
      await editor_exports.flashNotification("Failed to generate image.", "error");
    }
  } catch (error) {
    console.error("Error generating image with DALL\xB7E:", error);
    await editor_exports.flashNotification("Error generating image.", "error");
  }
}
async function queryOpenAI(userPrompt, systemPrompt) {
  try {
    const messages = [];
    messages.push({ role: "user", content: userPrompt });
    const defaultSystemPrompt = "You are an AI note assistant helping to render content for a note.  Please follow user instructions and keep your response short and concise.";
    const response = await chatWithOpenAI(
      systemPrompt || defaultSystemPrompt,
      messages
    );
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error querying OpenAI:", error);
    throw error;
  }
}

// ../../../../../../Users/justyns/dev/silverbullet/lib/limited_map.ts
var LimitedMap = class {
  constructor(maxSize, initialJson = {}) {
    this.maxSize = maxSize;
    this.map = new Map(Object.entries(initialJson));
  }
  map;
  /**
   * @param key
   * @param value
   * @param ttl time to live (in ms)
   */
  set(key, value, ttl) {
    const entry = { value, la: Date.now() };
    if (ttl) {
      const existingEntry = this.map.get(key);
      if (existingEntry?.expTimer) {
        clearTimeout(existingEntry.expTimer);
      }
      entry.expTimer = setTimeout(() => {
        this.map.delete(key);
      }, ttl);
    }
    if (this.map.size >= this.maxSize) {
      const oldestKey = this.getOldestKey();
      this.map.delete(oldestKey);
    }
    this.map.set(key, entry);
  }
  get(key) {
    const entry = this.map.get(key);
    if (entry) {
      entry.la = Date.now();
      return entry.value;
    }
    return void 0;
  }
  remove(key) {
    this.map.delete(key);
  }
  toJSON() {
    return Object.fromEntries(this.map.entries());
  }
  getOldestKey() {
    let oldestKey;
    let oldestTimestamp;
    for (const [key, entry] of this.map.entries()) {
      if (!oldestTimestamp || entry.la < oldestTimestamp) {
        oldestKey = key;
        oldestTimestamp = entry.la;
      }
    }
    return oldestKey;
  }
};

// ../../../../../../Users/justyns/dev/silverbullet/lib/memory_cache.ts
var cache = new LimitedMap(50);
async function ttlCache(key, fn, ttlSecs) {
  if (!ttlSecs) {
    return fn(key);
  }
  const serializedKey = JSON.stringify(key);
  const cached = cache.get(serializedKey);
  if (cached) {
    return cached;
  }
  const result = await fn(key);
  cache.set(serializedKey, result, ttlSecs * 1e3);
  return result;
}

// https://deno.land/x/silverbullet@0.7.3/plugs/index/plug_api.ts
function queryObjects(tag, query, ttlSecs) {
  return ttlCache(
    query,
    () => system_exports.invokeFunction("index.queryObjects", tag, query),
    ttlSecs
    // no-op when undefined
  );
}

// https://deno.land/x/silverbullet@0.7.3/plugs/template/api.ts
async function renderTemplate2(templateText, data = {}, variables = {}) {
  try {
    const tree = await markdown_exports.parseMarkdown(templateText);
    const frontmatter = await extractFrontmatter(
      tree,
      {
        removeFrontmatterSection: true,
        removeTags: ["template"]
      }
    );
    templateText = renderToText(tree).trimStart();
    let frontmatterText;
    if (frontmatter.frontmatter) {
      if (typeof frontmatter.frontmatter === "string") {
        frontmatterText = frontmatter.frontmatter;
      } else {
        frontmatterText = await yaml_exports.stringify(frontmatter.frontmatter);
      }
      frontmatterText = await template_exports.renderTemplate(
        frontmatterText,
        data,
        variables
      );
    }
    return {
      frontmatter,
      renderedFrontmatter: frontmatterText,
      text: await template_exports.renderTemplate(templateText, data, variables)
    };
  } catch (e) {
    console.error("Error rendering template", e);
    throw e;
  }
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/src/prompts.ts
async function insertAiPromptFromTemplate(slashCompletion) {
  let selectedTemplate;
  if (!slashCompletion || !slashCompletion.templatePage) {
    const aiPromptTemplates = await queryObjects("template", {
      filter: ["attr", ["attr", "aiprompt"], "description"]
    });
    selectedTemplate = await editor_exports.filterBox(
      "Prompt Template",
      aiPromptTemplates.map((templateObj) => {
        const niceName = templateObj.ref.split("/").pop();
        return {
          ...templateObj,
          description: templateObj.aiprompt.description || templateObj.ref,
          name: templateObj.aiprompt.displayName || niceName,
          systemPrompt: templateObj.aiprompt.systemPrompt || "You are an AI note assistant. Please follow the prompt instructions.",
          insertAt: templateObj.aiprompt.insertAt || "cursor"
          // parseAs: templateObj.aiprompt.parseAs || "markdown",
        };
      }),
      `Select the template to use as the prompt.  The prompt will be rendered and sent to the LLM model.`
    );
  } else {
    console.log("selectedTemplate from slash completion: ", slashCompletion);
    const templatePage = await space_exports.readPage(slashCompletion.templatePage);
    const tree = await markdown_exports.parseMarkdown(templatePage);
    const { aiprompt } = await extractFrontmatter(tree);
    console.log("templatePage from slash completion: ", templatePage);
    selectedTemplate = {
      ref: slashCompletion.templatePage,
      systemPrompt: aiprompt.systemPrompt || "You are an AI note assistant. Please follow the prompt instructions.",
      insertAt: aiprompt.insertAt || "cursor"
    };
  }
  if (!selectedTemplate) {
    await editor_exports.flashNotification("No template selected");
    return;
  }
  console.log("User selected prompt template: ", selectedTemplate);
  const validInsertAtOptions = [
    "cursor",
    "page-start",
    "page-end"
    // "frontmatter",
    // "modal",
  ];
  if (!validInsertAtOptions.includes(selectedTemplate.insertAt)) {
    console.error(
      `Invalid insertAt value: ${selectedTemplate.insertAt}. It must be one of ${validInsertAtOptions.join(", ")}`
    );
    await editor_exports.flashNotification(
      `Invalid insertAt value: ${selectedTemplate.insertAt}. Please select a valid option.`,
      "error"
    );
    return;
  }
  const templateText = await space_exports.readPage(selectedTemplate.ref);
  const currentPage = await editor_exports.getCurrentPage();
  const pageMeta = await space_exports.getPageMeta(currentPage);
  let cursorPos;
  switch (selectedTemplate.insertAt) {
    case "page-start":
      cursorPos = 0;
      break;
    case "page-end":
      cursorPos = await getPageLength();
      break;
    case "frontmatter":
      await editor_exports.flashNotification(
        `rendering in frontmatter not supported yet`,
        "error"
      );
      break;
    case "modal":
      break;
    case "cursor":
    default:
      cursorPos = await editor_exports.getCursor();
  }
  const renderedTemplate = await renderTemplate2(templateText, pageMeta, {
    page: pageMeta
  });
  await streamChatWithOpenAI({
    messages: {
      systemMessage: selectedTemplate.systemPrompt,
      userMessage: renderedTemplate.text
    },
    cursorStart: cursorPos
  });
}

// f0aea78a.js
var functionMapping = {
  queryOpenAI,
  reloadConfig,
  summarizeNote: openSummaryPanel,
  insertSummary,
  callOpenAI: callOpenAIwithNote,
  tagNoteWithAI,
  promptAndGenerateImage,
  streamOpenAIWithSelectionAsPrompt,
  streamChatOnPage,
  insertAiPromptFromTemplate
};
var manifest = {
  "name": "silverbullet-ai",
  "requiredPermissions": [
    "fetch"
  ],
  "functions": {
    "queryOpenAI": {
      "path": "sbai.ts:queryOpenAI"
    },
    "reloadConfig": {
      "path": "sbai.ts:reloadConfig",
      "events": [
        "page:saved"
      ]
    },
    "summarizeNote": {
      "path": "sbai.ts:openSummaryPanel",
      "command": {
        "name": "AI: Summarize Note and open summary"
      }
    },
    "insertSummary": {
      "path": "sbai.ts:insertSummary",
      "command": {
        "name": "AI: Insert Summary"
      }
    },
    "callOpenAI": {
      "path": "sbai.ts:callOpenAIwithNote",
      "command": {
        "name": "AI: Call OpenAI with Note as context"
      }
    },
    "tagNoteWithAI": {
      "path": "sbai.ts:tagNoteWithAI",
      "command": {
        "name": "AI: Generate tags for note"
      }
    },
    "promptAndGenerateImage": {
      "path": "sbai.ts:promptAndGenerateImage",
      "command": {
        "name": "AI: Generate and insert image using DallE"
      }
    },
    "streamOpenAIWithSelectionAsPrompt": {
      "path": "sbai.ts:streamOpenAIWithSelectionAsPrompt",
      "command": {
        "name": "AI: Stream response with selection or note as prompt"
      }
    },
    "streamChatOnPage": {
      "path": "sbai.ts:streamChatOnPage",
      "command": {
        "name": "AI: Chat on current page",
        "key": "Ctrl-Shift-Enter",
        "mac": "Cmd-Shift-Enter"
      }
    },
    "insertAiPromptFromTemplate": {
      "path": "src/prompts.ts:insertAiPromptFromTemplate",
      "command": {
        "name": "AI: Execute AI Prompt from Custom Template"
      }
    }
  },
  "assets": {}
};
var plug = { manifest, functionMapping };
setupMessageListener(functionMapping, manifest);
export {
  plug
};
//# sourceMappingURL=silverbullet-ai.plug.js.map
