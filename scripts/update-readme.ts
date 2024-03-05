import * as yaml from "https://esm.sh/yaml@2.3.4";
import { parseFiles } from "https://esm.sh/@structured-types/api";

const tag = Deno.args[0];

if (!tag) {
  console.error("No tag provided.");
  Deno.exit(1);
}

function extractDocsForFunction(functionPath: string): string {
  const [filePath, functionName] = functionPath.split(":");
  const parsed = parseFiles([`./${filePath}`]);
  // console.log("parsed", parsed);
  if (!parsed[functionName]) return "No documentation found.";
  return parsed[functionName].description;
}

async function updateReadme(tag: string) {
  const readmePath = "./README.md";
  const plugYamlPath = "./silverbullet-ai.plug.yaml";
  let readmeContent = await Deno.readTextFile(readmePath);
  const plugYamlContent = await Deno.readTextFile(plugYamlPath);

  // Update the tag in the README
  readmeContent = readmeContent.replace(
    /- ghr:justyns\/silverbullet-ai\/[0-9.]+/,
    `- ghr:justyns/silverbullet-ai/${tag}`,
  );

  // Parse plug YAML to get a list of functions/commands
  const plugYaml = yaml.parse(plugYamlContent);
  const commands = plugYaml.functions;
  let commandsMarkdown = "";

  // Extract documentation for each command using jsdoc/tsdoc comments
  for (const [key, value] of Object.entries(commands)) {
    if (typeof value === "object" && value.path && value.command?.name) {
      const docs = extractDocsForFunction(value.path);
      console.log(`Documentation for ${key}: ${docs}`);
      commandsMarkdown += `- **${value.command.name}**: ${docs}\n`;
    const commandDocsPath = `./docs/Commands/${value.command.name}.md`;
    try {
      await Deno.stat(commandDocsPath);
      // File exists, ignore for now
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        // Command doc does not exist, create a new one
        if (docs) {
          const commandDocsContent = `---
tags: commands
commandName: "${value.command.name}"
commandSummary: "${docs.replace(/"/g, '\\"')}"
---`;
          await Deno.writeTextFile(commandDocsPath, commandDocsContent);
        }
      } else {
        throw error;
      }
    }
    }
  }

  // This "dynamic" part of the readme will be enclosed with comments to make it replaceable
  const startMarker = "<!-- start-commands-and-functions -->";
  const endMarker = "<!-- end-commands-and-functions -->";
  const insertionSection = `${startMarker}\n${commandsMarkdown}\n${endMarker}`;

  // Replace or insert the commands and functions section in the README
  if (
    readmeContent.includes(startMarker) && readmeContent.includes(endMarker)
  ) {
    const start = readmeContent.indexOf(startMarker);
    const end = readmeContent.indexOf(endMarker) + endMarker.length;
    readmeContent = readmeContent.substring(0, start) + insertionSection +
      readmeContent.substring(end);
  } else {
    console.error(
      "README does not contain the markers for commands and functions section.",
    );
  }

  await Deno.writeTextFile(readmePath, readmeContent);
}

updateReadme(tag);
