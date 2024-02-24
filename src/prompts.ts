import { CompleteEvent, SlashCompletion, TemplateObject } from "$type/types.ts";
import { editor, space } from "$sb/syscalls.ts";
import { queryObjects } from "$sbplugs/index/plug_api.ts";
import { streamChatWithOpenAI } from "./openai.ts";
import { renderTemplate } from "$sbplugs/template/api.ts";
import { getPageLength } from "./editorUtils.ts";

// TODO: this doesn't work yet, see https://github.com/silverbulletmd/silverbullet/issues/742
export async function aiPromptSlashComplete(
  completeEvent: CompleteEvent,
): Promise<SlashCompletion[]> {
  const allTemplates = await queryObjects<TemplateObject>("template", {
    filter: ["attr", ["attr", "aiprompt"], "slashCommand"],
  }, 5);
  return allTemplates.map((template) => {
    const aiPromptTemplate = template.aiprompt!;
    console.log("ai prompt template: ", aiPromptTemplate);

    return {
      label: aiPromptTemplate.slashCommand,
      detail: template.description,
      order: aiPromptTemplate.order || 0,
      templatePage: template.ref,
      pageName: completeEvent.pageName,
      // TODO: Replace with real function later
      invoke: "prompts.insertAiPromptFromTemplate",
    //   invoke: "prompts.insertAiPromptTemplate",
    };
  });
}

export async function insertAiPromptFromTemplate() {
  // TODO: I don't really understand how this filter works.  I'd rather have it check for a #aiPrompt tag instead of an aiprompt.description property
  const aiPromptTemplates = await queryObjects<TemplateObject>("template", {
    filter: ["attr", ["attr", "aiprompt"], "description"],
  });

  const selectedTemplate = await editor.filterBox(
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

  if (!selectedTemplate) {
    await editor.flashNotification("No template selected");
    return;
  }

  console.log("User selected prompt template: ", selectedTemplate);

  const validInsertAtOptions = [
    "cursor",
    "page-start",
    "page-end",
    "frontmatter",
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
    systemMessage: selectedTemplate.systemPrompt,
    userMessage: renderedTemplate.text,
  }, cursorPos);
}
