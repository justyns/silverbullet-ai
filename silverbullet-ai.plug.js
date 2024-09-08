var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// https://deno.land/x/silverbullet@0.9.4/lib/plugos/worker_runtime.ts
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
  let binary2 = "";
  const len = buffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary2 += String.fromCharCode(buffer[i]);
  }
  return btoa(binary2);
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

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/lib/tree.ts
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
function collectNodesOfType(tree, nodeType) {
  return collectNodesMatching(tree, (n) => n.type === nodeType);
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
function parseTreeToAST(tree, omitTrimmable = true) {
  const parseErrorNodes = collectNodesOfType(tree, "\u26A0");
  if (parseErrorNodes.length > 0) {
    throw new Error(
      `Parse error in: ${renderToText(tree)}`
    );
  }
  if (tree.text !== void 0) {
    return tree.text;
  }
  const ast = [tree.type];
  for (const node of tree.children) {
    if (node.type && !node.type.endsWith("Mark")) {
      ast.push(parseTreeToAST(node, omitTrimmable));
    }
    if (node.text && (omitTrimmable && node.text.trim() || !omitTrimmable)) {
      ast.push(node.text);
    }
  }
  return ast;
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/lib/json.ts
function cleanStringDate(d) {
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  } else {
    return d.toISOString();
  }
}
function cleanupJSON(a) {
  if (!a) {
    return a;
  }
  if (typeof a !== "object") {
    return a;
  }
  if (Array.isArray(a)) {
    return a.map(cleanupJSON);
  }
  if (a instanceof Date) {
    return cleanStringDate(a);
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
    target[parts[parts.length - 1]] = cleanupJSON(a[key]);
  }
  return expanded;
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/editor.ts
var editor_exports = {};
__export(editor_exports, {
  confirm: () => confirm,
  copyToClipboard: () => copyToClipboard,
  deleteLine: () => deleteLine,
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
  moveCursorToLine: () => moveCursorToLine,
  navigate: () => navigate,
  openCommandPalette: () => openCommandPalette,
  openPageNavigator: () => openPageNavigator,
  openSearchPanel: () => openSearchPanel,
  openUrl: () => openUrl,
  prompt: () => prompt,
  redo: () => redo,
  reloadConfigAndCommands: () => reloadConfigAndCommands,
  reloadPage: () => reloadPage,
  reloadUI: () => reloadUI,
  replaceRange: () => replaceRange,
  save: () => save,
  setSelection: () => setSelection,
  setText: () => setText,
  setUiOption: () => setUiOption,
  showPanel: () => showPanel,
  toggleFold: () => toggleFold,
  undo: () => undo,
  unfold: () => unfold,
  unfoldAll: () => unfoldAll,
  uploadFile: () => uploadFile,
  vimEx: () => vimEx
});

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscall.ts
if (typeof self === "undefined") {
  self = {
    syscall: () => {
      throw new Error("Not implemented here");
    }
  };
}
function syscall2(name, ...args) {
  return globalThis.syscall(name, ...args);
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/editor.ts
function getCurrentPage() {
  return syscall2("editor.getCurrentPage");
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
function reloadConfigAndCommands() {
  return syscall2("editor.reloadConfigAndCommands");
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
function moveCursorToLine(line, column = 1, center = false) {
  return syscall2("editor.moveCursorToLine", line, column, center);
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
function undo() {
  return syscall2("editor.undo");
}
function redo() {
  return syscall2("editor.redo");
}
function openSearchPanel() {
  return syscall2("editor.openSearchPanel");
}
function copyToClipboard(data) {
  return syscall2("editor.copyToClipboard", data);
}
function deleteLine() {
  return syscall2("editor.deleteLine");
}
function vimEx(exCommand) {
  return syscall2("editor.vimEx", exCommand);
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/markdown.ts
var markdown_exports = {};
__export(markdown_exports, {
  parseMarkdown: () => parseMarkdown,
  renderParseTree: () => renderParseTree
});
function parseMarkdown(text) {
  return syscall2("markdown.parseMarkdown", text);
}
function renderParseTree(tree) {
  return syscall2("markdown.renderParseTree", tree);
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/space.ts
var space_exports = {};
__export(space_exports, {
  deleteAttachment: () => deleteAttachment,
  deleteFile: () => deleteFile,
  deletePage: () => deletePage,
  fileExists: () => fileExists,
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
function listPages() {
  return syscall2("space.listPages");
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
function fileExists(name) {
  return syscall2("space.fileExists", name);
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/system.ts
var system_exports = {};
__export(system_exports, {
  applyAttributeExtractors: () => applyAttributeExtractors,
  getEnv: () => getEnv,
  getMode: () => getMode,
  getSpaceConfig: () => getSpaceConfig,
  getVersion: () => getVersion,
  invokeCommand: () => invokeCommand,
  invokeFunction: () => invokeFunction,
  invokeSpaceFunction: () => invokeSpaceFunction,
  listCommands: () => listCommands,
  listSyscalls: () => listSyscalls,
  reloadConfig: () => reloadConfig,
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
function invokeSpaceFunction(name, ...args) {
  return syscall2("system.invokeSpaceFunction", name, ...args);
}
function applyAttributeExtractors(tags, text, tree) {
  return syscall2("system.applyAttributeExtractors", tags, text, tree);
}
async function getSpaceConfig(key, defaultValue) {
  return await syscall2("system.getSpaceConfig", key) ?? defaultValue;
}
function reloadPlugs() {
  return syscall2("system.reloadPlugs");
}
function reloadConfig() {
  return syscall2("system.reloadConfig");
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

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/clientStore.ts
var clientStore_exports = {};
__export(clientStore_exports, {
  del: () => del,
  get: () => get,
  set: () => set
});
function set(key, value) {
  return syscall2("clientStore.set", key, value);
}
function get(key) {
  return syscall2("clientStore.get", key);
}
function del(key) {
  return syscall2("clientStore.delete", key);
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/language.ts
var language_exports = {};
__export(language_exports, {
  listLanguages: () => listLanguages,
  parseLanguage: () => parseLanguage
});
function parseLanguage(language, code) {
  return syscall2("language.parseLanguage", language, code);
}
function listLanguages() {
  return syscall2("language.listLanguages");
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/template.ts
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

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/event.ts
var event_exports = {};
__export(event_exports, {
  dispatchEvent: () => dispatchEvent,
  listEvents: () => listEvents
});
function dispatchEvent(eventName, data, timeout) {
  return new Promise((resolve, reject) => {
    let timeouter = -1;
    if (timeout) {
      timeouter = setTimeout(() => {
        console.log("Timeout!");
        reject("timeout");
      }, timeout);
    }
    syscall2("event.dispatch", eventName, data).then((r) => {
      if (timeouter !== -1) {
        clearTimeout(timeouter);
      }
      resolve(r);
    }).catch(reject);
  });
}
function listEvents() {
  return syscall2("event.list");
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/yaml.ts
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

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/syscalls/mq.ts
var mq_exports = {};
__export(mq_exports, {
  ack: () => ack,
  batchAck: () => batchAck,
  batchSend: () => batchSend,
  getQueueStats: () => getQueueStats,
  send: () => send
});
function send(queue, body) {
  return syscall2("mq.send", queue, body);
}
function batchSend(queue, bodies) {
  return syscall2("mq.batchSend", queue, bodies);
}
function ack(queue, id) {
  return syscall2("mq.ack", queue, id);
}
function batchAck(queue, ids) {
  return syscall2("mq.batchAck", queue, ids);
}
function getQueueStats(queue) {
  return syscall2("mq.getQueueStats", queue);
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/lib/frontmatter.ts
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
      } catch {
      }
    }
    return void 0;
  });
  try {
    data.tags = [
      .../* @__PURE__ */ new Set([...tags.map((t) => {
        const tagAsString = String(t);
        return tagAsString.replace(/^#/, "");
      })])
    ];
  } catch (e) {
    console.error("Error while processing tags", e);
  }
  data = cleanupJSON(data);
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

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/lib/parse_query.ts
function astToKvQuery(node) {
  const query2 = {
    querySource: ""
  };
  const [queryType, querySource, ...clauses] = node;
  if (queryType !== "Query") {
    throw new Error(`Expected query type, got ${queryType}`);
  }
  query2.querySource = querySource[1];
  for (const clause of clauses) {
    const [clauseType] = clause;
    switch (clauseType) {
      case "WhereClause": {
        if (query2.filter) {
          query2.filter = [
            "and",
            query2.filter,
            expressionToKvQueryExpression(clause[2])
          ];
        } else {
          query2.filter = expressionToKvQueryExpression(clause[2]);
        }
        break;
      }
      case "OrderClause": {
        if (!query2.orderBy) {
          query2.orderBy = [];
        }
        for (const orderBy of clause.slice(2)) {
          if (orderBy[0] === "OrderBy") {
            const expr = orderBy[1][1];
            if (orderBy[2]) {
              query2.orderBy.push({
                expr: expressionToKvQueryExpression(expr),
                desc: orderBy[2][1][1] === "desc"
              });
            } else {
              query2.orderBy.push({
                expr: expressionToKvQueryExpression(expr),
                desc: false
              });
            }
          }
        }
        break;
      }
      case "LimitClause": {
        query2.limit = expressionToKvQueryExpression(clause[2][1]);
        break;
      }
      case "SelectClause": {
        for (const select of clause.slice(2)) {
          if (select[0] === "Select") {
            if (!query2.select) {
              query2.select = [];
            }
            if (select.length === 2) {
              query2.select.push({
                name: cleanIdentifier(select[1][1])
              });
            } else {
              query2.select.push({
                name: cleanIdentifier(select[3][1]),
                expr: expressionToKvQueryExpression(select[1])
              });
            }
          }
        }
        break;
      }
      case "RenderClause": {
        const pageRef = clause.find((c) => c[0] === "PageRef");
        query2.render = pageRef[1].slice(2, -2);
        query2.renderAll = !!clause.find((c) => c[0] === "all");
        break;
      }
      default:
        throw new Error(`Unknown clause type: ${clauseType}`);
    }
  }
  return query2;
}
function cleanIdentifier(s) {
  if (s.startsWith("`") && s.endsWith("`")) {
    return s.slice(1, -1);
  }
  return s;
}
function expressionToKvQueryExpression(node) {
  if (["LVal", "Expression", "Value"].includes(node[0])) {
    return expressionToKvQueryExpression(node[1]);
  }
  switch (node[0]) {
    case "Attribute": {
      return [
        "attr",
        expressionToKvQueryExpression(node[1]),
        cleanIdentifier(node[3][1])
      ];
    }
    case "Identifier":
      return ["attr", cleanIdentifier(node[1])];
    case "String":
      return ["string", node[1].slice(1, -1)];
    case "Number":
      return ["number", +node[1]];
    case "Bool":
      return ["boolean", node[1][1] === "true"];
    case "null":
      return ["null"];
    case "Regex":
      return ["regexp", node[1].slice(1, -1), "i"];
    case "List": {
      const exprs = [];
      for (const expr of node.slice(2)) {
        if (expr[0] === "Expression") {
          exprs.push(expr);
        }
      }
      return ["array", exprs.map(expressionToKvQueryExpression)];
    }
    case "Object": {
      const objAttrs = [];
      for (const kv of node.slice(2)) {
        if (typeof kv === "string") {
          continue;
        }
        const [_, key, _colon, expr] = kv;
        objAttrs.push([
          key[1].slice(1, -1),
          expressionToKvQueryExpression(
            expr
          )
        ]);
      }
      return ["object", objAttrs];
    }
    case "BinExpression": {
      const lval = expressionToKvQueryExpression(node[1]);
      const binOp = node[2][0] === "InKW" ? "in" : node[2].trim();
      const val = expressionToKvQueryExpression(node[3]);
      return [binOp, lval, val];
    }
    case "LogicalExpression": {
      const op1 = expressionToKvQueryExpression(node[1]);
      const op = node[2];
      const op2 = expressionToKvQueryExpression(node[3]);
      return [op[1], op1, op2];
    }
    case "ParenthesizedExpression": {
      return expressionToKvQueryExpression(node[2]);
    }
    case "Call": {
      const fn = cleanIdentifier(node[1][1]);
      const args = [];
      for (const expr of node.slice(2)) {
        if (expr[0] === "Expression") {
          args.push(expr);
        }
      }
      return ["call", fn, args.map(expressionToKvQueryExpression)];
    }
    case "UnaryExpression": {
      if (node[1][0] === "NotKW" || node[1][0] === "!") {
        return ["not", expressionToKvQueryExpression(node[2])];
      } else if (node[1][0] === "-") {
        return ["-", expressionToKvQueryExpression(node[2])];
      }
      throw new Error(`Unknown unary expression: ${node[1][0]}`);
    }
    case "TopLevelVal": {
      return ["attr"];
    }
    case "GlobalIdentifier": {
      return ["global", node[1].substring(1)];
    }
    case "TernaryExpression": {
      const [_, condition, _space, ifTrue, _space2, ifFalse] = node;
      return [
        "?",
        expressionToKvQueryExpression(condition),
        expressionToKvQueryExpression(ifTrue),
        expressionToKvQueryExpression(ifFalse)
      ];
    }
    case "QueryExpression": {
      return ["query", astToKvQuery(node[2])];
    }
    case "PageRef": {
      return ["pageref", node[1].slice(2, -2)];
    }
    default:
      throw new Error(`Not supported: ${node[0]}`);
  }
}
async function parseQuery(query2) {
  const queryAST = parseTreeToAST(
    await language_exports.parseLanguage(
      "query",
      query2
    )
  );
  return astToKvQuery(queryAST[1]);
}

// https://jsr.io/@silverbulletmd/silverbullet/0.9.4/plug-api/lib/attribute.ts
async function extractAttributes(tags, tree) {
  let attributes = {};
  await traverseTreeAsync(tree, async (n) => {
    if (tree !== n && n.type === "ListItem") {
      return true;
    }
    if (n.type === "Attribute") {
      const nameNode = findNodeOfType(n, "AttributeName");
      const valueNode = findNodeOfType(n, "AttributeValue");
      if (nameNode && valueNode) {
        const name = nameNode.children[0].text;
        const val = valueNode.children[0].text;
        try {
          attributes[name] = cleanupJSON(await yaml_exports.parse(val));
        } catch (e) {
          console.error("Error parsing attribute value as YAML", val, e);
        }
      }
      return true;
    }
    return false;
  });
  const text = renderToText(tree);
  const spaceScriptAttributes = await system_exports.applyAttributeExtractors(
    tags,
    text,
    tree
  );
  attributes = {
    ...attributes,
    ...spaceScriptAttributes
  };
  return attributes;
}

// https://deno.land/x/silverbullet@0.9.4/plug-api/lib/tree.ts
function collectNodesMatching2(tree, matchFn) {
  if (matchFn(tree)) {
    return [tree];
  }
  let results = [];
  if (tree.children) {
    for (const child of tree.children) {
      results = [...results, ...collectNodesMatching2(child, matchFn)];
    }
  }
  return results;
}
function findNodeOfType2(tree, nodeType) {
  return collectNodesMatching2(tree, (n) => n.type === nodeType)[0];
}
function traverseTree(tree, matchFn) {
  collectNodesMatching2(tree, matchFn);
}

// https://deno.land/x/silverbullet@0.9.4/plug-api/syscall.ts
if (typeof self === "undefined") {
  self = {
    syscall: () => {
      throw new Error("Not implemented here");
    }
  };
}
function syscall3(name, ...args) {
  return globalThis.syscall(name, ...args);
}

// https://deno.land/x/silverbullet@0.9.4/plug-api/syscalls/markdown.ts
var markdown_exports2 = {};
__export(markdown_exports2, {
  parseMarkdown: () => parseMarkdown2,
  renderParseTree: () => renderParseTree2
});
function parseMarkdown2(text) {
  return syscall3("markdown.parseMarkdown", text);
}
function renderParseTree2(tree) {
  return syscall3("markdown.renderParseTree", tree);
}

// https://deno.land/x/silverbullet@0.9.4/plug-api/syscalls/space.ts
var space_exports2 = {};
__export(space_exports2, {
  deleteAttachment: () => deleteAttachment2,
  deleteFile: () => deleteFile2,
  deletePage: () => deletePage2,
  fileExists: () => fileExists2,
  getAttachmentMeta: () => getAttachmentMeta2,
  getFileMeta: () => getFileMeta2,
  getPageMeta: () => getPageMeta2,
  listAttachments: () => listAttachments2,
  listFiles: () => listFiles2,
  listPages: () => listPages2,
  listPlugs: () => listPlugs2,
  readAttachment: () => readAttachment2,
  readFile: () => readFile2,
  readPage: () => readPage2,
  writeAttachment: () => writeAttachment2,
  writeFile: () => writeFile2,
  writePage: () => writePage2
});
function listPages2() {
  return syscall3("space.listPages");
}
function getPageMeta2(name) {
  return syscall3("space.getPageMeta", name);
}
function readPage2(name) {
  return syscall3("space.readPage", name);
}
function writePage2(name, text) {
  return syscall3("space.writePage", name, text);
}
function deletePage2(name) {
  return syscall3("space.deletePage", name);
}
function listPlugs2() {
  return syscall3("space.listPlugs");
}
function listAttachments2() {
  return syscall3("space.listAttachments");
}
function getAttachmentMeta2(name) {
  return syscall3("space.getAttachmentMeta", name);
}
function readAttachment2(name) {
  return syscall3("space.readAttachment", name);
}
function writeAttachment2(name, data) {
  return syscall3("space.writeAttachment", name, data);
}
function deleteAttachment2(name) {
  return syscall3("space.deleteAttachment", name);
}
function listFiles2() {
  return syscall3("space.listFiles");
}
function readFile2(name) {
  return syscall3("space.readFile", name);
}
function getFileMeta2(name) {
  return syscall3("space.getFileMeta", name);
}
function writeFile2(name, data) {
  return syscall3("space.writeFile", name, data);
}
function deleteFile2(name) {
  return syscall3("space.deleteFile", name);
}
function fileExists2(name) {
  return syscall3("space.fileExists", name);
}

// https://deno.land/x/silverbullet@0.9.4/plug-api/syscalls/yaml.ts
var yaml_exports2 = {};
__export(yaml_exports2, {
  parse: () => parse2,
  stringify: () => stringify2
});
function parse2(text) {
  return syscall3("yaml.parse", text);
}
function stringify2(obj) {
  return syscall3("yaml.stringify", obj);
}

// https://deno.land/x/silverbullet@0.9.4/plug-api/lib/yaml_page.ts
async function readCodeBlockPage(pageName, allowedLanguages) {
  const text = await space_exports2.readPage(pageName);
  const tree = await markdown_exports2.parseMarkdown(text);
  let codeText;
  traverseTree(tree, (t) => {
    if (t.type !== "FencedCode") {
      return false;
    }
    const codeInfoNode = findNodeOfType2(t, "CodeInfo");
    if (allowedLanguages && !codeInfoNode) {
      return false;
    }
    if (allowedLanguages && !allowedLanguages.includes(codeInfoNode.children[0].text)) {
      return false;
    }
    const codeTextNode = findNodeOfType2(t, "CodeText");
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
    return yaml_exports2.parse(codeText);
  } catch (e) {
    console.error("YAML Page parser error", e);
    throw new Error(`YAML Error: ${e.message}`);
  }
}

// https://deno.land/x/silverbullet@0.9.4/plug-api/lib/secrets_page.ts
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

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/interfaces/ImageProvider.ts
var AbstractImageProvider = class {
  apiKey;
  baseUrl;
  name;
  modelName;
  requireAuth;
  constructor(apiKey2, baseUrl, name, modelName, requireAuth = true) {
    this.apiKey = apiKey2;
    this.baseUrl = baseUrl;
    this.name = name;
    this.modelName = modelName;
    this.requireAuth = requireAuth;
  }
};

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/providers/dalle.ts
var DallEProvider = class extends AbstractImageProvider {
  constructor(apiKey2, modelName, baseUrl) {
    super(apiKey2, baseUrl, "DALL-E", modelName);
  }
  async generateImage(options) {
    try {
      if (!apiKey)
        await initializeOpenAI();
      const response = await nativeFetch(
        `${this.baseUrl}/images/generations`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: this.modelName,
            prompt: options.prompt,
            n: options.numImages,
            size: options.size,
            quality: options.quality,
            response_format: "b64_json"
          })
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP error, status: ${response.status}`);
      }
      const data = await response.json();
      if (!data || data.length === 0) {
        throw new Error("Invalid response from DALL-E.");
      }
      return data;
    } catch (error) {
      console.error("Error calling DALL\xB7E image generation endpoint:", error);
      throw error;
    }
  }
};

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

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/cache.ts
var cache = {};
function setCache(key, value) {
  cache[key] = value;
}
function getCache(key) {
  return cache[key];
}
async function hashStrings(...inputs) {
  const concatenatedInput = inputs.join("");
  const textAsBuffer = new TextEncoder().encode(concatenatedInput);
  const hashBuffer = await crypto.subtle.digest("SHA-256", textAsBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map((item) => item.toString(16).padStart(2, "0")).join("");
  return hash;
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/interfaces/EmbeddingProvider.ts
var AbstractEmbeddingProvider = class {
  apiKey;
  baseUrl;
  name;
  modelName;
  requireAuth;
  constructor(apiKey2, baseUrl, name, modelName, requireAuth = true) {
    this.apiKey = apiKey2;
    this.baseUrl = baseUrl;
    this.name = name;
    this.modelName = modelName;
    this.requireAuth = requireAuth;
  }
  async generateEmbeddings(options) {
    const cacheKey = await hashStrings(
      this.modelName,
      options.text
    );
    const cachedEmbedding = getCache(cacheKey);
    if (cachedEmbedding) {
      return cachedEmbedding;
    }
    const embedding = await this._generateEmbeddings(options);
    setCache(cacheKey, embedding);
    return embedding;
  }
};

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/editorUtils.ts
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

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/interfaces/Provider.ts
var AbstractProvider = class {
  name;
  apiKey;
  baseUrl;
  modelName;
  constructor(name, apiKey2, baseUrl, modelName) {
    this.name = name;
    this.apiKey = apiKey2;
    this.baseUrl = baseUrl;
    this.modelName = modelName;
  }
  async streamChatIntoEditor(options, cursorStart) {
    const { onDataReceived } = options;
    const loadingMessage = "\u{1F914} Thinking \u2026 ";
    let cursorPos = cursorStart ?? await getPageLength();
    await editor_exports.insertAtPos(loadingMessage, cursorPos);
    let stillLoading = true;
    const onData = (data) => {
      try {
        if (!data) {
          console.log("No data received from LLM");
          return;
        }
        if (stillLoading) {
          if (["`", "-", "*"].includes(data.charAt(0))) {
            console.log("First character of response is:", data.charAt(0));
            data = "\n" + data;
          }
          editor_exports.replaceRange(
            cursorPos,
            cursorPos + loadingMessage.length,
            data
          );
          stillLoading = false;
        } else {
          editor_exports.insertAtPos(data, cursorPos);
        }
        cursorPos += data.length;
        if (onDataReceived)
          onDataReceived(data);
      } catch (error) {
        console.error("Error handling chat stream data:", error);
        editor_exports.flashNotification(
          "An error occurred while processing chat data.",
          "error"
        );
      }
    };
    await this.chatWithAI({ ...options, onDataReceived: onData });
  }
  async singleMessageChat(userMessage, systemPrompt, enrichMessages = false) {
    let messages = [
      {
        role: "user",
        content: userMessage
      }
    ];
    if (systemPrompt) {
      messages.unshift({
        role: "system",
        content: systemPrompt
      });
    }
    if (enrichMessages) {
      messages = await enrichChatMessages(messages);
    }
    return await this.chatWithAI({
      messages,
      stream: false
    });
  }
};

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/providers/gemini.ts
var GeminiProvider = class extends AbstractProvider {
  name = "Gemini";
  constructor(apiKey2, modelName) {
    const baseUrl = "https://generativelanguage.googleapis.com";
    super("Gemini", apiKey2, baseUrl, modelName);
  }
  async listModels() {
    const apiUrl = `${this.baseUrl}/v1beta/models?key=${this.apiKey}`;
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error("Failed to fetch models:", error);
      throw error;
    }
  }
  async chatWithAI({ messages, stream, onDataReceived }) {
    if (stream) {
      return await this.streamChat({ messages, stream, onDataReceived });
    } else {
      return await this.nonStreamingChat(messages);
    }
  }
  mapRolesForGemini(messages) {
    const payloadContents = [];
    let previousRole = "";
    messages.forEach((message) => {
      let role = "user";
      if (message.role === "system" || message.role === "user") {
        role = "user";
      } else if (message.role === "assistant") {
        role = "model";
      }
      if (role === "model" && (payloadContents.length === 0 || previousRole === "model")) {
      } else if (role === "user" && previousRole === "user") {
        payloadContents[payloadContents.length - 1].parts[0].text += " " + message.content;
      } else {
        payloadContents.push({
          role,
          parts: [{ text: message.content }]
        });
      }
      previousRole = role;
    });
    return payloadContents;
  }
  streamChat(options) {
    const { messages, onDataReceived } = options;
    try {
      const sseUrl = `${this.baseUrl}/v1beta/models/${this.modelName}:streamGenerateContent?key=${this.apiKey}&alt=sse`;
      const headers = {
        "Content-Type": "application/json"
      };
      const payloadContents = this.mapRolesForGemini(
        messages
      );
      const sseOptions = {
        method: "POST",
        headers,
        payload: JSON.stringify({
          contents: payloadContents
        }),
        withCredentials: false
      };
      const source = new SSE(sseUrl, sseOptions);
      let fullMsg = "";
      source.addEventListener("message", (e) => {
        try {
          if (e.data == "[DONE]") {
            source.close();
            return fullMsg;
          } else if (!e.data) {
            console.error("Received empty message from Gemini");
            console.log("source: ", source);
          } else {
            const data = JSON.parse(e.data);
            const msg = data.candidates[0].content.parts[0].text || data.text || "";
            fullMsg += msg;
            if (onDataReceived)
              onDataReceived(msg);
          }
        } catch (error) {
          console.error("Error processing message event:", error, e.data);
        }
      });
      source.addEventListener("end", () => {
        source.close();
        return fullMsg;
      });
      source.addEventListener("error", (e) => {
        console.error("SSE error:", e);
        source.close();
      });
      source.stream();
    } catch (error) {
      console.error("Error streaming from Gemini chat endpoint:", error);
      throw error;
    }
  }
  async nonStreamingChat(messages) {
    const payloadContents = this.mapRolesForGemini(
      messages
    );
    const response = await nativeFetch(
      `${this.baseUrl}/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ contents: payloadContents })
      }
    );
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const responseData = await response.json();
    return responseData.candidates[0].content.parts[0].text;
  }
};
var GeminiEmbeddingProvider = class extends AbstractEmbeddingProvider {
  constructor(apiKey2, modelName, baseUrl = "https://generativelanguage.googleapis.com", requireAuth = true) {
    super(apiKey2, baseUrl, "Gemini", modelName, requireAuth);
  }
  async _generateEmbeddings(options) {
    const body = JSON.stringify({
      model: this.modelName,
      content: {
        parts: [{ text: options.text }]
      }
    });
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.requireAuth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    const response = await nativeFetch(
      `${this.baseUrl}/v1beta/models/${this.modelName}:embedContent?key=${this.apiKey}`,
      {
        method: "POST",
        headers,
        body
      }
    );
    if (!response.ok) {
      console.error("HTTP response: ", response);
      console.error("HTTP response body: ", await response.json());
      throw new Error(`HTTP error, status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.embedding || !data.embedding.values) {
      throw new Error("Invalid response from Gemini.");
    }
    return data.embedding.values;
  }
};

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/providers/openai.ts
var OpenAIProvider = class extends AbstractProvider {
  name = "OpenAI";
  requireAuth;
  constructor(apiKey2, modelName, baseUrl, requireAuth) {
    super("OpenAI", apiKey2, baseUrl, modelName);
    this.requireAuth = requireAuth;
  }
  async chatWithAI({ messages, stream, onDataReceived }) {
    if (stream) {
      return await this.streamChat({ messages, onDataReceived });
    } else {
      return await this.nonStreamingChat(messages);
    }
  }
  async streamChat(options) {
    const { messages, onDataReceived } = options;
    try {
      const sseUrl = `${this.baseUrl}/chat/completions`;
      const headers = {
        "Content-Type": "application/json"
      };
      if (this.requireAuth) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }
      const sseOptions = {
        method: "POST",
        headers,
        payload: JSON.stringify({
          model: this.modelName,
          stream: true,
          messages
        }),
        withCredentials: false
      };
      const source = new SSE(sseUrl, sseOptions);
      let fullMsg = "";
      source.addEventListener("message", function(e) {
        try {
          if (e.data == "[DONE]") {
            source.close();
            return fullMsg;
          } else {
            const data = JSON.parse(e.data);
            const msg = data.choices[0]?.delta?.content || "";
            fullMsg += msg;
            if (onDataReceived) {
              onDataReceived(msg);
            }
          }
        } catch (error) {
          console.error("Error processing message event:", error, e.data);
        }
      });
      source.addEventListener("end", function() {
        source.close();
        return fullMsg;
      });
      source.addEventListener("error", (e) => {
        console.error("SSE error:", e);
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
    return "";
  }
  async nonStreamingChat(messages) {
    try {
      const body = JSON.stringify({
        model: this.modelName,
        messages
      });
      const headers = {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      };
      const response = await nativeFetch(
        this.baseUrl + "/chat/completions",
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
      return data.choices[0].message.content;
    } catch (error) {
      console.error("Error calling OpenAI chat endpoint:", error);
      await editor_exports.flashNotification(
        "Error calling OpenAI chat endpoint.",
        "error"
      );
      throw error;
    }
  }
};
var OpenAIEmbeddingProvider = class extends AbstractEmbeddingProvider {
  constructor(apiKey2, modelName, baseUrl, requireAuth = true) {
    super(apiKey2, baseUrl, "OpenAI", modelName, requireAuth);
  }
  async _generateEmbeddings(options) {
    const body = JSON.stringify({
      model: this.modelName,
      input: options.text,
      encoding_format: "float"
    });
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.requireAuth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    const response = await nativeFetch(
      `${this.baseUrl}/embeddings`,
      {
        method: "POST",
        headers,
        body
      }
    );
    if (!response.ok) {
      console.error("HTTP response: ", response);
      console.error("HTTP response body: ", await response.json());
      throw new Error(`HTTP error, status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.data || data.data.length === 0) {
      throw new Error("Invalid response from OpenAI.");
    }
    return data.data[0].embedding;
  }
};

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/providers/ollama.ts
var OllamaProvider = class extends AbstractProvider {
  name = "Ollama";
  requireAuth;
  openaiProvider;
  constructor(apiKey2, modelName, baseUrl, requireAuth) {
    super("Ollama", apiKey2, baseUrl, modelName);
    this.requireAuth = requireAuth;
    this.openaiProvider = new OpenAIProvider(
      apiKey2,
      modelName,
      baseUrl,
      requireAuth
    );
  }
  async chatWithAI({ messages, stream, onDataReceived }) {
    return await this.openaiProvider.chatWithAI({
      messages,
      stream,
      onDataReceived
    });
  }
};
var OllamaEmbeddingProvider = class extends AbstractEmbeddingProvider {
  constructor(apiKey2, modelName, baseUrl, requireAuth = false) {
    super(apiKey2, baseUrl, "Ollama", modelName, requireAuth);
  }
  // Ollama doesn't have an openai compatible api for embeddings yet, so it gets its own provider
  async _generateEmbeddings(options) {
    const body = JSON.stringify({
      model: this.modelName,
      prompt: options.text
    });
    const headers = {
      "Content-Type": "application/json"
    };
    if (this.requireAuth) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    const response = await nativeFetch(
      `${this.baseUrl}/api/embeddings`,
      {
        method: "POST",
        headers,
        body
      }
    );
    if (!response.ok) {
      console.error("HTTP response: ", response);
      console.error("HTTP response body: ", await response.json());
      throw new Error(`HTTP error, status: ${response.status}`);
    }
    const data = await response.json();
    if (!data || !data.embedding || data.embedding.length === 0) {
      throw new Error("Invalid response from Ollama.");
    }
    return data.embedding;
  }
};

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/mocks/mockproviders.ts
var MockProvider = class extends AbstractProvider {
  constructor(apiKey2, modelName, baseUrl = "http://localhost") {
    super(apiKey2, baseUrl, "mock", modelName);
  }
  async chatWithAI(options) {
    const mockResponse = "This is a mock response from the AI.";
    if (options.onDataReceived) {
      for (const char of mockResponse) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        options.onDataReceived(char);
      }
    }
    return mockResponse;
  }
};
var MockImageProvider = class extends AbstractImageProvider {
  constructor(apiKey2, modelName, baseUrl = "http://localhost") {
    super(apiKey2, baseUrl, "mock", modelName);
  }
  generateImage(options) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve("https://example.com/mock-image.jpg");
      }, 5);
    });
  }
};
var MockEmbeddingProvider = class extends AbstractEmbeddingProvider {
  constructor(apiKey2, modelName, baseUrl = "http://localhost") {
    super(apiKey2, baseUrl, "mock", modelName);
  }
  _generateEmbeddings(options) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockEmbedding = Array(1536).fill(0).map(() => Math.random());
        resolve(mockEmbedding);
      }, 5);
    });
  }
};

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/init.ts
var apiKey;
var aiSettings;
var chatSystemPrompt;
var currentAIProvider;
var currentImageProvider;
var currentEmbeddingProvider;
var currentModel;
var currentImageModel;
var currentEmbeddingModel;
async function initIfNeeded() {
  const selectedModel = await getSelectedTextModel();
  if (!apiKey || !currentAIProvider || !aiSettings || !currentModel || JSON.stringify(selectedModel) !== JSON.stringify(currentModel)) {
    await initializeOpenAI(true);
  }
}
async function getSelectedTextModel() {
  if (await system_exports.getEnv() == "server") {
    return void 0;
  }
  try {
    return await clientStore_exports.get("ai.selectedTextModel");
  } catch (error) {
    return void 0;
  }
}
async function getSelectedImageModel() {
  if (await system_exports.getEnv() == "server") {
    return void 0;
  }
  try {
    return await clientStore_exports.get("ai.selectedImageModel");
  } catch (error) {
    return void 0;
  }
}
async function getSelectedEmbeddingModel() {
  if (await system_exports.getEnv() == "server") {
    return;
  }
  try {
    return await clientStore_exports.get("ai.selectedEmbeddingModel");
  } catch (error) {
    return void 0;
  }
}
async function setSelectedImageModel(model) {
  if (await system_exports.getEnv() == "server") {
    return;
  }
  await clientStore_exports.set("ai.selectedImageModel", model);
}
async function setSelectedTextModel(model) {
  if (await system_exports.getEnv() == "server") {
    return;
  }
  await clientStore_exports.set("ai.selectedTextModel", model);
}
async function setSelectedEmbeddingModel(model) {
  if (await system_exports.getEnv() == "server") {
    return;
  }
  await clientStore_exports.set("ai.selectedEmbeddingModel", model);
}
async function getAndConfigureModel() {
  const selectedModel = await getSelectedTextModel() || aiSettings.textModels[0];
  if (!selectedModel) {
    throw new Error("No text model selected or available as default.");
  }
  await configureSelectedModel(selectedModel);
}
async function getAndConfigureImageModel() {
  const selectedImageModel = await getSelectedImageModel() || aiSettings.imageModels[0];
  if (!selectedImageModel) {
    throw new Error("No image model selected or available as default.");
  }
  await configureSelectedImageModel(selectedImageModel);
}
async function getAndConfigureEmbeddingModel() {
  const selectedEmbeddingModel = await getSelectedEmbeddingModel() || aiSettings.embeddingModels[0];
  if (!selectedEmbeddingModel) {
    throw new Error("No embedding model selected or available as default.");
  }
  await configureSelectedEmbeddingModel(selectedEmbeddingModel);
}
function setupImageProvider(model) {
  const providerName = model.provider.toLowerCase();
  log("client", "Provider name", providerName);
  switch (providerName) {
    case "dalle" /* DallE */:
      currentImageProvider = new DallEProvider(
        apiKey,
        model.modelName,
        model.baseUrl || aiSettings.dallEBaseUrl
      );
      break;
    case "mock" /* Mock */:
      currentImageProvider = new MockImageProvider(
        apiKey,
        model.modelName
      );
      break;
    default:
      throw new Error(
        `Unsupported image provider: ${model.provider}. Please configure a supported provider.`
      );
  }
}
function setupAIProvider(model) {
  const providerName = model.provider.toLowerCase();
  switch (providerName) {
    case "openai" /* OpenAI */:
      currentAIProvider = new OpenAIProvider(
        apiKey,
        model.modelName,
        model.baseUrl || aiSettings.openAIBaseUrl,
        model.requireAuth || aiSettings.requireAuth
      );
      break;
    case "gemini" /* Gemini */:
      currentAIProvider = new GeminiProvider(apiKey, model.modelName);
      break;
    case "ollama" /* Ollama */:
      currentAIProvider = new OllamaProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "http://localhost:11434/v1",
        model.requireAuth
      );
      break;
    case "mock" /* Mock */:
      currentAIProvider = new MockProvider(
        apiKey,
        model.modelName,
        model.baseUrl
      );
      break;
    default:
      throw new Error(
        `Unsupported AI provider: ${model.provider}. Please configure a supported provider.`
      );
  }
  return currentAIProvider;
}
function setupEmbeddingProvider(model) {
  const providerName = model.provider.toLowerCase();
  switch (providerName) {
    case "openai" /* OpenAI */:
      currentEmbeddingProvider = new OpenAIEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || aiSettings.openAIBaseUrl
      );
      break;
    case "gemini" /* Gemini */:
      currentEmbeddingProvider = new GeminiEmbeddingProvider(
        apiKey,
        model.modelName
      );
      break;
    case "ollama" /* Ollama */:
      currentEmbeddingProvider = new OllamaEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl || "http://localhost:11434",
        model.requireAuth
      );
      break;
    case "mock" /* Mock */:
      currentEmbeddingProvider = new MockEmbeddingProvider(
        apiKey,
        model.modelName,
        model.baseUrl
      );
      break;
    default:
      throw new Error(
        `Unsupported embedding provider: ${model.provider}. Please configure a supported provider.`
      );
  }
}
async function configureSelectedModel(model) {
  log("client", "configureSelectedModel called with:", model);
  if (!model) {
    throw new Error("No model provided to configure");
  }
  model.requireAuth = model.requireAuth ?? aiSettings.requireAuth;
  if (model.requireAuth) {
    try {
      const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
      if (newApiKey !== apiKey) {
        apiKey = newApiKey;
        log("client", "API key updated");
      }
    } catch (error) {
      console.error("Error reading secret:", error);
      throw new Error(
        "Failed to read the AI API key. Please check the SECRETS page."
      );
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing. Please set it in the secrets page."
    );
  }
  currentModel = model;
  return setupAIProvider(model);
}
async function configureSelectedImageModel(model) {
  log("client", "configureSelectedImageModel called with:", model);
  if (!model) {
    throw new Error("No image model provided to configure");
  }
  if (model.requireAuth) {
    const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      log("client", "API key updated for image model");
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing for image model. Please set it in the secrets page."
    );
  }
  currentImageModel = model;
  setupImageProvider(model);
}
async function configureSelectedEmbeddingModel(model) {
  log("client", "configureSelectedEmbeddingModel called with:", model);
  if (!model) {
    throw new Error("No embedding model provided to configure");
  }
  if (model.requireAuth) {
    const newApiKey = await readSecret(model.secretName || "OPENAI_API_KEY");
    if (newApiKey !== apiKey) {
      apiKey = newApiKey;
      log("client", "API key updated for embedding model");
    }
  }
  if (model.requireAuth && !apiKey) {
    throw new Error(
      "AI API key is missing for embedding model. Please set it in the secrets page."
    );
  }
  currentEmbeddingModel = model;
  setupEmbeddingProvider(model);
}
async function loadAndMergeSettings() {
  const defaultSettings = {
    openAIBaseUrl: "https://api.openai.com/v1",
    dallEBaseUrl: "https://api.openai.com/v1",
    requireAuth: true,
    secretName: "OPENAI_API_KEY",
    provider: "OpenAI",
    chat: {},
    promptInstructions: {},
    imageModels: [],
    embeddingModels: [],
    textModels: [],
    indexEmbeddings: false,
    indexSummary: false,
    indexSummaryModelName: "",
    indexEmbeddingsExcludePages: [],
    indexEmbeddingsExcludeStrings: ["**user**:"]
  };
  const defaultChatSettings = {
    userInformation: "",
    userInstructions: "",
    parseWikiLinks: true,
    bakeMessages: true,
    customEnrichFunctions: [],
    searchEmbeddings: false
  };
  const defaultPromptInstructions = {
    pageRenameSystem: "",
    pageRenameRules: "",
    tagRules: "",
    indexSummaryPrompt: "",
    enhanceFrontMatterPrompt: ""
  };
  const newSettings = await system_exports.getSpaceConfig("ai", {});
  const newCombinedSettings = { ...defaultSettings, ...newSettings };
  newCombinedSettings.chat = {
    ...defaultChatSettings,
    ...newSettings.chat || {}
  };
  newCombinedSettings.promptInstructions = {
    ...defaultPromptInstructions,
    ...newSettings.promptInstructions || {}
  };
  return newCombinedSettings;
}
async function initializeOpenAI(configure = true) {
  const newCombinedSettings = await loadAndMergeSettings();
  if (!aiSettings || JSON.stringify(aiSettings) !== JSON.stringify(newCombinedSettings)) {
    log("client", "aiSettings updating from", aiSettings);
    aiSettings = newCombinedSettings;
    log("client", "aiSettings updated to", aiSettings);
  } else {
    log("client", "aiSettings unchanged", aiSettings);
  }
  if (aiSettings.textModels.length === 1) {
    await setSelectedTextModel(aiSettings.textModels[0]);
  }
  if (aiSettings.imageModels.length === 1) {
    await setSelectedImageModel(aiSettings.imageModels[0]);
  }
  if (aiSettings.embeddingModels.length === 1) {
    await setSelectedEmbeddingModel(aiSettings.embeddingModels[0]);
  }
  if (configure) {
    if (aiSettings.textModels.length > 0) {
      await getAndConfigureModel();
    }
    if (aiSettings.imageModels.length > 0) {
      await getAndConfigureImageModel();
    }
    if (aiSettings.embeddingModels.length > 0) {
      await getAndConfigureEmbeddingModel();
    }
  }
  chatSystemPrompt = {
    role: "system",
    content: `This is an interactive chat session with a user in a markdown-based note-taking tool called SilverBullet.`
  };
  if (aiSettings.chat.userInformation) {
    chatSystemPrompt.content += `
The user has provided the following information about themselves: ${aiSettings.chat.userInformation}`;
  }
  if (aiSettings.chat.userInstructions) {
    chatSystemPrompt.content += `
The user has provided the following instructions for the chat, follow them as closely as possible: ${aiSettings.chat.userInstructions}`;
  }
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/embeddings.ts
var searchPrefix = "\u{1F916} ";
function canIndexPage(pageName) {
  const excludePages = [
    "SETTINGS",
    "SECRETS",
    ...aiSettings.indexEmbeddingsExcludePages
  ];
  if (excludePages.includes(pageName) || pageName.startsWith("_") || pageName.startsWith("Library/") || /\.conflicted\.\d+$/.test(pageName)) {
    return false;
  }
  return true;
}
async function shouldIndexEmbeddings() {
  await initIfNeeded();
  return aiSettings.indexEmbeddings && currentEmbeddingProvider !== void 0 && currentEmbeddingModel !== void 0 && aiSettings.embeddingModels.length > 0 && await system_exports.getEnv() === "server";
}
async function shouldIndexSummaries() {
  await initIfNeeded();
  return aiSettings.indexEmbeddings && aiSettings.indexSummary && currentEmbeddingProvider !== void 0 && currentEmbeddingModel !== void 0 && aiSettings.embeddingModels.length > 0 && await system_exports.getEnv() === "server";
}
async function indexEmbeddings(page) {
  if (!await shouldIndexEmbeddings()) {
    return;
  }
  if (!canIndexPage(page)) {
    return;
  }
  const pageText = await space_exports.readPage(page);
  const tree = await markdown_exports.parseMarkdown(pageText);
  if (!tree.children) {
    return;
  }
  const paragraphs = tree.children.filter((node) => node.type === "Paragraph");
  const objects = [];
  const startTime = Date.now();
  for (const paragraph of paragraphs) {
    const paragraphText = renderToText(paragraph).trim();
    if (!paragraphText || paragraphText.length < 10) {
      continue;
    }
    if (aiSettings.indexEmbeddingsExcludeStrings.some(
      (s) => paragraphText.includes(s)
    )) {
      continue;
    }
    const embedding = await currentEmbeddingProvider.generateEmbeddings({
      text: paragraphText
    });
    const pos = paragraph.from ?? 0;
    const embeddingObject = {
      ref: `${page}@${pos}`,
      page,
      pos,
      embedding,
      text: paragraphText,
      tag: "embedding"
    };
    objects.push(embeddingObject);
  }
  await indexObjects(page, objects);
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1e3;
  log(
    "any",
    `AI: Indexed ${objects.length} embedding objects for page ${page} in ${duration} seconds`
  );
}
async function indexSummary(page) {
  if (!await shouldIndexSummaries()) {
    return;
  }
  if (!canIndexPage(page)) {
    return;
  }
  const text = await space_exports.readPage(page);
  const tree = await markdown_exports.parseMarkdown(text);
  if (!tree.children) {
    return;
  }
  const startTime = Date.now();
  const pageText = renderToText(tree);
  const summaryModel = aiSettings.textModels.find(
    (model) => model.name === aiSettings.indexSummaryModelName
  );
  if (!summaryModel) {
    throw new Error(
      `Could not find summary model ${aiSettings.indexSummaryModelName}`
    );
  }
  const summaryProvider = await configureSelectedModel(summaryModel);
  let summaryPrompt;
  if (aiSettings.promptInstructions.indexSummaryPrompt !== "") {
    summaryPrompt = aiSettings.promptInstructions.indexSummaryPrompt;
  } else {
    summaryPrompt = "Provide a concise and informative summary of the above page. The summary should capture the key points and be useful for search purposes. Avoid any formatting or extraneous text.  No more than one paragraph.  Summary:\n";
  }
  const cacheKey = await hashStrings(
    summaryModel.name,
    pageText,
    summaryPrompt
  );
  let summary = getCache(cacheKey);
  if (!summary) {
    summary = await summaryProvider.singleMessageChat(
      "Contents of " + page + ":\n" + pageText + "\n\n" + summaryPrompt
    );
    setCache(cacheKey, summary);
  }
  const summaryEmbeddings = await currentEmbeddingProvider.generateEmbeddings({
    text: summary
  });
  const summaryObject = {
    ref: `${page}@0`,
    page,
    embedding: summaryEmbeddings,
    text: summary,
    tag: "aiSummary"
  };
  await indexObjects(page, [summaryObject]);
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1e3;
  log(
    "any",
    `AI: Indexed summary for page ${page} in ${duration} seconds`
  );
}
async function queueEmbeddingGeneration({ name: page, tree }) {
  await initIfNeeded();
  if (!canIndexPage(page)) {
    return;
  }
  if (!tree.children) {
    return;
  }
  if (await shouldIndexEmbeddings()) {
    await mq_exports.send("aiEmbeddingsQueue", page);
  }
  if (await shouldIndexSummaries()) {
    await mq_exports.send("aiSummaryQueue", page);
  }
}
async function processEmbeddingsQueue(messages) {
  await initIfNeeded();
  for (const message of messages) {
    const pageName = message.body;
    console.log(`AI: Generating and indexing embeddings for file ${pageName}`);
    await indexEmbeddings(pageName);
  }
  const queueStats = await mq_exports.getQueueStats("aiEmbeddingsQueue");
  console.log(`AI: Embeddings queue stats: ${JSON.stringify(queueStats)}`);
}
async function processSummaryQueue(messages) {
  await initIfNeeded();
  for (const message of messages) {
    const pageName = message.body;
    console.log(`AI: Generating and indexing summary for ${pageName}`);
    await indexSummary(pageName);
  }
  const queueStats = await mq_exports.getQueueStats("aiSummaryQueue");
  console.log(`AI: Summary queue stats: ${JSON.stringify(queueStats)}`);
}
async function getAllEmbeddings() {
  if (await supportsServerProxyCall()) {
    return await syscall(
      "system.invokeFunctionOnServer",
      "index.queryObjects",
      "embedding",
      {}
    );
  } else {
    return await queryObjects("embedding", {});
  }
}
async function getAllAISummaries() {
  if (await supportsServerProxyCall()) {
    return await syscall(
      "system.invokeFunctionOnServer",
      "index.queryObjects",
      "aiSummary",
      {}
    );
  } else {
    return await queryObjects("aiSummary", {});
  }
}
async function generateEmbeddings(text) {
  await initIfNeeded();
  if (!currentEmbeddingProvider || !currentEmbeddingModel) {
    throw new Error("No embedding provider found");
  }
  return await currentEmbeddingProvider.generateEmbeddings({ text });
}
async function generateEmbeddingsOnServer(text) {
  return await syscall(
    "system.invokeFunctionOnServer",
    "silverbullet-ai.generateEmbeddings",
    text
  );
}
function cosineSimilarity(vecA, vecB) {
  const dotProduct = vecA.reduce((sum, a, idx) => sum + a * vecB[idx], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}
async function searchEmbeddings(query2, numResults = 10, updateEditorProgress = false) {
  await initIfNeeded();
  if (await system_exports.getEnv() === "server") {
    updateEditorProgress = false;
  }
  const startEmbeddingGeneration = Date.now();
  const queryEmbedding = typeof query2 === "string" ? await generateEmbeddingsOnServer(query2) : query2;
  const endEmbeddingGeneration = Date.now();
  console.log(
    `searchEmbeddings: Query embedding generation took ${endEmbeddingGeneration - startEmbeddingGeneration} ms`
  );
  const startRetrievingEmbeddings = Date.now();
  const embeddings = await getAllEmbeddings();
  const endRetrievingEmbeddings = Date.now();
  console.log(
    `Retrieved ${embeddings.length} embeddings in ${endRetrievingEmbeddings - startRetrievingEmbeddings} ms`
  );
  let progressText = "";
  let progressStartPos = 0;
  if (updateEditorProgress) {
    progressText = `Retrieved ${embeddings.length} embeddings in ${endRetrievingEmbeddings - startRetrievingEmbeddings} ms

`;
    progressStartPos = (await editor_exports.getText()).length;
    await editor_exports.replaceRange(progressStartPos, progressStartPos, progressText);
  }
  const results = [];
  let lastUpdateTime = Date.now();
  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];
    if (!canIndexPage(embedding.page)) {
      continue;
    }
    results.push({
      page: embedding.page,
      ref: embedding.ref,
      text: embedding.text,
      similarity: cosineSimilarity(queryEmbedding, embedding.embedding)
    });
    if (updateEditorProgress && (i % 100 === 0 || Date.now() - lastUpdateTime >= 100)) {
      const pageLength = progressStartPos + progressText.length;
      progressText = `

Processed ${i + 1} of ${embeddings.length} embeddings...

`;
      await editor_exports.replaceRange(progressStartPos, pageLength, progressText);
      lastUpdateTime = Date.now();
    }
    if (updateEditorProgress && i >= embeddings.length - 1) {
      const pageLength = progressStartPos + progressText.length;
      await editor_exports.replaceRange(progressStartPos, pageLength, "");
    }
  }
  console.log(
    `Finished searching embeddings in ${Date.now() - startRetrievingEmbeddings} ms`
  );
  if (aiSettings.indexSummary) {
    const startRetrievingSummaries = Date.now();
    const summaries = await getAllAISummaries();
    const endRetrievingSummaries = Date.now();
    console.log(
      `Retrieved ${summaries.length} summaries in ${endRetrievingSummaries - startRetrievingSummaries} ms`
    );
    let progressText2 = "";
    let progressStartPos2 = 0;
    if (updateEditorProgress) {
      progressText2 = `Retrieved ${summaries.length} summaries in ${endRetrievingSummaries - startRetrievingSummaries} ms

`;
      progressStartPos2 = (await editor_exports.getText()).length;
      await editor_exports.replaceRange(
        progressStartPos2,
        progressStartPos2,
        progressText2
      );
    }
    const summaryResults = [];
    let lastUpdateTime2 = Date.now();
    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      if (!canIndexPage(summary.page)) {
        continue;
      }
      summaryResults.push({
        page: summary.page,
        ref: summary.ref,
        text: `Page Summary: ${summary.text}`,
        similarity: cosineSimilarity(queryEmbedding, summary.embedding)
      });
      if (updateEditorProgress && (i % 100 === 0 || Date.now() - lastUpdateTime2 >= 100)) {
        const pageLength = progressStartPos2 + progressText2.length;
        progressText2 = `

Processed ${i + 1} of ${summaries.length} summaries...

`;
        await editor_exports.replaceRange(progressStartPos2, pageLength, progressText2);
        lastUpdateTime2 = Date.now();
      }
      if (updateEditorProgress && i >= summaries.length - 1) {
        const pageLength = progressStartPos2 + progressText2.length;
        await editor_exports.replaceRange(progressStartPos2, pageLength, "");
      }
    }
    console.log(
      `Finished searching summaries in ${Date.now() - startRetrievingSummaries} ms`
    );
    results.push(...summaryResults);
  }
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, numResults);
}
async function searchSummaryEmbeddings(query2, numResults = 10) {
  await initIfNeeded();
  const queryEmbedding = await generateEmbeddingsOnServer(query2);
  const summaries = await getAllAISummaries();
  const results = summaries.map((summary) => ({
    page: summary.page,
    ref: summary.ref,
    text: summary.text,
    similarity: cosineSimilarity(queryEmbedding, summary.embedding)
  }));
  return results.sort((a, b) => b.similarity - a.similarity).slice(0, numResults);
}
async function searchCombinedEmbeddings(query2, numResults = 10, minSimilarity = 0.15, updateEditorProgress = false) {
  let searchResults;
  searchResults = await searchEmbeddings(query2, -1, updateEditorProgress);
  const combinedResults = {};
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
        children: [result]
      };
    }
  }
  for (const page in combinedResults) {
    combinedResults[page].children = combinedResults[page].children.sort((a, b) => b.similarity - a.similarity).slice(0, numResults);
  }
  const combinedResultsArray = Object.values(combinedResults);
  return combinedResultsArray.sort((a, b) => b.score - a.score).slice(0, numResults);
}
async function searchEmbeddingsForChat(query2, numResults = 10) {
  try {
    const searchResults = await searchCombinedEmbeddings(query2, numResults);
    let results = "";
    if (searchResults.length > 0) {
      for (const r of searchResults) {
        results += `>>${r.page}<<
`;
        for (const child of r.children) {
          results += `> ${child.text}

`;
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
function readFileEmbeddings(name) {
  return {
    data: new TextEncoder().encode(""),
    meta: {
      name,
      contentType: "text/markdown",
      size: 0,
      created: 0,
      lastModified: 0,
      perm: "ro"
    }
  };
}
function getFileMetaEmbeddings(name) {
  return {
    name,
    contentType: "text/markdown",
    size: -1,
    created: 0,
    lastModified: 0,
    perm: "ro"
  };
}
function writeFileEmbeddings(name) {
  return getFileMetaEmbeddings(name);
}
async function updateSearchPage() {
  const page = await editor_exports.getCurrentPage();
  if (page.startsWith(searchPrefix)) {
    await initIfNeeded();
    const phrase = page.substring(searchPrefix.length);
    const pageHeader = `# Search results for "${phrase}"`;
    let text = pageHeader + "\n\n";
    if (!aiSettings.indexEmbeddings) {
      text += "> **warning** Embeddings generation is disabled.\n";
      text += "> You can enable it in the AI settings.\n\n\n";
      await editor_exports.setText(text);
      return;
    }
    let loadingText = `${pageHeader}

Searching for "${phrase}"...`;
    loadingText += "\nGenerating query vector embeddings..";
    await editor_exports.setText(loadingText);
    let queryEmbedding = [];
    try {
      queryEmbedding = await generateEmbeddingsOnServer(phrase);
    } catch (error) {
      console.error("Error generating query vector embeddings", error);
      loadingText += "\n\n> **error** \u26A0\uFE0F Failed to generate query vector embeddings.\n";
      loadingText += `> ${error}

`;
      await editor_exports.setText(loadingText);
      return;
    }
    loadingText += "\nSearching for similar embeddings...";
    await editor_exports.setText(loadingText);
    let results = [];
    try {
      results = await searchCombinedEmbeddings(
        queryEmbedding,
        void 0,
        void 0,
        true
      );
    } catch (error) {
      console.error("Error searching embeddings", error);
      loadingText += "\n\n> **error** \u26A0\uFE0F Failed to search through embeddings.\n";
      loadingText += `> ${error}

`;
      await editor_exports.setText(loadingText);
      return;
    }
    const pageLength = loadingText.length;
    text = pageHeader + "\n\n";
    if (results.length === 0) {
      text += "No results found.\n\n";
    }
    for (const r of results) {
      text += `## [[${r.page}]]
`;
      for (const child of r.children) {
        const childLineNo = child.ref.split("@")[1];
        const childLineNoPadded = childLineNo.padStart(4, " ");
        text += `> [[${child.ref}|${childLineNoPadded}]] | ${child.text}
`;
      }
    }
    await editor_exports.replaceRange(0, pageLength, text);
  }
}
async function searchCommand() {
  const phrase = await editor_exports.prompt("Search for: ");
  if (phrase) {
    await editor_exports.navigate({ page: `${searchPrefix}${phrase}` });
  }
}

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/utils.ts
function folderName(path) {
  return path.split("/").slice(0, -1).join("/");
}
async function log(env, ...args) {
  const currentEnv = await system_exports.getEnv();
  if (currentEnv === env || env === "any") {
    console.log(...args);
  }
}
async function query(query2, variables) {
  const parsedQuery = await parseQuery(query2);
  return queryParsed(parsedQuery, variables);
}
async function queryParsed(parsedQuery, variables) {
  if (!parsedQuery.limit) {
    parsedQuery.limit = ["number", 1e3];
  }
  const eventName = `query:${parsedQuery.querySource}`;
  const event = { query: parsedQuery };
  if (variables) {
    event.variables = variables;
  }
  const results = await event_exports.dispatchEvent(eventName, event, 30 * 1e3);
  if (results.length === 0) {
    throw new Error(`Unsupported query source '${parsedQuery.querySource}'`);
  }
  return results.flat();
}
async function queryObjects(query2, variables) {
  return await system_exports.invokeFunction("index.queryObjects", query2, variables);
}
async function indexObjects(page, objects) {
  return await system_exports.invokeFunction("index.indexObjects", page, objects);
}
async function convertPageToMessages(pageText) {
  if (!pageText) {
    pageText = await editor_exports.getText();
  }
  const tree = await markdown_exports.parseMarkdown(pageText);
  await extractFrontmatter(tree, {
    removeFrontmatterSection: true
  });
  pageText = renderToText(tree);
  const lines = pageText.split("\n");
  const messages = [];
  let currentRole = "user";
  let contentBuffer = "";
  lines.forEach((line) => {
    if (line.trim() === "") {
      return;
    }
    const match = line.match(/^\*\*(\w+)\*\*:/);
    if (match) {
      const newRole = match[1].toLowerCase();
      if (currentRole && currentRole !== newRole && contentBuffer.trim() !== "") {
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
async function supportsPlugSlashComplete() {
  try {
    const ver = await syscall("system.getVersion");
    const [major, minor, patch] = ver.split(".").map(Number);
    const [reqMajor, reqMinor, reqPatch] = "0.7.2".split(".").map(Number);
    if (major > reqMajor)
      return true;
    if (major === reqMajor && minor > reqMinor)
      return true;
    if (major === reqMajor && minor === reqMinor && patch >= reqPatch) {
      return true;
    }
    return false;
  } catch (_err) {
    return false;
  }
}
async function supportsServerProxyCall() {
  try {
    const syscalls = await system_exports.listSyscalls();
    return syscalls.some(
      (syscall4) => syscall4.name === "system.invokeFunctionOnServer"
    );
  } catch (_err) {
    return false;
  }
}
async function enrichChatMessages(messages) {
  const enrichedMessages = [];
  let currentPage, pageMeta;
  try {
    currentPage = await editor_exports.getCurrentPage();
    pageMeta = await space_exports.getPageMeta(currentPage);
  } catch (error) {
    console.error("Error fetching page metadata", error);
    await editor_exports.flashNotification(
      "Error fetching page metadata",
      "error"
    );
    return [];
  }
  for (const message of messages) {
    if (message.role === "assistant" || message.role === "system") {
      enrichedMessages.push(message);
      continue;
    }
    const messageTree = await markdown_exports.parseMarkdown(message.content);
    const messageAttributes = await extractAttributes(
      [],
      messageTree
    );
    message.content = message.content.replace(
      /\[enrich:\s*(false|true)\s*\]\s*/g,
      ""
    );
    if (messageAttributes.enrich !== void 0 && messageAttributes.enrich === false) {
      console.log(
        "Skipping message enrichment due to enrich=false attribute",
        messageAttributes
      );
      enrichedMessages.push(message);
      continue;
    }
    let enrichedContent = message.content;
    if (message.role === "user") {
      if (pageMeta) {
        console.log("Rendering template", message.content, pageMeta);
        const templateResult = await template_exports.renderTemplate(
          message.content,
          pageMeta,
          {
            page: pageMeta
          }
        );
        enrichedContent = templateResult;
      } else {
        console.log("No page metadata found, skipping template rendering");
      }
    }
    if (aiSettings.chat.searchEmbeddings && aiSettings.indexEmbeddings) {
      const searchResultsText = await searchEmbeddingsForChat(enrichedContent);
      if (searchResultsText !== "No relevant pages found.") {
        enrichedContent += `

The following pages were found to be relevant to the question. You can use them as context to answer the question. Only partial content is shown. Ask for the whole page if needed. Page name is between >> and <<.
`;
        enrichedContent += searchResultsText;
      }
    }
    if (aiSettings.chat.parseWikiLinks) {
      enrichedContent = await enrichMesssageWithWikiLinks(enrichedContent);
    }
    if (aiSettings.chat.bakeMessages) {
      const tree = await markdown_exports.parseMarkdown(enrichedContent);
      const rendered = await system_exports.invokeFunction(
        "markdown.expandCodeWidgets",
        tree,
        ""
      );
      enrichedContent = renderToText(rendered).trim();
    }
    const enrichFunctions = await event_exports.dispatchEvent(
      "ai:enrichMessage",
      {
        enrichedContent,
        message
      }
    );
    const combinedEnrichFunctions = enrichFunctions.flat().concat(
      aiSettings.chat.customEnrichFunctions
    );
    const finalEnrichFunctions = [...new Set(combinedEnrichFunctions)];
    console.log(
      "Received custom enrich message functions",
      finalEnrichFunctions
    );
    for (const func2 of finalEnrichFunctions) {
      enrichedContent = await system_exports.invokeSpaceFunction(func2, enrichedContent);
    }
    enrichedMessages.push({ ...message, content: enrichedContent });
  }
  return enrichedMessages;
}
async function enrichMesssageWithWikiLinks(content) {
  const seenPages = [];
  let enrichedContent = content;
  const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
  let match;
  let hasMatch = false;
  while ((match = wikiLinkRegex.exec(content)) !== null) {
    const pageName = match[1];
    if (seenPages.includes(pageName)) {
      continue;
    }
    if (!hasMatch) {
      enrichedContent += `

${"Base your answer on the content of the following referenced pages (referenced above using the >>page name<< format). In these listings ~~~ is used to mark the page's content start and end. If context is missing, always ask me to link directly to a page mentioned in the context."}`;
      hasMatch = true;
    }
    try {
      const pageContent = await space_exports.readPage(pageName);
      seenPages.push(pageName);
      enrichedContent += `

Content of the [[${pageName}]] page:
~~~
${pageContent}
~~~
`;
    } catch (error) {
      console.error(`Error fetching page '${pageName}':`, error);
    }
  }
  enrichedContent = enrichedContent.replace(wikiLinkRegex, ">>$1<<");
  return enrichedContent;
}

// https://deno.land/x/silverbullet@0.9.4/plugs/template/api.ts
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

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/src/prompts.ts
async function aiPromptSlashComplete(completeEvent) {
  if (!supportsPlugSlashComplete()) {
    return;
  }
  const allTemplates = await queryObjects("template", {
    filter: ["attr", ["attr", "aiprompt"], "slashCommand"]
  }, 5);
  return {
    options: allTemplates.map((template) => {
      const aiPromptTemplate = template.aiprompt;
      console.log("ai prompt template: ", aiPromptTemplate);
      return {
        label: aiPromptTemplate.slashCommand,
        detail: aiPromptTemplate.description || template.description,
        order: aiPromptTemplate.order || 0,
        templatePage: template.ref,
        pageName: completeEvent.pageName,
        invoke: "silverbullet-ai.insertAiPromptFromTemplate"
      };
    })
  };
}
async function insertAiPromptFromTemplate(SlashCompletions) {
  let selectedTemplate;
  if (!SlashCompletions || !SlashCompletions.templatePage) {
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
          insertAt: templateObj.aiprompt.insertAt || "cursor",
          chat: templateObj.aiprompt.chat || false,
          enrichMessages: templateObj.aiprompt.enrichMessages || false
          // parseAs: templateObj.aiprompt.parseAs || "markdown",
        };
      }),
      `Select the template to use as the prompt.  The prompt will be rendered and sent to the LLM model.`
    );
  } else {
    console.log("selectedTemplate from slash completion: ", SlashCompletions);
    const templatePage = await space_exports.readPage(SlashCompletions.templatePage);
    const tree = await markdown_exports.parseMarkdown(templatePage);
    const { aiprompt } = await extractFrontmatter(tree);
    console.log("templatePage from slash completion: ", templatePage);
    selectedTemplate = {
      ref: SlashCompletions.templatePage,
      systemPrompt: aiprompt.systemPrompt || aiprompt.system || "You are an AI note assistant. Please follow the prompt instructions.",
      insertAt: aiprompt.insertAt || "cursor",
      chat: aiprompt.chat || false,
      enrichMessages: aiprompt.enrichMessages || false
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
    // "replace",
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
  await initIfNeeded();
  let templateText, currentPage, pageMeta;
  try {
    templateText = await space_exports.readPage(selectedTemplate.ref);
    currentPage = await editor_exports.getCurrentPage();
    pageMeta = await space_exports.getPageMeta(currentPage);
  } catch (error) {
    console.error("Error fetching template details or page metadata", error);
    await editor_exports.flashNotification(
      "Error fetching template details or page metadata",
      "error"
    );
    return;
  }
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
    case "replace":
      break;
    case "cursor":
    default:
      cursorPos = await editor_exports.getCursor();
  }
  if (cursorPos === void 0) {
    cursorPos = await getPageLength();
  }
  console.log("templatetext: ", templateText);
  let messages = [];
  if (!selectedTemplate.chat) {
    const renderedTemplate = await renderTemplate2(templateText, pageMeta, {
      page: pageMeta
    });
    console.log("Rendered template:", renderedTemplate);
    if (selectedTemplate.systemPrompt) {
      messages.push({
        role: "system",
        content: selectedTemplate.systemPrompt
      });
    }
    messages.push({
      role: "user",
      content: renderedTemplate.text
    });
  } else {
    messages = await convertPageToMessages(templateText);
    if (selectedTemplate.systemPrompt) {
      messages.unshift({
        role: "system",
        content: selectedTemplate.systemPrompt
      });
    }
    if (selectedTemplate.chat && selectedTemplate.enrichMessages) {
      messages = await enrichChatMessages(messages);
    }
  }
  console.log("Messages: ", messages);
  await currentAIProvider.streamChatIntoEditor({
    messages,
    stream: true
  }, cursorPos);
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

// https://deno.land/std@0.216.0/yaml/_error.ts
var YAMLError = class extends Error {
  constructor(message = "(unknown reason)", mark = "") {
    super(`${message} ${mark}`);
    this.mark = mark;
    this.name = this.constructor.name;
  }
  toString(_compact) {
    return `${this.name}: ${this.message} ${this.mark}`;
  }
};

// https://deno.land/std@0.216.0/yaml/_utils.ts
function isBoolean(value) {
  return typeof value === "boolean" || value instanceof Boolean;
}
function isObject(value) {
  return value !== null && typeof value === "object";
}
function repeat(str2, count) {
  let result = "";
  for (let cycle = 0; cycle < count; cycle++) {
    result += str2;
  }
  return result;
}
function isNegativeZero(i) {
  return i === 0 && Number.NEGATIVE_INFINITY === 1 / i;
}

// https://deno.land/std@0.216.0/yaml/_mark.ts
var Mark = class {
  constructor(name, buffer, position, line, column) {
    this.name = name;
    this.buffer = buffer;
    this.position = position;
    this.line = line;
    this.column = column;
  }
  getSnippet(indent = 4, maxLength = 75) {
    if (!this.buffer)
      return null;
    let head = "";
    let start = this.position;
    while (start > 0 && "\0\r\n\x85\u2028\u2029".indexOf(this.buffer.charAt(start - 1)) === -1) {
      start -= 1;
      if (this.position - start > maxLength / 2 - 1) {
        head = " ... ";
        start += 5;
        break;
      }
    }
    let tail = "";
    let end = this.position;
    while (end < this.buffer.length && "\0\r\n\x85\u2028\u2029".indexOf(this.buffer.charAt(end)) === -1) {
      end += 1;
      if (end - this.position > maxLength / 2 - 1) {
        tail = " ... ";
        end -= 5;
        break;
      }
    }
    const snippet = this.buffer.slice(start, end);
    return `${repeat(" ", indent)}${head}${snippet}${tail}
${repeat(
      " ",
      indent + this.position - start + head.length
    )}^`;
  }
  toString(compact) {
    let snippet, where = "";
    if (this.name) {
      where += `in "${this.name}" `;
    }
    where += `at line ${this.line + 1}, column ${this.column + 1}`;
    if (!compact) {
      snippet = this.getSnippet();
      if (snippet) {
        where += `:
${snippet}`;
      }
    }
    return where;
  }
};

// https://deno.land/std@0.216.0/yaml/schema.ts
function compileList(schema, name, result) {
  const exclude = [];
  for (const includedSchema of schema.include) {
    result = compileList(includedSchema, name, result);
  }
  for (const currentType of schema[name]) {
    for (let previousIndex = 0; previousIndex < result.length; previousIndex++) {
      const previousType = result[previousIndex];
      if (previousType.tag === currentType.tag && previousType.kind === currentType.kind) {
        exclude.push(previousIndex);
      }
    }
    result.push(currentType);
  }
  return result.filter((_type, index) => !exclude.includes(index));
}
function compileMap(...typesList) {
  const result = {
    fallback: {},
    mapping: {},
    scalar: {},
    sequence: {}
  };
  for (const types of typesList) {
    for (const type of types) {
      if (type.kind !== null) {
        result[type.kind][type.tag] = result["fallback"][type.tag] = type;
      }
    }
  }
  return result;
}
var Schema = class _Schema {
  static SCHEMA_DEFAULT;
  implicit;
  explicit;
  include;
  compiledImplicit;
  compiledExplicit;
  compiledTypeMap;
  constructor(definition) {
    this.explicit = definition.explicit || [];
    this.implicit = definition.implicit || [];
    this.include = definition.include || [];
    for (const type of this.implicit) {
      if (type.loadKind && type.loadKind !== "scalar") {
        throw new YAMLError(
          "There is a non-scalar type in the implicit list of a schema. Implicit resolving of such types is not supported."
        );
      }
    }
    this.compiledImplicit = compileList(this, "implicit", []);
    this.compiledExplicit = compileList(this, "explicit", []);
    this.compiledTypeMap = compileMap(
      this.compiledImplicit,
      this.compiledExplicit
    );
  }
  /* Returns a new extended schema from current schema */
  extend(definition) {
    return new _Schema({
      implicit: [
        .../* @__PURE__ */ new Set([...this.implicit, ...definition?.implicit ?? []])
      ],
      explicit: [
        .../* @__PURE__ */ new Set([...this.explicit, ...definition?.explicit ?? []])
      ],
      include: [.../* @__PURE__ */ new Set([...this.include, ...definition?.include ?? []])]
    });
  }
  static create() {
  }
};

// https://deno.land/std@0.216.0/yaml/type.ts
function checkTagFormat(tag) {
  return tag;
}
var Type = class {
  tag;
  kind = null;
  instanceOf;
  predicate;
  represent;
  defaultStyle;
  styleAliases;
  loadKind;
  constructor(tag, options) {
    this.tag = checkTagFormat(tag);
    if (options) {
      this.kind = options.kind;
      this.resolve = options.resolve || (() => true);
      this.construct = options.construct || ((data) => data);
      this.instanceOf = options.instanceOf;
      this.predicate = options.predicate;
      this.represent = options.represent;
      this.defaultStyle = options.defaultStyle;
      this.styleAliases = options.styleAliases;
    }
  }
  resolve = () => true;
  construct = (data) => data;
};

// https://deno.land/std@0.216.0/yaml/_type/binary.ts
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data) {
  if (data === null)
    return false;
  let code;
  let bitlen = 0;
  const max = data.length;
  const map2 = BASE64_MAP;
  for (let idx = 0; idx < max; idx++) {
    code = map2.indexOf(data.charAt(idx));
    if (code > 64)
      continue;
    if (code < 0)
      return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data) {
  const input = data.replace(/[\r\n=]/g, "");
  const max = input.length;
  const map2 = BASE64_MAP;
  const result = [];
  let bits = 0;
  for (let idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  const tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  const max = object.length;
  const map2 = BASE64_MAP;
  let result = "";
  let bits = 0;
  for (let idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  const tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return obj instanceof Uint8Array;
}
var binary = new Type("tag:yaml.org,2002:binary", {
  construct: constructYamlBinary,
  kind: "scalar",
  predicate: isBinary,
  represent: representYamlBinary,
  resolve: resolveYamlBinary
});

// https://deno.land/std@0.216.0/yaml/_type/bool.ts
function resolveYamlBoolean(data) {
  const max = data.length;
  return max === 4 && (data === "true" || data === "True" || data === "TRUE") || max === 5 && (data === "false" || data === "False" || data === "FALSE");
}
function constructYamlBoolean(data) {
  return data === "true" || data === "True" || data === "TRUE";
}
var bool = new Type("tag:yaml.org,2002:bool", {
  construct: constructYamlBoolean,
  defaultStyle: "lowercase",
  kind: "scalar",
  predicate: isBoolean,
  represent: {
    lowercase(object) {
      return object ? "true" : "false";
    },
    uppercase(object) {
      return object ? "TRUE" : "FALSE";
    },
    camelcase(object) {
      return object ? "True" : "False";
    }
  },
  resolve: resolveYamlBoolean
});

// https://deno.land/std@0.216.0/yaml/_type/float.ts
var YAML_FLOAT_PATTERN = new RegExp(
  // 2.5e4, 2.5 and integers
  "^(?:[-+]?(?:0|[1-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\\.[0-9_]*|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$"
);
function resolveYamlFloat(data) {
  if (!YAML_FLOAT_PATTERN.test(data) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data[data.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data) {
  let value = data.replace(/_/g, "").toLowerCase();
  const sign = value[0] === "-" ? -1 : 1;
  const digits = [];
  if ("+-".indexOf(value[0]) >= 0) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  if (value === ".nan") {
    return NaN;
  }
  if (value.indexOf(":") >= 0) {
    value.split(":").forEach((v) => {
      digits.unshift(parseFloat(v));
    });
    let valueNb = 0;
    let base = 1;
    digits.forEach((d) => {
      valueNb += d * base;
      base *= 60;
    });
    return sign * valueNb;
  }
  return sign * parseFloat(value);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  if (isNaN(object)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === object) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (isNegativeZero(object)) {
    return "-0.0";
  }
  const res = object.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && (object % 1 !== 0 || isNegativeZero(object));
}
var float = new Type("tag:yaml.org,2002:float", {
  construct: constructYamlFloat,
  defaultStyle: "lowercase",
  kind: "scalar",
  predicate: isFloat,
  represent: representYamlFloat,
  resolve: resolveYamlFloat
});

// https://deno.land/std@0.216.0/yaml/_type/function.ts
function reconstructFunction(code) {
  const func2 = new Function(`return ${code}`)();
  if (!(func2 instanceof Function)) {
    throw new TypeError(`Expected function but got ${typeof func2}: ${code}`);
  }
  return func2;
}
var func = new Type("tag:yaml.org,2002:js/function", {
  kind: "scalar",
  resolve(data) {
    if (data === null) {
      return false;
    }
    try {
      reconstructFunction(`${data}`);
      return true;
    } catch (_err) {
      return false;
    }
  },
  construct(data) {
    return reconstructFunction(data);
  },
  predicate(object) {
    return object instanceof Function;
  },
  represent(object) {
    return object.toString();
  }
});

// https://deno.land/std@0.216.0/yaml/_type/int.ts
function isHexCode(c) {
  return 48 <= /* 0 */
  c && c <= 57 || 65 <= /* A */
  c && c <= 70 || 97 <= /* a */
  c && c <= 102;
}
function isOctCode(c) {
  return 48 <= /* 0 */
  c && c <= 55;
}
function isDecCode(c) {
  return 48 <= /* 0 */
  c && c <= 57;
}
function resolveYamlInteger(data) {
  const max = data.length;
  let index = 0;
  let hasDigits = false;
  if (!max)
    return false;
  let ch = data[index];
  if (ch === "-" || ch === "+") {
    ch = data[++index];
  }
  if (ch === "0") {
    if (index + 1 === max)
      return true;
    ch = data[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_")
          continue;
        if (ch !== "0" && ch !== "1")
          return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data[index];
        if (ch === "_")
          continue;
        if (!isHexCode(data.charCodeAt(index)))
          return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    for (; index < max; index++) {
      ch = data[index];
      if (ch === "_")
        continue;
      if (!isOctCode(data.charCodeAt(index)))
        return false;
      hasDigits = true;
    }
    return hasDigits && ch !== "_";
  }
  if (ch === "_")
    return false;
  for (; index < max; index++) {
    ch = data[index];
    if (ch === "_")
      continue;
    if (ch === ":")
      break;
    if (!isDecCode(data.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_")
    return false;
  if (ch !== ":")
    return true;
  return /^(:[0-5]?[0-9])+$/.test(data.slice(index));
}
function constructYamlInteger(data) {
  let value = data;
  const digits = [];
  if (value.indexOf("_") !== -1) {
    value = value.replace(/_/g, "");
  }
  let sign = 1;
  let ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-")
      sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0")
    return 0;
  if (ch === "0") {
    if (value[1] === "b")
      return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x")
      return sign * parseInt(value, 16);
    return sign * parseInt(value, 8);
  }
  if (value.indexOf(":") !== -1) {
    value.split(":").forEach((v) => {
      digits.unshift(parseInt(v, 10));
    });
    let valueInt = 0;
    let base = 1;
    digits.forEach((d) => {
      valueInt += d * base;
      base *= 60;
    });
    return sign * valueInt;
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  return Object.prototype.toString.call(object) === "[object Number]" && object % 1 === 0 && !isNegativeZero(object);
}
var int = new Type("tag:yaml.org,2002:int", {
  construct: constructYamlInteger,
  defaultStyle: "decimal",
  kind: "scalar",
  predicate: isInteger,
  represent: {
    binary(obj) {
      return obj >= 0 ? `0b${obj.toString(2)}` : `-0b${obj.toString(2).slice(1)}`;
    },
    octal(obj) {
      return obj >= 0 ? `0${obj.toString(8)}` : `-0${obj.toString(8).slice(1)}`;
    },
    decimal(obj) {
      return obj.toString(10);
    },
    hexadecimal(obj) {
      return obj >= 0 ? `0x${obj.toString(16).toUpperCase()}` : `-0x${obj.toString(16).toUpperCase().slice(1)}`;
    }
  },
  resolve: resolveYamlInteger,
  styleAliases: {
    binary: [2, "bin"],
    decimal: [10, "dec"],
    hexadecimal: [16, "hex"],
    octal: [8, "oct"]
  }
});

// https://deno.land/std@0.216.0/yaml/_type/map.ts
var map = new Type("tag:yaml.org,2002:map", {
  construct(data) {
    return data !== null ? data : {};
  },
  kind: "mapping"
});

// https://deno.land/std@0.216.0/yaml/_type/merge.ts
function resolveYamlMerge(data) {
  return data === "<<" || data === null;
}
var merge = new Type("tag:yaml.org,2002:merge", {
  kind: "scalar",
  resolve: resolveYamlMerge
});

// https://deno.land/std@0.216.0/yaml/_type/nil.ts
function resolveYamlNull(data) {
  const max = data.length;
  return max === 1 && data === "~" || max === 4 && (data === "null" || data === "Null" || data === "NULL");
}
function constructYamlNull() {
  return null;
}
function isNull(object) {
  return object === null;
}
var nil = new Type("tag:yaml.org,2002:null", {
  construct: constructYamlNull,
  defaultStyle: "lowercase",
  kind: "scalar",
  predicate: isNull,
  represent: {
    canonical() {
      return "~";
    },
    lowercase() {
      return "null";
    },
    uppercase() {
      return "NULL";
    },
    camelcase() {
      return "Null";
    }
  },
  resolve: resolveYamlNull
});

// https://deno.land/std@0.216.0/yaml/_type/omap.ts
var { hasOwn } = Object;
var _toString = Object.prototype.toString;
function resolveYamlOmap(data) {
  const objectKeys = [];
  let pairKey = "";
  let pairHasKey = false;
  for (const pair of data) {
    pairHasKey = false;
    if (_toString.call(pair) !== "[object Object]")
      return false;
    for (pairKey in pair) {
      if (hasOwn(pair, pairKey)) {
        if (!pairHasKey)
          pairHasKey = true;
        else
          return false;
      }
    }
    if (!pairHasKey)
      return false;
    if (objectKeys.indexOf(pairKey) === -1)
      objectKeys.push(pairKey);
    else
      return false;
  }
  return true;
}
function constructYamlOmap(data) {
  return data !== null ? data : [];
}
var omap = new Type("tag:yaml.org,2002:omap", {
  construct: constructYamlOmap,
  kind: "sequence",
  resolve: resolveYamlOmap
});

// https://deno.land/std@0.216.0/yaml/_type/pairs.ts
var _toString2 = Object.prototype.toString;
function resolveYamlPairs(data) {
  const result = Array.from({ length: data.length });
  for (let index = 0; index < data.length; index++) {
    const pair = data[index];
    if (_toString2.call(pair) !== "[object Object]")
      return false;
    const keys = Object.keys(pair);
    if (keys.length !== 1)
      return false;
    result[index] = [keys[0], pair[keys[0]]];
  }
  return true;
}
function constructYamlPairs(data) {
  if (data === null)
    return [];
  const result = Array.from({ length: data.length });
  for (let index = 0; index < data.length; index += 1) {
    const pair = data[index];
    const keys = Object.keys(pair);
    result[index] = [keys[0], pair[keys[0]]];
  }
  return result;
}
var pairs = new Type("tag:yaml.org,2002:pairs", {
  construct: constructYamlPairs,
  kind: "sequence",
  resolve: resolveYamlPairs
});

// https://deno.land/std@0.216.0/yaml/_type/regexp.ts
var REGEXP = /^\/(?<regexp>[\s\S]+)\/(?<modifiers>[gismuy]*)$/;
var regexp = new Type("tag:yaml.org,2002:js/regexp", {
  kind: "scalar",
  resolve(data) {
    if (data === null || !data.length) {
      return false;
    }
    const regexp2 = `${data}`;
    if (regexp2.charAt(0) === "/") {
      if (!REGEXP.test(data)) {
        return false;
      }
      const modifiers = [...regexp2.match(REGEXP)?.groups?.modifiers ?? ""];
      if (new Set(modifiers).size < modifiers.length) {
        return false;
      }
    }
    return true;
  },
  construct(data) {
    const { regexp: regexp2 = `${data}`, modifiers = "" } = `${data}`.match(REGEXP)?.groups ?? {};
    return new RegExp(regexp2, modifiers);
  },
  predicate(object) {
    return object instanceof RegExp;
  },
  represent(object) {
    return object.toString();
  }
});

// https://deno.land/std@0.216.0/yaml/_type/seq.ts
var seq = new Type("tag:yaml.org,2002:seq", {
  construct(data) {
    return data !== null ? data : [];
  },
  kind: "sequence"
});

// https://deno.land/std@0.216.0/yaml/_type/set.ts
var { hasOwn: hasOwn2 } = Object;
function resolveYamlSet(data) {
  if (data === null)
    return true;
  for (const key in data) {
    if (hasOwn2(data, key)) {
      if (data[key] !== null)
        return false;
    }
  }
  return true;
}
function constructYamlSet(data) {
  return data !== null ? data : {};
}
var set2 = new Type("tag:yaml.org,2002:set", {
  construct: constructYamlSet,
  kind: "mapping",
  resolve: resolveYamlSet
});

// https://deno.land/std@0.216.0/yaml/_type/str.ts
var str = new Type("tag:yaml.org,2002:str", {
  construct(data) {
    return data !== null ? data : "";
  },
  kind: "scalar"
});

// https://deno.land/std@0.216.0/yaml/_type/timestamp.ts
var YAML_DATE_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$"
  // [3] day
);
var YAML_TIMESTAMP_REGEXP = new RegExp(
  "^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$"
  // [11] tz_minute
);
function resolveYamlTimestamp(data) {
  if (data === null)
    return false;
  if (YAML_DATE_REGEXP.exec(data) !== null)
    return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data) !== null)
    return true;
  return false;
}
function constructYamlTimestamp(data) {
  let match = YAML_DATE_REGEXP.exec(data);
  if (match === null)
    match = YAML_TIMESTAMP_REGEXP.exec(data);
  if (match === null)
    throw new Error("Date resolve error");
  const year = +match[1];
  const month = +match[2] - 1;
  const day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  const hour = +match[4];
  const minute = +match[5];
  const second = +match[6];
  let fraction = 0;
  if (match[7]) {
    let partFraction = match[7].slice(0, 3);
    while (partFraction.length < 3) {
      partFraction += "0";
    }
    fraction = +partFraction;
  }
  let delta = null;
  if (match[9]) {
    const tzHour = +match[10];
    const tzMinute = +(match[11] || 0);
    delta = (tzHour * 60 + tzMinute) * 6e4;
    if (match[9] === "-")
      delta = -delta;
  }
  const date = new Date(
    Date.UTC(year, month, day, hour, minute, second, fraction)
  );
  if (delta)
    date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(date) {
  return date.toISOString();
}
var timestamp = new Type("tag:yaml.org,2002:timestamp", {
  construct: constructYamlTimestamp,
  instanceOf: Date,
  kind: "scalar",
  represent: representYamlTimestamp,
  resolve: resolveYamlTimestamp
});

// https://deno.land/std@0.216.0/yaml/_type/undefined.ts
var undefinedType = new Type("tag:yaml.org,2002:js/undefined", {
  kind: "scalar",
  resolve() {
    return true;
  },
  construct() {
    return void 0;
  },
  predicate(object) {
    return typeof object === "undefined";
  },
  represent() {
    return "";
  }
});

// https://deno.land/std@0.216.0/yaml/schema/failsafe.ts
var failsafe = new Schema({
  explicit: [str, seq, map]
});

// https://deno.land/std@0.216.0/yaml/schema/json.ts
var json = new Schema({
  implicit: [nil, bool, int, float],
  include: [failsafe]
});

// https://deno.land/std@0.216.0/yaml/schema/core.ts
var core = new Schema({
  include: [json]
});

// https://deno.land/std@0.216.0/yaml/schema/default.ts
var def = new Schema({
  explicit: [binary, omap, pairs, set2],
  implicit: [timestamp, merge],
  include: [core]
});

// https://deno.land/std@0.216.0/yaml/schema/extended.ts
var extended = new Schema({
  explicit: [regexp, undefinedType],
  include: [def]
});

// https://deno.land/std@0.216.0/yaml/_state.ts
var State = class {
  constructor(schema = def) {
    this.schema = schema;
  }
};

// https://deno.land/std@0.216.0/yaml/_loader/loader_state.ts
var LoaderState = class extends State {
  constructor(input, {
    filename,
    schema,
    onWarning,
    legacy = false,
    json: json2 = false,
    listener = null
  }) {
    super(schema);
    this.input = input;
    this.filename = filename;
    this.onWarning = onWarning;
    this.legacy = legacy;
    this.json = json2;
    this.listener = listener;
    this.implicitTypes = this.schema.compiledImplicit;
    this.typeMap = this.schema.compiledTypeMap;
    this.length = input.length;
  }
  documents = [];
  length;
  lineIndent = 0;
  lineStart = 0;
  position = 0;
  line = 0;
  filename;
  onWarning;
  legacy;
  json;
  listener;
  implicitTypes;
  typeMap;
  version;
  checkLineBreaks;
  tagMap;
  anchorMap;
  tag;
  anchor;
  kind;
  result = "";
};

// https://deno.land/std@0.216.0/yaml/_loader/loader.ts
var { hasOwn: hasOwn3 } = Object;
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = (
  // deno-lint-ignore no-control-regex
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/
);
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
function _class(obj) {
  return Object.prototype.toString.call(obj);
}
function isEOL(c) {
  return c === 10 || /* LF */
  c === 13;
}
function isWhiteSpace(c) {
  return c === 9 || /* Tab */
  c === 32;
}
function isWsOrEol(c) {
  return c === 9 || c === 32 || c === 10 || c === 13;
}
function isFlowIndicator(c) {
  return c === 44 || c === 91 || c === 93 || c === 123 || c === 125;
}
function fromHexCode(c) {
  if (48 <= /* 0 */
  c && c <= 57) {
    return c - 48;
  }
  const lc = c | 32;
  if (97 <= /* a */
  lc && lc <= 102) {
    return lc - 97 + 10;
  }
  return -1;
}
function escapedHexLen(c) {
  if (c === 120) {
    return 2;
  }
  if (c === 117) {
    return 4;
  }
  if (c === 85) {
    return 8;
  }
  return 0;
}
function fromDecimalCode(c) {
  if (48 <= /* 0 */
  c && c <= 57) {
    return c - 48;
  }
  return -1;
}
function simpleEscapeSequence(c) {
  return c === 48 ? "\0" : c === 97 ? "\x07" : c === 98 ? "\b" : c === 116 ? "	" : c === 9 ? "	" : c === 110 ? "\n" : c === 118 ? "\v" : c === 102 ? "\f" : c === 114 ? "\r" : c === 101 ? "\x1B" : c === 32 ? " " : c === 34 ? '"' : c === 47 ? "/" : c === 92 ? "\\" : c === 78 ? "\x85" : c === 95 ? "\xA0" : c === 76 ? "\u2028" : c === 80 ? "\u2029" : "";
}
function charFromCodepoint(c) {
  if (c <= 65535) {
    return String.fromCharCode(c);
  }
  return String.fromCharCode(
    (c - 65536 >> 10) + 55296,
    (c - 65536 & 1023) + 56320
  );
}
var simpleEscapeCheck = Array.from({ length: 256 });
var simpleEscapeMap = Array.from({ length: 256 });
for (let i = 0; i < 256; i++) {
  simpleEscapeCheck[i] = simpleEscapeSequence(i) ? 1 : 0;
  simpleEscapeMap[i] = simpleEscapeSequence(i);
}
function generateError(state, message) {
  return new YAMLError(
    message,
    new Mark(
      state.filename,
      state.input,
      state.position,
      state.line,
      state.position - state.lineStart
    )
  );
}
function throwError(state, message) {
  throw generateError(state, message);
}
function throwWarning(state, message) {
  if (state.onWarning) {
    state.onWarning.call(null, generateError(state, message));
  }
}
var directiveHandlers = {
  YAML(state, _name, ...args) {
    if (state.version !== null) {
      return throwError(state, "duplication of %YAML directive");
    }
    if (args.length !== 1) {
      return throwError(state, "YAML directive accepts exactly one argument");
    }
    const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      return throwError(state, "ill-formed argument of the YAML directive");
    }
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    if (major !== 1) {
      return throwError(state, "unacceptable YAML version of the document");
    }
    state.version = args[0];
    state.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      return throwWarning(state, "unsupported YAML version of the document");
    }
  },
  TAG(state, _name, ...args) {
    if (args.length !== 2) {
      return throwError(state, "TAG directive accepts exactly two arguments");
    }
    const handle = args[0];
    const prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      return throwError(
        state,
        "ill-formed tag handle (first argument) of the TAG directive"
      );
    }
    if (state.tagMap && hasOwn3(state.tagMap, handle)) {
      return throwError(
        state,
        `there is a previously declared suffix for "${handle}" tag handle`
      );
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      return throwError(
        state,
        "ill-formed tag prefix (second argument) of the TAG directive"
      );
    }
    if (typeof state.tagMap === "undefined") {
      state.tagMap = /* @__PURE__ */ Object.create(null);
    }
    state.tagMap[handle] = prefix;
  }
};
function captureSegment(state, start, end, checkJson) {
  let result;
  if (start < end) {
    result = state.input.slice(start, end);
    if (checkJson) {
      for (let position = 0, length = result.length; position < length; position++) {
        const character = result.charCodeAt(position);
        if (!(character === 9 || 32 <= character && character <= 1114111)) {
          return throwError(state, "expected valid JSON character");
        }
      }
    } else if (PATTERN_NON_PRINTABLE.test(result)) {
      return throwError(state, "the stream contains non-printable characters");
    }
    state.result += result;
  }
}
function mergeMappings(state, destination, source, overridableKeys) {
  if (!isObject(source)) {
    return throwError(
      state,
      "cannot merge mappings; the provided source object is unacceptable"
    );
  }
  const keys = Object.keys(source);
  for (let i = 0, len = keys.length; i < len; i++) {
    const key = keys[i];
    if (!hasOwn3(destination, key)) {
      Object.defineProperty(destination, key, {
        value: source[key],
        writable: true,
        enumerable: true,
        configurable: true
      });
      overridableKeys[key] = true;
    }
  }
}
function storeMappingPair(state, result, overridableKeys, keyTag, keyNode, valueNode, startLine, startPos) {
  if (Array.isArray(keyNode)) {
    keyNode = Array.prototype.slice.call(keyNode);
    for (let index = 0, quantity = keyNode.length; index < quantity; index++) {
      if (Array.isArray(keyNode[index])) {
        return throwError(state, "nested arrays are not supported inside keys");
      }
      if (typeof keyNode === "object" && _class(keyNode[index]) === "[object Object]") {
        keyNode[index] = "[object Object]";
      }
    }
  }
  if (typeof keyNode === "object" && _class(keyNode) === "[object Object]") {
    keyNode = "[object Object]";
  }
  keyNode = String(keyNode);
  if (result === null) {
    result = {};
  }
  if (keyTag === "tag:yaml.org,2002:merge") {
    if (Array.isArray(valueNode)) {
      for (let index = 0, quantity = valueNode.length; index < quantity; index++) {
        mergeMappings(state, result, valueNode[index], overridableKeys);
      }
    } else {
      mergeMappings(state, result, valueNode, overridableKeys);
    }
  } else {
    if (!state.json && !hasOwn3(overridableKeys, keyNode) && hasOwn3(result, keyNode)) {
      state.line = startLine || state.line;
      state.position = startPos || state.position;
      return throwError(state, "duplicated mapping key");
    }
    Object.defineProperty(result, keyNode, {
      value: valueNode,
      writable: true,
      enumerable: true,
      configurable: true
    });
    delete overridableKeys[keyNode];
  }
  return result;
}
function readLineBreak(state) {
  const ch = state.input.charCodeAt(state.position);
  if (ch === 10) {
    state.position++;
  } else if (ch === 13) {
    state.position++;
    if (state.input.charCodeAt(state.position) === 10) {
      state.position++;
    }
  } else {
    return throwError(state, "a line break is expected");
  }
  state.line += 1;
  state.lineStart = state.position;
}
function skipSeparationSpace(state, allowComments, checkIndent) {
  let lineBreaks = 0, ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    while (isWhiteSpace(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    if (allowComments && ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (ch !== 10 && /* LF */
      ch !== 13 && /* CR */
      ch !== 0);
    }
    if (isEOL(ch)) {
      readLineBreak(state);
      ch = state.input.charCodeAt(state.position);
      lineBreaks++;
      state.lineIndent = 0;
      while (ch === 32) {
        state.lineIndent++;
        ch = state.input.charCodeAt(++state.position);
      }
    } else {
      break;
    }
  }
  if (checkIndent !== -1 && lineBreaks !== 0 && state.lineIndent < checkIndent) {
    throwWarning(state, "deficient indentation");
  }
  return lineBreaks;
}
function testDocumentSeparator(state) {
  let _position = state.position;
  let ch = state.input.charCodeAt(_position);
  if ((ch === 45 || /* - */
  ch === 46) && ch === state.input.charCodeAt(_position + 1) && ch === state.input.charCodeAt(_position + 2)) {
    _position += 3;
    ch = state.input.charCodeAt(_position);
    if (ch === 0 || isWsOrEol(ch)) {
      return true;
    }
  }
  return false;
}
function writeFoldedLines(state, count) {
  if (count === 1) {
    state.result += " ";
  } else if (count > 1) {
    state.result += repeat("\n", count - 1);
  }
}
function readPlainScalar(state, nodeIndent, withinFlowCollection) {
  const kind = state.kind;
  const result = state.result;
  let ch = state.input.charCodeAt(state.position);
  if (isWsOrEol(ch) || isFlowIndicator(ch) || ch === 35 || ch === 38 || ch === 42 || ch === 33 || ch === 124 || ch === 62 || ch === 39 || ch === 34 || ch === 37 || ch === 64 || ch === 96) {
    return false;
  }
  let following;
  if (ch === 63 || /* ? */
  ch === 45) {
    following = state.input.charCodeAt(state.position + 1);
    if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
      return false;
    }
  }
  state.kind = "scalar";
  state.result = "";
  let captureEnd, captureStart = captureEnd = state.position;
  let hasPendingContent = false;
  let line = 0;
  while (ch !== 0) {
    if (ch === 58) {
      following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following) || withinFlowCollection && isFlowIndicator(following)) {
        break;
      }
    } else if (ch === 35) {
      const preceding = state.input.charCodeAt(state.position - 1);
      if (isWsOrEol(preceding)) {
        break;
      }
    } else if (state.position === state.lineStart && testDocumentSeparator(state) || withinFlowCollection && isFlowIndicator(ch)) {
      break;
    } else if (isEOL(ch)) {
      line = state.line;
      const lineStart = state.lineStart;
      const lineIndent = state.lineIndent;
      skipSeparationSpace(state, false, -1);
      if (state.lineIndent >= nodeIndent) {
        hasPendingContent = true;
        ch = state.input.charCodeAt(state.position);
        continue;
      } else {
        state.position = captureEnd;
        state.line = line;
        state.lineStart = lineStart;
        state.lineIndent = lineIndent;
        break;
      }
    }
    if (hasPendingContent) {
      captureSegment(state, captureStart, captureEnd, false);
      writeFoldedLines(state, state.line - line);
      captureStart = captureEnd = state.position;
      hasPendingContent = false;
    }
    if (!isWhiteSpace(ch)) {
      captureEnd = state.position + 1;
    }
    ch = state.input.charCodeAt(++state.position);
  }
  captureSegment(state, captureStart, captureEnd, false);
  if (state.result) {
    return true;
  }
  state.kind = kind;
  state.result = result;
  return false;
}
function readSingleQuotedScalar(state, nodeIndent) {
  let ch, captureStart, captureEnd;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 39) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  captureStart = captureEnd = state.position;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 39) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (ch === 39) {
        captureStart = state.position;
        state.position++;
        captureEnd = state.position;
      } else {
        return true;
      }
    } else if (isEOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      return throwError(
        state,
        "unexpected end of the document within a single quoted scalar"
      );
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  return throwError(
    state,
    "unexpected end of the stream within a single quoted scalar"
  );
}
function readDoubleQuotedScalar(state, nodeIndent) {
  let ch = state.input.charCodeAt(state.position);
  if (ch !== 34) {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  state.position++;
  let captureEnd, captureStart = captureEnd = state.position;
  let tmp;
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    if (ch === 34) {
      captureSegment(state, captureStart, state.position, true);
      state.position++;
      return true;
    }
    if (ch === 92) {
      captureSegment(state, captureStart, state.position, true);
      ch = state.input.charCodeAt(++state.position);
      if (isEOL(ch)) {
        skipSeparationSpace(state, false, nodeIndent);
      } else if (ch < 256 && simpleEscapeCheck[ch]) {
        state.result += simpleEscapeMap[ch];
        state.position++;
      } else if ((tmp = escapedHexLen(ch)) > 0) {
        let hexLength = tmp;
        let hexResult = 0;
        for (; hexLength > 0; hexLength--) {
          ch = state.input.charCodeAt(++state.position);
          if ((tmp = fromHexCode(ch)) >= 0) {
            hexResult = (hexResult << 4) + tmp;
          } else {
            return throwError(state, "expected hexadecimal character");
          }
        }
        state.result += charFromCodepoint(hexResult);
        state.position++;
      } else {
        return throwError(state, "unknown escape sequence");
      }
      captureStart = captureEnd = state.position;
    } else if (isEOL(ch)) {
      captureSegment(state, captureStart, captureEnd, true);
      writeFoldedLines(state, skipSeparationSpace(state, false, nodeIndent));
      captureStart = captureEnd = state.position;
    } else if (state.position === state.lineStart && testDocumentSeparator(state)) {
      return throwError(
        state,
        "unexpected end of the document within a double quoted scalar"
      );
    } else {
      state.position++;
      captureEnd = state.position;
    }
  }
  return throwError(
    state,
    "unexpected end of the stream within a double quoted scalar"
  );
}
function readFlowCollection(state, nodeIndent) {
  let ch = state.input.charCodeAt(state.position);
  let terminator;
  let isMapping = true;
  let result = {};
  if (ch === 91) {
    terminator = 93;
    isMapping = false;
    result = [];
  } else if (ch === 123) {
    terminator = 125;
  } else {
    return false;
  }
  if (state.anchor !== null && typeof state.anchor !== "undefined" && typeof state.anchorMap !== "undefined") {
    state.anchorMap[state.anchor] = result;
  }
  ch = state.input.charCodeAt(++state.position);
  const tag = state.tag, anchor = state.anchor;
  let readNext = true;
  let valueNode, keyNode, keyTag = keyNode = valueNode = null, isExplicitPair, isPair = isExplicitPair = false;
  let following = 0, line = 0;
  const overridableKeys = /* @__PURE__ */ Object.create(null);
  while (ch !== 0) {
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === terminator) {
      state.position++;
      state.tag = tag;
      state.anchor = anchor;
      state.kind = isMapping ? "mapping" : "sequence";
      state.result = result;
      return true;
    }
    if (!readNext) {
      return throwError(state, "missed comma between flow collection entries");
    }
    keyTag = keyNode = valueNode = null;
    isPair = isExplicitPair = false;
    if (ch === 63) {
      following = state.input.charCodeAt(state.position + 1);
      if (isWsOrEol(following)) {
        isPair = isExplicitPair = true;
        state.position++;
        skipSeparationSpace(state, true, nodeIndent);
      }
    }
    line = state.line;
    composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
    keyTag = state.tag || null;
    keyNode = state.result;
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if ((isExplicitPair || state.line === line) && ch === 58) {
      isPair = true;
      ch = state.input.charCodeAt(++state.position);
      skipSeparationSpace(state, true, nodeIndent);
      composeNode(state, nodeIndent, CONTEXT_FLOW_IN, false, true);
      valueNode = state.result;
    }
    if (isMapping) {
      storeMappingPair(
        state,
        result,
        overridableKeys,
        keyTag,
        keyNode,
        valueNode
      );
    } else if (isPair) {
      result.push(
        storeMappingPair(
          state,
          null,
          overridableKeys,
          keyTag,
          keyNode,
          valueNode
        )
      );
    } else {
      result.push(keyNode);
    }
    skipSeparationSpace(state, true, nodeIndent);
    ch = state.input.charCodeAt(state.position);
    if (ch === 44) {
      readNext = true;
      ch = state.input.charCodeAt(++state.position);
    } else {
      readNext = false;
    }
  }
  return throwError(
    state,
    "unexpected end of the stream within a flow collection"
  );
}
function readBlockScalar(state, nodeIndent) {
  let chomping = CHOMPING_CLIP, didReadContent = false, detectedIndent = false, textIndent = nodeIndent, emptyLines = 0, atMoreIndented = false;
  let ch = state.input.charCodeAt(state.position);
  let folding = false;
  if (ch === 124) {
    folding = false;
  } else if (ch === 62) {
    folding = true;
  } else {
    return false;
  }
  state.kind = "scalar";
  state.result = "";
  let tmp = 0;
  while (ch !== 0) {
    ch = state.input.charCodeAt(++state.position);
    if (ch === 43 || /* + */
    ch === 45) {
      if (CHOMPING_CLIP === chomping) {
        chomping = ch === 43 ? CHOMPING_KEEP : CHOMPING_STRIP;
      } else {
        return throwError(state, "repeat of a chomping mode identifier");
      }
    } else if ((tmp = fromDecimalCode(ch)) >= 0) {
      if (tmp === 0) {
        return throwError(
          state,
          "bad explicit indentation width of a block scalar; it cannot be less than one"
        );
      } else if (!detectedIndent) {
        textIndent = nodeIndent + tmp - 1;
        detectedIndent = true;
      } else {
        return throwError(state, "repeat of an indentation width identifier");
      }
    } else {
      break;
    }
  }
  if (isWhiteSpace(ch)) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (isWhiteSpace(ch));
    if (ch === 35) {
      do {
        ch = state.input.charCodeAt(++state.position);
      } while (!isEOL(ch) && ch !== 0);
    }
  }
  while (ch !== 0) {
    readLineBreak(state);
    state.lineIndent = 0;
    ch = state.input.charCodeAt(state.position);
    while ((!detectedIndent || state.lineIndent < textIndent) && ch === 32) {
      state.lineIndent++;
      ch = state.input.charCodeAt(++state.position);
    }
    if (!detectedIndent && state.lineIndent > textIndent) {
      textIndent = state.lineIndent;
    }
    if (isEOL(ch)) {
      emptyLines++;
      continue;
    }
    if (state.lineIndent < textIndent) {
      if (chomping === CHOMPING_KEEP) {
        state.result += repeat(
          "\n",
          didReadContent ? 1 + emptyLines : emptyLines
        );
      } else if (chomping === CHOMPING_CLIP) {
        if (didReadContent) {
          state.result += "\n";
        }
      }
      break;
    }
    if (folding) {
      if (isWhiteSpace(ch)) {
        atMoreIndented = true;
        state.result += repeat(
          "\n",
          didReadContent ? 1 + emptyLines : emptyLines
        );
      } else if (atMoreIndented) {
        atMoreIndented = false;
        state.result += repeat("\n", emptyLines + 1);
      } else if (emptyLines === 0) {
        if (didReadContent) {
          state.result += " ";
        }
      } else {
        state.result += repeat("\n", emptyLines);
      }
    } else {
      state.result += repeat(
        "\n",
        didReadContent ? 1 + emptyLines : emptyLines
      );
    }
    didReadContent = true;
    detectedIndent = true;
    emptyLines = 0;
    const captureStart = state.position;
    while (!isEOL(ch) && ch !== 0) {
      ch = state.input.charCodeAt(++state.position);
    }
    captureSegment(state, captureStart, state.position, false);
  }
  return true;
}
function readBlockSequence(state, nodeIndent) {
  let line, following, detected = false, ch;
  const tag = state.tag, anchor = state.anchor, result = [];
  if (state.anchor !== null && typeof state.anchor !== "undefined" && typeof state.anchorMap !== "undefined") {
    state.anchorMap[state.anchor] = result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    if (ch !== 45) {
      break;
    }
    following = state.input.charCodeAt(state.position + 1);
    if (!isWsOrEol(following)) {
      break;
    }
    detected = true;
    state.position++;
    if (skipSeparationSpace(state, true, -1)) {
      if (state.lineIndent <= nodeIndent) {
        result.push(null);
        ch = state.input.charCodeAt(state.position);
        continue;
      }
    }
    line = state.line;
    composeNode(state, nodeIndent, CONTEXT_BLOCK_IN, false, true);
    result.push(state.result);
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if ((state.line === line || state.lineIndent > nodeIndent) && ch !== 0) {
      return throwError(state, "bad indentation of a sequence entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (detected) {
    state.tag = tag;
    state.anchor = anchor;
    state.kind = "sequence";
    state.result = result;
    return true;
  }
  return false;
}
function readBlockMapping(state, nodeIndent, flowIndent) {
  const tag = state.tag, anchor = state.anchor, result = {}, overridableKeys = /* @__PURE__ */ Object.create(null);
  let following, allowCompact = false, line, pos, keyTag = null, keyNode = null, valueNode = null, atExplicitKey = false, detected = false, ch;
  if (state.anchor !== null && typeof state.anchor !== "undefined" && typeof state.anchorMap !== "undefined") {
    state.anchorMap[state.anchor] = result;
  }
  ch = state.input.charCodeAt(state.position);
  while (ch !== 0) {
    following = state.input.charCodeAt(state.position + 1);
    line = state.line;
    pos = state.position;
    if ((ch === 63 || /* ? */
    ch === 58) && /* : */
    isWsOrEol(following)) {
      if (ch === 63) {
        if (atExplicitKey) {
          storeMappingPair(
            state,
            result,
            overridableKeys,
            keyTag,
            keyNode,
            null
          );
          keyTag = keyNode = valueNode = null;
        }
        detected = true;
        atExplicitKey = true;
        allowCompact = true;
      } else if (atExplicitKey) {
        atExplicitKey = false;
        allowCompact = true;
      } else {
        return throwError(
          state,
          "incomplete explicit mapping pair; a key node is missed; or followed by a non-tabulated empty line"
        );
      }
      state.position += 1;
      ch = following;
    } else if (composeNode(state, flowIndent, CONTEXT_FLOW_OUT, false, true)) {
      if (state.line === line) {
        ch = state.input.charCodeAt(state.position);
        while (isWhiteSpace(ch)) {
          ch = state.input.charCodeAt(++state.position);
        }
        if (ch === 58) {
          ch = state.input.charCodeAt(++state.position);
          if (!isWsOrEol(ch)) {
            return throwError(
              state,
              "a whitespace character is expected after the key-value separator within a block mapping"
            );
          }
          if (atExplicitKey) {
            storeMappingPair(
              state,
              result,
              overridableKeys,
              keyTag,
              keyNode,
              null
            );
            keyTag = keyNode = valueNode = null;
          }
          detected = true;
          atExplicitKey = false;
          allowCompact = false;
          keyTag = state.tag;
          keyNode = state.result;
        } else if (detected) {
          return throwError(
            state,
            "can not read an implicit mapping pair; a colon is missed"
          );
        } else {
          state.tag = tag;
          state.anchor = anchor;
          return true;
        }
      } else if (detected) {
        return throwError(
          state,
          "can not read a block mapping entry; a multiline key may not be an implicit key"
        );
      } else {
        state.tag = tag;
        state.anchor = anchor;
        return true;
      }
    } else {
      break;
    }
    if (state.line === line || state.lineIndent > nodeIndent) {
      if (composeNode(state, nodeIndent, CONTEXT_BLOCK_OUT, true, allowCompact)) {
        if (atExplicitKey) {
          keyNode = state.result;
        } else {
          valueNode = state.result;
        }
      }
      if (!atExplicitKey) {
        storeMappingPair(
          state,
          result,
          overridableKeys,
          keyTag,
          keyNode,
          valueNode,
          line,
          pos
        );
        keyTag = keyNode = valueNode = null;
      }
      skipSeparationSpace(state, true, -1);
      ch = state.input.charCodeAt(state.position);
    }
    if (state.lineIndent > nodeIndent && ch !== 0) {
      return throwError(state, "bad indentation of a mapping entry");
    } else if (state.lineIndent < nodeIndent) {
      break;
    }
  }
  if (atExplicitKey) {
    storeMappingPair(
      state,
      result,
      overridableKeys,
      keyTag,
      keyNode,
      null
    );
  }
  if (detected) {
    state.tag = tag;
    state.anchor = anchor;
    state.kind = "mapping";
    state.result = result;
  }
  return detected;
}
function readTagProperty(state) {
  let position, isVerbatim = false, isNamed = false, tagHandle = "", tagName, ch;
  ch = state.input.charCodeAt(state.position);
  if (ch !== 33)
    return false;
  if (state.tag !== null) {
    return throwError(state, "duplication of a tag property");
  }
  ch = state.input.charCodeAt(++state.position);
  if (ch === 60) {
    isVerbatim = true;
    ch = state.input.charCodeAt(++state.position);
  } else if (ch === 33) {
    isNamed = true;
    tagHandle = "!!";
    ch = state.input.charCodeAt(++state.position);
  } else {
    tagHandle = "!";
  }
  position = state.position;
  if (isVerbatim) {
    do {
      ch = state.input.charCodeAt(++state.position);
    } while (ch !== 0 && ch !== 62);
    if (state.position < state.length) {
      tagName = state.input.slice(position, state.position);
      ch = state.input.charCodeAt(++state.position);
    } else {
      return throwError(
        state,
        "unexpected end of the stream within a verbatim tag"
      );
    }
  } else {
    while (ch !== 0 && !isWsOrEol(ch)) {
      if (ch === 33) {
        if (!isNamed) {
          tagHandle = state.input.slice(position - 1, state.position + 1);
          if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
            return throwError(
              state,
              "named tag handle cannot contain such characters"
            );
          }
          isNamed = true;
          position = state.position + 1;
        } else {
          return throwError(
            state,
            "tag suffix cannot contain exclamation marks"
          );
        }
      }
      ch = state.input.charCodeAt(++state.position);
    }
    tagName = state.input.slice(position, state.position);
    if (PATTERN_FLOW_INDICATORS.test(tagName)) {
      return throwError(
        state,
        "tag suffix cannot contain flow indicator characters"
      );
    }
  }
  if (tagName && !PATTERN_TAG_URI.test(tagName)) {
    return throwError(
      state,
      `tag name cannot contain such characters: ${tagName}`
    );
  }
  if (isVerbatim) {
    state.tag = tagName;
  } else if (typeof state.tagMap !== "undefined" && hasOwn3(state.tagMap, tagHandle)) {
    state.tag = state.tagMap[tagHandle] + tagName;
  } else if (tagHandle === "!") {
    state.tag = `!${tagName}`;
  } else if (tagHandle === "!!") {
    state.tag = `tag:yaml.org,2002:${tagName}`;
  } else {
    return throwError(state, `undeclared tag handle "${tagHandle}"`);
  }
  return true;
}
function readAnchorProperty(state) {
  let ch = state.input.charCodeAt(state.position);
  if (ch !== 38)
    return false;
  if (state.anchor !== null) {
    return throwError(state, "duplication of an anchor property");
  }
  ch = state.input.charCodeAt(++state.position);
  const position = state.position;
  while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === position) {
    return throwError(
      state,
      "name of an anchor node must contain at least one character"
    );
  }
  state.anchor = state.input.slice(position, state.position);
  return true;
}
function readAlias(state) {
  let ch = state.input.charCodeAt(state.position);
  if (ch !== 42)
    return false;
  ch = state.input.charCodeAt(++state.position);
  const _position = state.position;
  while (ch !== 0 && !isWsOrEol(ch) && !isFlowIndicator(ch)) {
    ch = state.input.charCodeAt(++state.position);
  }
  if (state.position === _position) {
    return throwError(
      state,
      "name of an alias node must contain at least one character"
    );
  }
  const alias = state.input.slice(_position, state.position);
  if (typeof state.anchorMap !== "undefined" && !hasOwn3(state.anchorMap, alias)) {
    return throwError(state, `unidentified alias "${alias}"`);
  }
  if (typeof state.anchorMap !== "undefined") {
    state.result = state.anchorMap[alias];
  }
  skipSeparationSpace(state, true, -1);
  return true;
}
function composeNode(state, parentIndent, nodeContext, allowToSeek, allowCompact) {
  let allowBlockScalars, allowBlockCollections, indentStatus = 1, atNewLine = false, hasContent = false, type, flowIndent, blockIndent;
  if (state.listener && state.listener !== null) {
    state.listener("open", state);
  }
  state.tag = null;
  state.anchor = null;
  state.kind = null;
  state.result = null;
  const allowBlockStyles = allowBlockScalars = allowBlockCollections = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
  if (allowToSeek) {
    if (skipSeparationSpace(state, true, -1)) {
      atNewLine = true;
      if (state.lineIndent > parentIndent) {
        indentStatus = 1;
      } else if (state.lineIndent === parentIndent) {
        indentStatus = 0;
      } else if (state.lineIndent < parentIndent) {
        indentStatus = -1;
      }
    }
  }
  if (indentStatus === 1) {
    while (readTagProperty(state) || readAnchorProperty(state)) {
      if (skipSeparationSpace(state, true, -1)) {
        atNewLine = true;
        allowBlockCollections = allowBlockStyles;
        if (state.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (state.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (state.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      } else {
        allowBlockCollections = false;
      }
    }
  }
  if (allowBlockCollections) {
    allowBlockCollections = atNewLine || allowCompact;
  }
  if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
    const cond = CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext;
    flowIndent = cond ? parentIndent : parentIndent + 1;
    blockIndent = state.position - state.lineStart;
    if (indentStatus === 1) {
      if (allowBlockCollections && (readBlockSequence(state, blockIndent) || readBlockMapping(state, blockIndent, flowIndent)) || readFlowCollection(state, flowIndent)) {
        hasContent = true;
      } else {
        if (allowBlockScalars && readBlockScalar(state, flowIndent) || readSingleQuotedScalar(state, flowIndent) || readDoubleQuotedScalar(state, flowIndent)) {
          hasContent = true;
        } else if (readAlias(state)) {
          hasContent = true;
          if (state.tag !== null || state.anchor !== null) {
            return throwError(
              state,
              "alias node should not have Any properties"
            );
          }
        } else if (readPlainScalar(state, flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
          hasContent = true;
          if (state.tag === null) {
            state.tag = "?";
          }
        }
        if (state.anchor !== null && typeof state.anchorMap !== "undefined") {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else if (indentStatus === 0) {
      hasContent = allowBlockCollections && readBlockSequence(state, blockIndent);
    }
  }
  if (state.tag !== null && state.tag !== "!") {
    if (state.tag === "?") {
      for (let typeIndex = 0, typeQuantity = state.implicitTypes.length; typeIndex < typeQuantity; typeIndex++) {
        type = state.implicitTypes[typeIndex];
        if (type.resolve(state.result)) {
          state.result = type.construct(state.result);
          state.tag = type.tag;
          if (state.anchor !== null && typeof state.anchorMap !== "undefined") {
            state.anchorMap[state.anchor] = state.result;
          }
          break;
        }
      }
    } else if (hasOwn3(state.typeMap[state.kind || "fallback"], state.tag)) {
      type = state.typeMap[state.kind || "fallback"][state.tag];
      if (state.result !== null && type.kind !== state.kind) {
        return throwError(
          state,
          `unacceptable node kind for !<${state.tag}> tag; it should be "${type.kind}", not "${state.kind}"`
        );
      }
      if (!type.resolve(state.result)) {
        return throwError(
          state,
          `cannot resolve a node with !<${state.tag}> explicit tag`
        );
      } else {
        state.result = type.construct(state.result);
        if (state.anchor !== null && typeof state.anchorMap !== "undefined") {
          state.anchorMap[state.anchor] = state.result;
        }
      }
    } else {
      return throwError(state, `unknown tag !<${state.tag}>`);
    }
  }
  if (state.listener && state.listener !== null) {
    state.listener("close", state);
  }
  return state.tag !== null || state.anchor !== null || hasContent;
}
function readDocument(state) {
  const documentStart = state.position;
  let position, directiveName, directiveArgs, hasDirectives = false, ch;
  state.version = null;
  state.checkLineBreaks = state.legacy;
  state.tagMap = /* @__PURE__ */ Object.create(null);
  state.anchorMap = /* @__PURE__ */ Object.create(null);
  while ((ch = state.input.charCodeAt(state.position)) !== 0) {
    skipSeparationSpace(state, true, -1);
    ch = state.input.charCodeAt(state.position);
    if (state.lineIndent > 0 || ch !== 37) {
      break;
    }
    hasDirectives = true;
    ch = state.input.charCodeAt(++state.position);
    position = state.position;
    while (ch !== 0 && !isWsOrEol(ch)) {
      ch = state.input.charCodeAt(++state.position);
    }
    directiveName = state.input.slice(position, state.position);
    directiveArgs = [];
    if (directiveName.length < 1) {
      return throwError(
        state,
        "directive name must not be less than one character in length"
      );
    }
    while (ch !== 0) {
      while (isWhiteSpace(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      if (ch === 35) {
        do {
          ch = state.input.charCodeAt(++state.position);
        } while (ch !== 0 && !isEOL(ch));
        break;
      }
      if (isEOL(ch))
        break;
      position = state.position;
      while (ch !== 0 && !isWsOrEol(ch)) {
        ch = state.input.charCodeAt(++state.position);
      }
      directiveArgs.push(state.input.slice(position, state.position));
    }
    if (ch !== 0)
      readLineBreak(state);
    if (hasOwn3(directiveHandlers, directiveName)) {
      directiveHandlers[directiveName](state, directiveName, ...directiveArgs);
    } else {
      throwWarning(state, `unknown document directive "${directiveName}"`);
    }
  }
  skipSeparationSpace(state, true, -1);
  if (state.lineIndent === 0 && state.input.charCodeAt(state.position) === 45 && state.input.charCodeAt(state.position + 1) === 45 && state.input.charCodeAt(state.position + 2) === 45) {
    state.position += 3;
    skipSeparationSpace(state, true, -1);
  } else if (hasDirectives) {
    return throwError(state, "directives end mark is expected");
  }
  composeNode(state, state.lineIndent - 1, CONTEXT_BLOCK_OUT, false, true);
  skipSeparationSpace(state, true, -1);
  if (state.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(
    state.input.slice(documentStart, state.position)
  )) {
    throwWarning(state, "non-ASCII line breaks are interpreted as content");
  }
  state.documents.push(state.result);
  if (state.position === state.lineStart && testDocumentSeparator(state)) {
    if (state.input.charCodeAt(state.position) === 46) {
      state.position += 3;
      skipSeparationSpace(state, true, -1);
    }
    return;
  }
  if (state.position < state.length - 1) {
    return throwError(
      state,
      "end of the stream or a document separator is expected"
    );
  }
}
function loadDocuments(input, options) {
  input = String(input);
  options = options || {};
  if (input.length !== 0) {
    if (input.charCodeAt(input.length - 1) !== 10 && input.charCodeAt(input.length - 1) !== 13) {
      input += "\n";
    }
    if (input.charCodeAt(0) === 65279) {
      input = input.slice(1);
    }
  }
  const state = new LoaderState(input, options);
  state.input += "\0";
  while (state.input.charCodeAt(state.position) === 32) {
    state.lineIndent += 1;
    state.position += 1;
  }
  while (state.position < state.length - 1) {
    readDocument(state);
  }
  return state.documents;
}
function load(input, options) {
  const documents = loadDocuments(input, options);
  if (documents.length === 0) {
    return null;
  }
  if (documents.length === 1) {
    return documents[0];
  }
  throw new YAMLError(
    "expected a single document in the stream, but found more"
  );
}

// https://deno.land/std@0.216.0/yaml/parse.ts
function parse3(content, options) {
  return load(content, options);
}

// https://deno.land/std@0.216.0/yaml/_dumper/dumper_state.ts
var { hasOwn: hasOwn4 } = Object;

// https://deno.land/std@0.216.0/yaml/_dumper/dumper.ts
var { hasOwn: hasOwn5 } = Object;
var ESCAPE_SEQUENCES = {};
ESCAPE_SEQUENCES[0] = "\\0";
ESCAPE_SEQUENCES[7] = "\\a";
ESCAPE_SEQUENCES[8] = "\\b";
ESCAPE_SEQUENCES[9] = "\\t";
ESCAPE_SEQUENCES[10] = "\\n";
ESCAPE_SEQUENCES[11] = "\\v";
ESCAPE_SEQUENCES[12] = "\\f";
ESCAPE_SEQUENCES[13] = "\\r";
ESCAPE_SEQUENCES[27] = "\\e";
ESCAPE_SEQUENCES[34] = '\\"';
ESCAPE_SEQUENCES[92] = "\\\\";
ESCAPE_SEQUENCES[133] = "\\N";
ESCAPE_SEQUENCES[160] = "\\_";
ESCAPE_SEQUENCES[8232] = "\\L";
ESCAPE_SEQUENCES[8233] = "\\P";

// ../../../../../../Users/justyns/dev/silverbullet-ai/use-space-config/sbai.ts
async function reloadSettingsPage(pageName) {
  if (pageName === "SETTINGS" || pageName === "SECRETS") {
    await initializeOpenAI(true);
  }
}
async function reloadConfig2() {
  await initializeOpenAI(true);
}
async function selectModelFromConfig() {
  if (!aiSettings || !aiSettings.textModels) {
    await initializeOpenAI(false);
  }
  const modelOptions = aiSettings.textModels.map((model) => ({
    ...model,
    name: model.name,
    description: model.description || `${model.modelName} on ${model.provider}`
  }));
  const selectedModel = await editor_exports.filterBox("Select a model", modelOptions);
  if (!selectedModel) {
    await editor_exports.flashNotification("No model selected.", "error");
    return;
  }
  const selectedModelName = selectedModel.name;
  await setSelectedTextModel(selectedModel);
  await configureSelectedModel(selectedModel);
  await editor_exports.flashNotification(`Selected model: ${selectedModelName}`);
  console.log(`Selected model:`, selectedModel);
}
async function selectImageModelFromConfig() {
  if (!aiSettings || !aiSettings.imageModels) {
    await initializeOpenAI(false);
  }
  const imageModelOptions = aiSettings.imageModels.map((model) => ({
    ...model,
    name: model.name,
    description: model.description || `${model.modelName} on ${model.provider}`
  }));
  const selectedImageModel = await editor_exports.filterBox(
    "Select an image model",
    imageModelOptions
  );
  if (!selectedImageModel) {
    await editor_exports.flashNotification("No image model selected.", "error");
    return;
  }
  const selectedImageModelName = selectedImageModel.name;
  await setSelectedImageModel(selectedImageModel);
  await configureSelectedImageModel(selectedImageModel);
  await editor_exports.flashNotification(
    `Selected image model: ${selectedImageModelName}`
  );
  console.log(`Selected image model:`, selectedImageModel);
}
async function selectEmbeddingModelFromConfig() {
  if (!aiSettings || !aiSettings.embeddingModels) {
    await initializeOpenAI(false);
  }
  const embeddingModelOptions = aiSettings.embeddingModels.map((model) => ({
    ...model,
    name: model.name,
    description: model.description || `${model.modelName} on ${model.provider}`
  }));
  const selectedEmbeddingModel = await editor_exports.filterBox(
    "Select an embedding model",
    embeddingModelOptions
  );
  if (!selectedEmbeddingModel) {
    await editor_exports.flashNotification("No embedding model selected.", "error");
    return;
  }
  const selectedEmbeddingModelName = selectedEmbeddingModel.name;
  await setSelectedEmbeddingModel(
    selectedEmbeddingModel
  );
  await configureSelectedEmbeddingModel(
    selectedEmbeddingModel
  );
  await editor_exports.flashNotification(
    `Selected embedding model: ${selectedEmbeddingModelName}`
  );
  console.log(`Selected embedding model:`, selectedEmbeddingModel);
}
async function callOpenAIwithNote() {
  await initIfNeeded();
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
  await currentAIProvider.streamChatIntoEditor({
    messages: [
      {
        role: "system",
        content: "You are an AI note assistant. Follow all user instructions and use the note context and note content to help follow those instructions. Use Markdown for any formatting."
      },
      {
        role: "user",
        content: `Note Context: Today is ${dayString}, ${dateString}. The current note name is "${noteName}".
User Prompt: ${userPrompt}
Note Content:
${selectedTextInfo.text}`
      }
    ],
    stream: true
  }, selectedTextInfo.to);
}
async function summarizeNote() {
  await initIfNeeded();
  const selectedTextInfo = await getSelectedTextOrNote();
  console.log("selectedTextInfo", selectedTextInfo);
  if (selectedTextInfo.text.length > 0) {
    const noteName = await editor_exports.getCurrentPage();
    const response = await currentAIProvider.chatWithAI({
      messages: [{
        role: "user",
        content: `Please summarize this note using markdown for any formatting. Your summary will be appended to the end of this note, do not include any of the note contents yourself. Keep the summary brief. The note name is ${noteName}.

${selectedTextInfo.text}`
      }],
      stream: false
    });
    console.log("OpenAI response:", response);
    return {
      summary: response,
      selectedTextInfo
    };
  }
  return { summary: "", selectedTextInfo: null };
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
async function openSummaryPanel() {
  const { summary } = await summarizeNote();
  if (summary) {
    await editor_exports.showPanel("rhs", 2, summary);
  } else {
    await editor_exports.flashNotification("No summary available.");
  }
}
async function tagNoteWithAI() {
  await initIfNeeded();
  const noteContent = await editor_exports.getText();
  const noteName = await editor_exports.getCurrentPage();
  const allTags = (await query(
    "tag select name where parent = 'page' order by name"
  )).map((tag) => tag.name);
  console.log("All tags:", allTags);
  const systemPrompt = `You are an AI tagging assistant. Please provide a short list of tags, separated by spaces. Follow these guidelines:
    - Only return tags and no other content.
    - Tags must be one word only and in lowercase.
    - Use existing tags as a starting point.
    - Suggest tags sparingly, treating them as thematic descriptors rather than keywords.

    The following tags are currently being used by other notes:
    ${allTags.join(", ")}
    
    Always follow the below rules, if any, given by the user:
    ${aiSettings.promptInstructions.tagRules}`;
  const userPrompt = `Page Title: ${noteName}

Page Content:
${noteContent}`;
  const response = await currentAIProvider.singleMessageChat(
    userPrompt,
    systemPrompt
  );
  const tags = response.trim().replace(/,/g, "").split(/\s+/);
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
async function suggestPageName() {
  await initIfNeeded();
  const noteContent = await editor_exports.getText();
  const noteName = await editor_exports.getCurrentPage();
  const loadingOption = [{
    name: "Generating suggestions...",
    description: ""
  }];
  const filterBoxPromise = editor_exports.filterBox(
    "Loading...",
    loadingOption,
    "Retrieving suggestions from LLM provider."
  );
  filterBoxPromise.then((selectedOption) => {
    console.log("Selected option (initial):", selectedOption);
  });
  let systemPrompt = "";
  if (aiSettings.promptInstructions.pageRenameSystem) {
    systemPrompt = aiSettings.promptInstructions.pageRenameSystem;
  } else {
    systemPrompt = `You are an AI note-naming assistant. Your task is to suggest three to five possible names for the provided note content. Please adhere to the following guidelines:
    - Provide each name on a new line.
    - Use only spaces, forward slashes (as folder separators), and hyphens as special characters.
    - Ensure the names are concise, descriptive, and relevant to the content.
    - Avoid suggesting the same name as the current note.
    - Include as much detail as possible within 3 to 10 words.
    - Start names with ASCII characters only.
    - Do not use markdown or any other formatting in your response.`;
  }
  const response = await currentAIProvider.singleMessageChat(
    `Current Page Title: ${noteName}

Page Content:
${noteContent}`,
    `${systemPrompt}

Always follow the below rules, if any, given by the user:
${aiSettings.promptInstructions.pageRenameRules}`,
    true
  );
  let suggestions = response.trim().split("\n").filter(
    (line) => line.trim() !== ""
  ).map((line) => line.replace(/^[*-]\s*/, "").trim());
  suggestions.push(noteName);
  suggestions = [...new Set(suggestions)];
  if (suggestions.length === 0) {
    await editor_exports.flashNotification("No suggestions available.");
  }
  const selectedSuggestion = await editor_exports.filterBox(
    "New page name",
    suggestions.map((suggestion) => ({
      name: suggestion
    })),
    "Select a new page name from one of the suggestions below."
  );
  if (!selectedSuggestion) {
    await editor_exports.flashNotification("No page name selected.", "error");
    return;
  }
  console.log("selectedSuggestion", selectedSuggestion);
  const renamedPage = await system_exports.invokeFunction("index.renamePageCommand", {
    oldPage: noteName,
    page: selectedSuggestion.name
  });
  console.log("renamedPage", renamedPage);
  if (!renamedPage) {
    await editor_exports.flashNotification("Error renaming page.", "error");
  }
}
async function enhanceNoteFrontMatter() {
  await initIfNeeded();
  const noteContent = await editor_exports.getText();
  const noteName = await editor_exports.getCurrentPage();
  const blacklistedAttrs = ["title", "tags"];
  const systemPrompt = `You are an AI note enhancing assistant. Your task is to understand the content of a note, detect and extract important information, and convert it to frontmatter attributes. Please adhere to the following guidelines:
      - Only return valid YAML frontmatter.
      - Do not use any markdown or any other formatting in your response.
      - Do not include --- in your response.
      - Do not include any content from the note in your response.
      - Extract useful facts from the note and add them to the frontmatter, such as a person's name, age, a location, etc.
      - Do not return any tags.
      - Do not return a new note title.
      - Do not use special characters in key names.  Only ASCII.
      - Only return important information that would be useful when searching or filtering notes.
      `;
  const response = await currentAIProvider.singleMessageChat(
    `Current Page Title: ${noteName}

Page Content:
${noteContent}`,
    `${systemPrompt}

Always follow the below rules, if any, given by the user:
${aiSettings.promptInstructions.enhanceFrontMatterPrompt}`,
    true
  );
  console.log("frontmatter returned by enhanceNoteFrontMatter", response);
  try {
    const newFrontMatter = parse3(response);
    if (typeof newFrontMatter !== "object" || Array.isArray(newFrontMatter) || !newFrontMatter) {
      throw new Error("Invalid YAML: Not an object");
    }
    blacklistedAttrs.forEach((attr) => {
      delete newFrontMatter[attr];
    });
    const tree = await markdown_exports.parseMarkdown(noteContent);
    const frontMatter = await extractFrontmatter(tree);
    const updatedFrontmatter = {
      ...frontMatter,
      ...newFrontMatter
    };
    const frontMatterChange = await prepareFrontmatterDispatch(
      tree,
      updatedFrontmatter
    );
    console.log("updatedNoteContent", frontMatterChange);
    await editor_exports.dispatch(frontMatterChange);
  } catch (e) {
    console.error("Invalid YAML returned by enhanceNoteFrontMatter", e);
    await editor_exports.flashNotification(
      "Error: Invalid Frontmatter YAML returned.",
      "error"
    );
    return;
  }
  await editor_exports.flashNotification(
    "Frontmatter enhanced successfully.",
    "info"
  );
}
async function enhanceNoteWithAI() {
  await tagNoteWithAI();
  await enhanceNoteFrontMatter();
  await suggestPageName();
}
async function streamOpenAIWithSelectionAsPrompt() {
  const selectedTextInfo = await getSelectedTextOrNote();
  const cursorPos = selectedTextInfo.to;
  await currentAIProvider.streamChatIntoEditor({
    messages: [
      {
        role: "system",
        content: "You are an AI note assistant in a markdown-based note tool."
      },
      { role: "user", content: selectedTextInfo.text }
    ],
    stream: true
  }, cursorPos);
}
async function streamChatOnPage() {
  await initIfNeeded();
  const messages = await convertPageToMessages();
  if (messages.length === 0) {
    await editor_exports.flashNotification(
      "Error: The page does not match the required format for a chat."
    );
    return;
  }
  messages.unshift(chatSystemPrompt);
  const enrichedMessages = await enrichChatMessages(messages);
  console.log("enrichedMessages", enrichedMessages);
  let cursorPos = await getPageLength();
  await editor_exports.insertAtPos("\n\n**assistant**: ", cursorPos);
  cursorPos += "\n\n**assistant**: ".length;
  await editor_exports.insertAtPos("\n\n**user**: ", cursorPos);
  await editor_exports.moveCursor(cursorPos + "\n\n**user**: ".length);
  try {
    await currentAIProvider.streamChatIntoEditor({
      messages: enrichedMessages,
      stream: true
    }, cursorPos);
  } catch (error) {
    console.error("Error streaming chat on page:", error);
    await editor_exports.flashNotification("Error streaming chat on page.", "error");
  }
}
async function promptAndGenerateImage() {
  await initIfNeeded();
  if (!aiSettings.imageModels || aiSettings.imageModels.length === 0) {
    await editor_exports.flashNotification("No image models available.", "error");
    return;
  }
  try {
    const prompt2 = await editor_exports.prompt("Enter a prompt for DALL\xB7E:");
    if (!prompt2 || !prompt2.trim()) {
      await editor_exports.flashNotification(
        "No prompt entered. Operation cancelled.",
        "error"
      );
      return;
    }
    const imageOptions = {
      prompt: prompt2,
      numImages: 1,
      size: "1024x1024",
      quality: "hd"
    };
    const imageData = await currentImageProvider.generateImage(imageOptions);
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
async function queryAI(userPrompt, systemPrompt) {
  try {
    await initIfNeeded();
    const defaultSystemPrompt = "You are an AI note assistant helping to render content for a note. Please follow user instructions and keep your response short and concise.";
    const response = await currentAIProvider.singleMessageChat(
      userPrompt,
      systemPrompt || defaultSystemPrompt
    );
    return response;
  } catch (error) {
    console.error("Error querying OpenAI:", error);
    throw error;
  }
}
async function testEmbeddingGeneration() {
  await initIfNeeded();
  const text = await editor_exports.prompt("Enter some text to embed:");
  if (!text) {
    await editor_exports.flashNotification("No text entered.", "error");
    return;
  }
  const embedding = await currentEmbeddingProvider.generateEmbeddings({
    text
  });
  await editor_exports.insertAtCursor(`

Embedding: ${embedding}`);
}

// 54969c656d5cb084.js
var functionMapping = {
  aiPromptSlashCommplete: aiPromptSlashComplete,
  queryAI,
  reloadSettingsPageEvent: reloadSettingsPage,
  reloadConfigEvent: reloadConfig2,
  summarizeNote: openSummaryPanel,
  insertSummary,
  callOpenAI: callOpenAIwithNote,
  tagNoteWithAI,
  promptAndGenerateImage,
  streamOpenAIWithSelectionAsPrompt,
  streamChatOnPage,
  insertAiPromptFromTemplate,
  suggestPageName,
  enhanceNoteFrontMatter,
  enhanceNoteWithAI,
  selectTextModel: selectModelFromConfig,
  selectImageModel: selectImageModelFromConfig,
  selectEmbeddingModel: selectEmbeddingModelFromConfig,
  testEmbeddingGeneration,
  getAllEmbeddings,
  searchEmbeddings,
  queueEmbeddingGeneration,
  processEmbeddingsQueue,
  processSummaryQueue,
  generateEmbeddings,
  generateEmbeddingsOnServer,
  searchEmbeddingsForChat,
  searchCombinedEmbeddings,
  searchSummaryEmbeddings,
  readPageSearchEmbeddings: readFileEmbeddings,
  writePageSearchEmbeddings: writeFileEmbeddings,
  getPageMetaSearchEmbeddings: getFileMetaEmbeddings,
  searchCommand,
  updateSearchPage
};
var manifest = {
  "name": "silverbullet-ai",
  "requiredPermissions": [
    "fetch"
  ],
  "functions": {
    "aiPromptSlashCommplete": {
      "path": "src/prompts.ts:aiPromptSlashComplete",
      "events": [
        "slash:complete"
      ]
    },
    "queryAI": {
      "path": "sbai.ts:queryAI"
    },
    "reloadSettingsPageEvent": {
      "path": "sbai.ts:reloadSettingsPage",
      "events": [
        "page:saved"
      ]
    },
    "reloadConfigEvent": {
      "path": "sbai.ts:reloadConfig",
      "events": [
        "config:loaded"
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
    },
    "suggestPageName": {
      "path": "sbai.ts:suggestPageName",
      "command": {
        "name": "AI: Suggest Page Name"
      }
    },
    "enhanceNoteFrontMatter": {
      "path": "sbai.ts:enhanceNoteFrontMatter",
      "command": {
        "name": "AI: Generate Note FrontMatter"
      }
    },
    "enhanceNoteWithAI": {
      "path": "sbai.ts:enhanceNoteWithAI",
      "command": {
        "name": "AI: Enhance Note"
      }
    },
    "selectTextModel": {
      "path": "sbai.ts:selectModelFromConfig",
      "command": {
        "name": "AI: Select Text Model from Config"
      }
    },
    "selectImageModel": {
      "path": "sbai.ts:selectImageModelFromConfig",
      "command": {
        "name": "AI: Select Image Model from Config"
      }
    },
    "selectEmbeddingModel": {
      "path": "sbai.ts:selectEmbeddingModelFromConfig",
      "command": {
        "name": "AI: Select Embedding Model from Config"
      }
    },
    "testEmbeddingGeneration": {
      "path": "sbai.ts:testEmbeddingGeneration",
      "command": {
        "name": "AI: Test Embedding Generation"
      }
    },
    "getAllEmbeddings": {
      "path": "src/embeddings.ts:getAllEmbeddings",
      "env": "server"
    },
    "searchEmbeddings": {
      "path": "src/embeddings.ts:searchEmbeddings",
      "env": "server"
    },
    "queueEmbeddingGeneration": {
      "path": "src/embeddings.ts:queueEmbeddingGeneration",
      "env": "server",
      "events": [
        "page:index"
      ]
    },
    "processEmbeddingsQueue": {
      "path": "src/embeddings.ts:processEmbeddingsQueue",
      "mqSubscriptions": [
        {
          "queue": "aiEmbeddingsQueue",
          "batchSize": 1,
          "autoAck": true,
          "pollInterval": 6e5
        }
      ]
    },
    "processSummaryQueue": {
      "path": "src/embeddings.ts:processSummaryQueue",
      "mqSubscriptions": [
        {
          "queue": "aiSummaryQueue",
          "batchSize": 1,
          "autoAck": true,
          "pollInterval": 6e5
        }
      ]
    },
    "generateEmbeddings": {
      "path": "src/embeddings.ts:generateEmbeddings"
    },
    "generateEmbeddingsOnServer": {
      "path": "src/embeddings.ts:generateEmbeddingsOnServer"
    },
    "searchEmbeddingsForChat": {
      "path": "src/embeddings.ts:searchEmbeddingsForChat"
    },
    "searchCombinedEmbeddings": {
      "path": "src/embeddings.ts:searchCombinedEmbeddings"
    },
    "searchSummaryEmbeddings": {
      "path": "src/embeddings.ts:searchSummaryEmbeddings"
    },
    "readPageSearchEmbeddings": {
      "path": "src/embeddings.ts:readFileEmbeddings",
      "pageNamespace": {
        "pattern": "\u{1F916} .+",
        "operation": "readFile"
      }
    },
    "writePageSearchEmbeddings": {
      "path": "src/embeddings.ts:writeFileEmbeddings",
      "pageNamespace": {
        "pattern": "\u{1F916} .+",
        "operation": "writeFile"
      }
    },
    "getPageMetaSearchEmbeddings": {
      "path": "src/embeddings.ts:getFileMetaEmbeddings",
      "pageNamespace": {
        "pattern": "\u{1F916} .+",
        "operation": "getFileMeta"
      }
    },
    "searchCommand": {
      "path": "src/embeddings.ts:searchCommand",
      "command": {
        "name": "AI: Search"
      }
    },
    "updateSearchPage": {
      "path": "src/embeddings.ts:updateSearchPage",
      "events": [
        "editor:pageLoaded",
        "editor:pageReloaded"
      ]
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
