import { extractFrontmatter } from "$sb/lib/frontmatter.ts";
import { editor, markdown, space } from "$sb/syscalls.ts";
import { queryObjects } from "$sbplugs/index/plug_api.ts";
import { renderTemplate } from "$sbplugs/template/api.ts";
import {
  CompleteEvent,
  SlashCompletion,
  SlashCompletionOption,
  TemplateObject,
} from "$type/types.ts";
import { getPageLength } from "./editorUtils.ts";
import { streamChatWithOpenAI } from "./openai.ts";
import { supportsPlugSlashComplete } from "./utils.ts";

// TODO: This only works in edge (0.7.2+), see https://github.com/silverbulletmd/silverbullet/issues/742
export async function aiPromptSlashComplete(
  completeEvent: CompleteEvent,
): Promise<{ options: SlashCompletion[] } | void> {
  if (!supportsPlugSlashComplete()) {
    return;
  }
  const allTemplates = await queryObjects<TemplateObject>("template", {
    filter: ["attr", ["attr", "aiprompt"], "slashCommand"],
  }, 5);
  return {
    options: allTemplates.map((template) => {
      const aiPromptTemplate = template.aiprompt!;
      console.log("ai prompt template: ", aiPromptTemplate);

      return {
        label: aiPromptTemplate.slashCommand,
        detail: aiPromptTemplate.description || template.description,
        order: aiPromptTemplate.order || 0,
        templatePage: template.ref,
        pageName: completeEvent.pageName,
        invoke: "silverbullet-ai.insertAiPromptFromTemplate",
      };
    }),
  };
}

/**
 * Prompts the user to select a template, renders that template, sends it to the LLM, and then inserts the result into the page.
 * Valid templates must have a value for aiprompt.description in the frontmatter.
 */
export async function insertAiPromptFromTemplate(
  slashCompletion: SlashCompletionOption | undefined,
) {
  let selectedTemplate;

  if (!slashCompletion || !slashCompletion.templatePage) {
    // TODO: I don't really understand how this filter works.  I'd rather have it check for a #aiPrompt tag instead of an aiprompt.description property
    const aiPromptTemplates = await queryObjects<TemplateObject>("template", {
      filter: ["attr", ["attr", "aiprompt"], "description"],
    });

    selectedTemplate = await editor.filterBox(
      "Prompt Template",
      aiPromptTemplates.map((templateObj) => {
        const niceName = templateObj.ref.split("/").pop()!;
        return {
          ...templateObj,
          description: templateObj.aiprompt.description || templateObj.ref,
          name: templateObj.aiprompt.displayName || niceName,
          systemPrompt: templateObj.aiprompt.systemPrompt ||
            "You are an AI note assistant. Please follow the prompt instructions.",
          insertAt: templateObj.aiprompt.insertAt || "cursor",
          // parseAs: templateObj.aiprompt.parseAs || "markdown",
        };
      }),
      `Select the template to use as the prompt.  The prompt will be rendered and sent to the LLM model.`,
    );
  } else {
    console.log("selectedTemplate from slash completion: ", slashCompletion);
    const templatePage = await space.readPage(slashCompletion.templatePage);
    const tree = await markdown.parseMarkdown(templatePage);
    const { aiprompt } = await extractFrontmatter(tree);
    console.log("templatePage from slash completion: ", templatePage);
    selectedTemplate = {
      ref: slashCompletion.templatePage,
      systemPrompt: aiprompt.systemPrompt ||
        "You are an AI note assistant. Please follow the prompt instructions.",
      insertAt: aiprompt.insertAt || "cursor",
    };
  }

  if (!selectedTemplate) {
    await editor.flashNotification("No template selected");
    return;
  }

  console.log("User selected prompt template: ", selectedTemplate);

  const validInsertAtOptions = [
    "cursor",
    "page-start",
    "page-end",
    // "frontmatter",
    // "modal",
  ];
  if (!validInsertAtOptions.includes(selectedTemplate.insertAt)) {
    console.error(
      `Invalid insertAt value: ${selectedTemplate.insertAt}. It must be one of ${
        validInsertAtOptions.join(", ")
      }`,
    );
    await editor.flashNotification(
      `Invalid insertAt value: ${selectedTemplate.insertAt}. Please select a valid option.`,
      "error",
    );
    return;
  }

  const templateText = await space.readPage(selectedTemplate.ref);
  const currentPage = await editor.getCurrentPage();
  const pageMeta = await space.getPageMeta(currentPage);

  let cursorPos;
  switch (selectedTemplate.insertAt) {
    case "page-start":
      cursorPos = 0;
      break;
    case "page-end":
      cursorPos = await getPageLength();
      break;
    case "frontmatter":
      await editor.flashNotification(
        `rendering in frontmatter not supported yet`,
        "error",
      );
      break;
    case "modal":
      // TODO: How do we handle modals?
      break;
    case "cursor":
    default:
      cursorPos = await editor.getCursor();
  }

  //   console.log("templatetext: ", templateText);

  const renderedTemplate = await renderTemplate(templateText, pageMeta, {
    page: pageMeta,
  });
  //   console.log("Rendered template:", renderedTemplate);

  await streamChatWithOpenAI({
    messages: {
      systemMessage: selectedTemplate.systemPrompt,
      userMessage: renderedTemplate.text,
    },
    cursorStart: cursorPos,
  });
}
