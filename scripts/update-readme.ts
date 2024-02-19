import * as yaml from "https://esm.sh/yaml@2.3.4";

const tag = Deno.args[0];

if (!tag) {
  console.error("No tag provided.");
  Deno.exit(1);
}

async function updateReadme(tag: string) {
  const readmePath = "./README.md";
  const plugYamlPath = "./silverbullet-ai.plug.yaml";
  let readmeContent = await Deno.readTextFile(readmePath);
  const plugYamlContent = await Deno.readTextFile(plugYamlPath);

  // Update the tag in the README
  readmeContent = readmeContent.replace(/- ghr:justyns\/silverbullet-ai\/[0-9.]+/, `- ghr:justyns/silverbullet-ai/${tag}`);

  // Parse YAML content
  const plugYaml = yaml.parse(plugYamlContent); 
  const commands = plugYaml.functions;
  const commandsMarkdown = Object.entries(commands).map(([key, value]) => {
    if (typeof value === 'object' && value.command) {
      return `- **${value.command.name}**: ${key}`;
    }
    return '';
  }).filter(line => line).join("\n");

  // Define the section where commands and functions will be inserted
  const startMarker = "<!-- start-commands-and-functions -->";
  const endMarker = "<!-- end-commands-and-functions -->";
  const insertionSection = `${startMarker}\n${commandsMarkdown}\n${endMarker}`;

  // Replace or insert the commands and functions section in the README
  if (readmeContent.includes(startMarker) && readmeContent.includes(endMarker)) {
    const start = readmeContent.indexOf(startMarker);
    const end = readmeContent.indexOf(endMarker) + endMarker.length;
    readmeContent = readmeContent.substring(0, start) + insertionSection + readmeContent.substring(end);
  } else {
    console.error("README does not contain the markers for commands and functions section.");
  }

  await Deno.writeTextFile(readmePath, readmeContent);
}

updateReadme(tag);