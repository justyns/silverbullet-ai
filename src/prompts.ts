import { CompleteEvent, SlashCompletion, TemplateObject } from "$type/types.ts";
import { editor, space } from "$sb/syscalls.ts";
import { queryObjects } from "$sbplugs/index/plug_api.ts";
import { streamChatWithOpenAI } from "./openai.ts";
import { renderTemplate } from "$sbplugs/template/api.ts";

// TODO: this doesn't work, see https://github.com/silverbulletmd/silverbullet/issues/742
// export async function aiPromptSlashComplete(
//   completeEvent: CompleteEvent,
// ): Promise<SlashCompletion[]> {
//   const allTemplates = await queryObjects<TemplateObject>("template", {
//     filter: ["attr", ["attr", ["attr", "hooks"], "aiprompt"], "slashCommand"],
//   }, 5);
//   return allTemplates.map((template) => {
//     const aiPromptTemplate = template.hooks!.aiprompt!;

//     return {
//       label: aiPromptTemplate.slashCommand,
//       detail: template.description,
//       order: aiPromptTemplate.order || 0,
//       templatePage: template.ref,
//       pageName: completeEvent.pageName,
//       invoke: "prompts.insertAiPromptTemplate",
//     };
//   });
// }

// export async function insertAiPromptTemplate(slashCompletion: SlashCompletion) {
//   const pageObject = await space.readPage(slashCompletion.pageName);
//   const templateText = await space.readPage(slashCompletion.templatePage);
//   const { text: promptText } = await renderTemplate(
//     templateText,
//     { page: pageObject },
//     { page: pageObject },
//   );

//   let cursorPos = await editor.getCursor();
//   await streamChatWithOpenAI({
//     systemMessage:
//       "You are an AI note assistant. Please follow the prompt instructions.",
//     userMessage: promptText,
//   }, cursorPos);
// }

export async function insertAiPromptFromTemplate() {
  // TODO: I don't really understand how this filter works.  I'd rather have it check for a #aiPrompt tag instead of an aiprompt.description property
  const aiPromptTemplates = await queryObjects<TemplateObject>("template", {
    filter: ["attr", ["attr", "aiprompt"], "description"],
  });

  const selectedTemplate = await editor.filterBox(
    "LLM Prompt",
    aiPromptTemplates.map((templateObj) => {
      const niceName = templateObj.ref.split("/").pop()!;
      return {
        ...templateObj,
        description: templateObj.description || templateObj.ref,
        name: templateObj.displayName || niceName,
      };
    }),
    `Select the template to use as the prompt.  The prompt will be rendered and sent to the LLM model.`,
  );

  if (!selectedTemplate) {
    await editor.flashNotification("No template selected");
    return;
  }

  console.log("User selected prompt template: ", selectedTemplate);

  const templateText = await space.readPage(selectedTemplate.ref);
  const currentPage = await editor.getCurrentPage();
  const pageMeta = await space.getPageMeta(currentPage);
  const cursorPos = await editor.getCursor();

  console.log("templatetext: ", templateText);

  const renderedTemplate = await renderTemplate(templateText, pageMeta, {
    page: pageMeta,
  });
  console.log("Rendered template:", renderedTemplate);

  await streamChatWithOpenAI({
    systemMessage:
      "You are an AI note assistant. Please follow the prompt instructions.",
    userMessage: renderedTemplate.text,
  }, cursorPos);
}
