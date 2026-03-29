import { readFile, stat, writeFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { parse as yamlParse } from "yaml";
import { parseFiles } from "@structured-types/api";

const tag = process.argv[2];

if (!tag) {
  console.error("No tag provided.");
  process.exit(1);
}

function getGitHubRepo(): string {
  const envRepo = process.env.GITHUB_REPOSITORY;
  if (envRepo) return envRepo;
  try {
    const url = execSync("git remote get-url origin", { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
    const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
    if (match) return match[1];
  } catch {}
  return "justyns/silverbullet-ai";
}

const githubRepo = getGitHubRepo();

function extractDocsForFunction(functionPath: string): string {
  const [filePath, functionName] = functionPath.split(":");
  const parsed = parseFiles([`./${filePath}`]);
  if (!parsed[functionName]) return "No documentation found.";
  return parsed[functionName].description || "No documentation found.";
}

async function updateReadme(tag: string) {
  const readmePath = "./README.md";
  const plugYamlPath = "./silverbullet-ai.plug.yaml";
  const installationDocPath = "./docs/Installation.md";
  const featuresDocPath = "./docs/Features.md";
  let readmeContent = await readFile(readmePath, "utf-8");
  const plugYamlContent = await readFile(plugYamlPath, "utf-8");
  let installationDocContent = await readFile(installationDocPath, "utf-8");
  const featuresDocContent = await readFile(featuresDocPath, "utf-8");

  const escapedRepo = githubRepo.replace("/", "\\/");
  const ghrVersionedPattern = new RegExp(`ghr:${escapedRepo}@[0-9.]+\\/PLUG\\.md`, "g");
  const ghrVersioned = `ghr:${githubRepo}@${tag}/PLUG.md`;

  readmeContent = readmeContent.replace(ghrVersionedPattern, ghrVersioned);
  installationDocContent = installationDocContent.replace(ghrVersionedPattern, ghrVersioned);

  const plugYaml = yamlParse(plugYamlContent);
  const commands = plugYaml.functions;
  let commandsMarkdown = "";

  for (const [key, value] of Object.entries(commands)) {
    if (typeof value === "object" && value.path && value.command?.name) {
      const docs = extractDocsForFunction(value.path);
      console.log(`Documentation for ${key}: ${docs}`);
      commandsMarkdown += `- **${value.command.name}**: ${docs}\n`;
      const commandDocsPath = `./docs/Commands/${value.command.name}.md`;
      try {
        await stat(commandDocsPath);
      } catch (error: any) {
        if (error.code === "ENOENT") {
          if (docs) {
            await writeFile(commandDocsPath, `${docs}\n`, "utf-8");
          }
        } else {
          throw error;
        }
      }
    }
  }

  const startCommandsMarker = "<!-- start-commands-and-functions -->";
  const endCommandsMarker = "<!-- end-commands-and-functions -->";
  const commandsInsertionSection = `${startCommandsMarker}\n${commandsMarkdown}\n${endCommandsMarker}`;

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

  const startFeaturesMarker = "<!-- start-features -->";
  const endFeaturesMarker = "<!-- end-features -->";
  const featuresInsertionSection = `${startFeaturesMarker}\n${featuresDocContent}\n${endFeaturesMarker}`;

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

  await writeFile(readmePath, readmeContent, "utf-8");
  await writeFile(installationDocPath, installationDocContent, "utf-8");
}

updateReadme(tag);
