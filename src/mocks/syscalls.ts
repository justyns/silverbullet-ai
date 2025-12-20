import { parse as parseYAML } from "@std/yaml";
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
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      !(key in current) || typeof current[key] !== "object" ||
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
    case "editor.getText":
      return await Promise.resolve(editorText);

    case "mock.setPage":
      pages[args[0]] = args[1];
      break;
    case "space.readPage":
      //   console.log("space.readPage", args);
      return await Promise.resolve(pages[args[0]]);

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
        args[0].startsWith("ai.keys.") && value === undefined &&
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

export { syscall };
