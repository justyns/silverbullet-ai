import { parse as parseYAML } from "yaml";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { parser } from "@lezer/markdown";

// TODO: Just use whatever SB uses internally
function parseMarkdownMock(text: string) {
  const lezerTree = parser.parse(text);

  function convertNode(node: any, from: number, to: number): any {
    const children: any[] = [];

    if (node.firstChild) {
      let child = node.firstChild;
      while (child) {
        const childFrom = child.from;
        const childTo = child.to;
        children.push(convertNode(child, childFrom, childTo));
        child = child.nextSibling;
      }
    }

    return {
      type: node.type?.name || "Document",
      from,
      to,
      text: text.substring(from, to),
      children: children.length > 0 ? children : undefined,
    };
  }

  return convertNode(lezerTree, 0, text.length);
}

let editorText = "Mock data";
(globalThis as any).editorText;
let editorCursor = 0;
let editorSelection = { from: 0, to: 0 };
let editorInsertDelayMs = 0;

const pages: { [key: string]: string } = {};
(globalThis as any).pages;

const clientStore: { [key: string]: string } = {};
(globalThis as any).clientStore;

const _spaceConfig = {};
(globalThis as any).spaceConfig;

const systemConfig: { [key: string]: any } = {};
(globalThis as any).systemConfig;

// Mock storage for indexed objects by tag
const indexedObjectsByTag: { [tag: string]: any[] } = {};
(globalThis as any).indexedObjectsByTag;

// Helper functions for nested config access
function getNestedValue(obj: any, path: string, defaultValue?: any): any {
  const keys = path.split(".");
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return defaultValue;
    }
    current = current[key];
  }

  return current;
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  for (const key of keys) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      throw new Error(`Unsafe config key: ${path}`);
    }
  }
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      !(key in current) ||
      typeof current[key] !== "object" ||
      current[key] === null
    ) {
      current[key] = {};
    }
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

// let indexedObjects: { [key: string]: string } = {};
// (globalThis as any).indexedObjects;

(globalThis as any).syscall = async (name: string, ...args: readonly any[]) => {
  switch (name) {
    // I tried a lot of things to get this working differently, but
    // ended up with just keeping this in a variable that can be changed
    // in the tests.
    case "mock.setText":
      editorText = args[0];
      break;
    case "mock.setCursor":
      editorCursor = args[0];
      break;
    case "mock.setSelection":
      editorSelection = args[0];
      break;
    case "mock.setEditorInsertDelay":
      editorInsertDelayMs = args[0];
      break;
    case "editor.getText":
      return await Promise.resolve(editorText);
    case "editor.setText":
      editorText = args[0];
      break;
    case "editor.getCursor":
      return editorCursor;
    case "editor.getSelection":
      return editorSelection;
    case "editor.getCurrentPage":
      return "Test Page";
    case "editor.insertAtPos": {
      if (editorInsertDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, editorInsertDelayMs));
      }
      const text = args[0];
      const pos = args[1];
      editorText = editorText.slice(0, pos) + text + editorText.slice(pos);
      break;
    }
    case "editor.replaceRange": {
      const from = args[0];
      const to = args[1];
      const text = args[2];
      editorText = editorText.slice(0, from) + text + editorText.slice(to);
      break;
    }
    case "editor.flashNotification":
      break;
    case "editor.moveCursor":
      editorCursor = args[0];
      break;

    case "mock.setPage":
      pages[args[0]] = args[1];
      break;
    case "space.readPage":
      //   console.log("space.readPage", args);
      return await Promise.resolve(pages[args[0]]);
    case "space.getPageMeta":
      return { name: args[0], ref: args[0] };

    case "mock.setConfig":
      setNestedValue(systemConfig, args[0], args[1]);
      break;
    case "mock.getConfig":
      return getNestedValue(systemConfig, args[0], args[1]);
    case "system.getConfig": {
      const value = getNestedValue(systemConfig, args[0], args[1]);
      // If looking for ai.keys.* and the value is undefined (and no default provided),
      // throw an error to simulate missing config
      if (
        args[0].startsWith("ai.keys.") &&
        value === undefined &&
        args[1] === undefined
      ) {
        throw new Error(`Config key ${args[0]} not found`);
      }
      return value;
    }

    // Pass through to the real functions
    case "markdown.parseMarkdown":
      return parseMarkdownMock(args[0]);
    case "yaml.parse":
      return await parseYAML(args[0]);

    case "system.invokeFunction":
      return invokeFunctionMock(args);

    case "clientStore.set":
      clientStore[args[0]] = args[1];
      break;
    case "clientStore.get":
      return clientStore[args[0]];

    // Index syscalls for v2
    case "index.queryLuaObjects": {
      const tag = args[0];
      const _query = args[1];
      return indexedObjectsByTag[tag] || [];
    }
    case "index.indexObjects": {
      const page = args[0];
      const objects = args[1] as any[];
      for (const obj of objects) {
        if (obj.tag) {
          if (!indexedObjectsByTag[obj.tag]) {
            indexedObjectsByTag[obj.tag] = [];
          }
          indexedObjectsByTag[obj.tag].push({ ...obj, page });
        }
      }
      return;
    }

    // Lua syscalls for v2
    case "lua.parseExpression":
      return { type: "MockExpression", expr: args[0] };
    case "lua.evalExpression":
      return evalExpressionMock(args[0]);

    case "mock.setLuaFunction":
      luaFunctionMocks[args[0]] = args[1];
      break;
    case "mock.clearLuaFunctions":
      for (const key in luaFunctionMocks) {
        delete luaFunctionMocks[key];
      }
      break;

    // Config syscalls for v2
    case "config.define":
      return;

    // Mock helpers for tests
    case "mock.setIndexedObjects": {
      const tag = args[0];
      const objects = args[1];
      indexedObjectsByTag[tag] = objects;
      break;
    }
    case "mock.clearIndexedObjects":
      for (const key in indexedObjectsByTag) {
        delete indexedObjectsByTag[key];
      }
      break;
    case "mock.clearClientStore":
      for (const key in clientStore) {
        delete clientStore[key];
      }
      break;

    default:
      throw Error(`Missing mock for: ${name}`);
  }
};

function invokeFunctionMock(args: readonly any[]) {
  switch (args[0]) {
    case "index.indexObjects":
      return true;
    default:
      console.log("system.invokeFunction", args);
      throw Error(`Missing invokeFunction mock for ${args[0]}`);
  }
}

const luaFunctionMocks: { [name: string]: (arg: any) => any } = {};

function evalExpressionMock(expr: string) {
  // Match `name(...)` where name may be dotted (e.g. `myNs.fn`).
  const match = expr.match(/^([A-Za-z_][\w]*(?:\.[A-Za-z_][\w]*)*)\((.*)\)$/s);
  if (!match) {
    throw new Error(`Mock evalExpression: unsupported expression: ${expr}`);
  }
  const [, name, argLiteral] = match;
  const fn = luaFunctionMocks[name];
  if (!fn) {
    throw new Error(`Mock evalExpression: no function registered for ${name}`);
  }
  // Crude Lua-literal -> JS coercion good enough for tests.
  return fn(parseLuaTableLiteral(argLiteral));
}

function parseLuaTableLiteral(src: string): any {
  const trimmed = src.trim();
  if (trimmed === "" || trimmed === "nil") return undefined;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  // Convert Lua table literal `{k="v", ...}` into JSON-ish then parse.
  const jsonish = trimmed
    .replace(/\\\n/g, "\\n")
    .replace(/([{,]\s*)([A-Za-z_][\w]*)\s*=/g, '$1"$2":')
    .replace(/([{,]\s*)\["([^"]*)"\]\s*=/g, '$1"$2":');
  try {
    return JSON.parse(jsonish);
  } catch {
    if (/^".*"$/.test(trimmed)) {
      return JSON.parse(trimmed);
    }
    throw new Error(`Mock evalExpression: could not parse arg: ${src}`);
  }
}

export { syscall };
