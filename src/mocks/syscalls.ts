import { parse } from "$common/markdown_parser/parse_tree.ts";
import { extendedMarkdownLanguage } from "$common/markdown_parser/parser.ts";
import { YAML } from "$lib/deps_server.ts";

let editorText = "Mock data";
(globalThis as any).editorText;

let pages: { [key: string]: string } = {};
(globalThis as any).pages;

let currentEnv: string = "server";
(globalThis as any).currentEnv;

globalThis.syscall = async (name: string, ...args: readonly any[]) => {
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
      return await Promise.resolve(parse(extendedMarkdownLanguage, args[0]));
    case "yaml.parse":
      return await Promise.resolve(YAML.parse(args[0]));
    default:
      throw Error(`Missing mock for: ${name}`);
  }
};
