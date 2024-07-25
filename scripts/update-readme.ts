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
  const installationDocPath = "./docs/Installation.md";
  const featuresDocPath = "./docs/Features.md";
  let readmeContent = await Deno.readTextFile(readmePath);
  const plugYamlContent = await Deno.readTextFile(plugYamlPath);
  let installationDocContent = await Deno.readTextFile(installationDocPath);
  const featuresDocContent = await Deno.readTextFile(featuresDocPath);

  // Update the tag in the README
  readmeContent = readmeContent.replace(
    /- ghr:justyns\/silverbullet-ai\/[0-9.]+/,
    `- ghr:justyns/silverbullet-ai/${tag}`,
  );

  // Update the tag in the Installation.md
  installationDocContent = installationDocContent.replace(
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
            const sanitizedDocs = docs.replace(/\\/g, "\\\\").replace(
              /"/g,
              '\\"',
            );
            const commandDocsContent = `---
tags: commands
commandName: "${value.command.name}"
commandSummary: "${sanitizedDocs}"
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
  const startCommandsMarker = "<!-- start-commands-and-functions -->";
  const endCommandsMarker = "<!-- end-commands-and-functions -->";
  const commandsInsertionSection =
    `${startCommandsMarker}\n${commandsMarkdown}\n${endCommandsMarker}`;

  // Replace or insert the commands and functions section in the README
  if (
    readmeContent.includes(startCommandsMarker) &&
    readmeContent.includes(endCommandsMarker)
  ) {
    const start = readmeContent.indexOf(startCommandsMarker);
    const end = readmeContent.indexOf(endCommandsMarker) +
      endCommandsMarker.length;
    readmeContent = readmeContent.substring(0, start) +
      commandsInsertionSection +
      readmeContent.substring(end);
  } else {
    console.error(
      "README does not contain the markers for commands and functions section.",
    );
  }

  // Update the features section in the README
  const startFeaturesMarker = "<!-- start-features -->";
  const endFeaturesMarker = "<!-- end-features -->";
  const featuresInsertionSection =
    `${startFeaturesMarker}\n${featuresDocContent}\n${endFeaturesMarker}`;

  if (
    readmeContent.includes(startFeaturesMarker) &&
    readmeContent.includes(endFeaturesMarker)
  ) {
    const start = readmeContent.indexOf(startFeaturesMarker);
    const end = readmeContent.indexOf(endFeaturesMarker) +
      endFeaturesMarker.length;
    readmeContent = readmeContent.substring(0, start) +
      featuresInsertionSection +
      readmeContent.substring(end);
  } else {
    console.error(
      "README does not contain the markers for features section.",
    );
  }

  await Deno.writeTextFile(readmePath, readmeContent);
  await Deno.writeTextFile(installationDocPath, installationDocContent);
}

updateReadme(tag);
