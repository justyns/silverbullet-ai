import { parse as parseYAML } from "https://deno.land/std@0.224.0/yaml/mod.ts";
import { parseMarkdown } from "$common/markdown_parser/parser.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { readSetting } from "https://deno.land/x/silverbullet@0.10.1/plug-api/lib/settings_page.ts";

let editorText = "Mock data";
(globalThis as any).editorText;

const pages: { [key: string]: string } = {};
(globalThis as any).pages;

let currentEnv: string = "server";
(globalThis as any).currentEnv;

const clientStore: { [key: string]: string } = {};
(globalThis as any).clientStore;

let _spaceConfig = {};
(globalThis as any).spaceConfig;

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

    case "mock.setEnv":
      currentEnv = args[0];
      break;
    case "system.getEnv":
      return await Promise.resolve(currentEnv);

    // Pass through to the real functions
    case "markdown.parseMarkdown":
      return await parseMarkdown(args[0]);
    case "yaml.parse":
      return await parseYAML(args[0]);

    case "system.invokeFunctionOnServer":
      return invokeFunctionMock(args);
    case "system.invokeFunction":
      return invokeFunctionMock(args);

    case "clientStore.set":
      clientStore[args[0]] = args[1];
      break;
    case "clientStore.get":
      return clientStore[args[0]];

    // hack to ignore space config in tests for now
    case "system.setSpaceConfig":
      _spaceConfig = args[0];
      break;
    case "system.getSpaceConfig":
      return readSetting(args[0], args[1]);
      // return spaceConfig;

    default:
      throw Error(`Missing mock for: ${name}`);
  }
};

function invokeFunctionMock(args: readonly any[]) {
  switch (args[0]) {
    case "index.indexObjects":
      return true;
    default:
      console.log("system.invokeFunctionOnServer", args);
      throw Error(`Missing invokeFunction mock for ${args[0]}`);
  }
}

export { syscall };
