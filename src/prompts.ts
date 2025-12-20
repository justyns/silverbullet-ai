import { extractFrontMatter } from "@silverbulletmd/silverbullet/lib/frontmatter";
import {
  editor,
  index,
  lua,
  markdown,
  space,
  system,
} from "@silverbulletmd/silverbullet/syscalls";
import type {
  CompleteEvent,
  SlashCompletionOption,
} from "@silverbulletmd/silverbullet/type/client";

interface AIPromptTemplate {
  ref: string;
  description?: string;
  aiprompt: {
    slashCommand?: string;
    description?: string;
    displayName?: string;
    systemPrompt?: string;
    insertAt?: string;
    chat?: boolean;
    enrichMessages?: boolean;
    postProcessors?: string[];
    order?: number;
  };
}
import { getPageLength, getParagraph, getSelectedText } from "./editorUtils.ts";
import { currentAIProvider, initIfNeeded } from "./init.ts";
import { assembleMessagesWithAttachments, convertPageToMessages, enrichChatMessages } from "./utils.ts";
import { ChatMessage } from "./types.ts";

export async function aiPromptSlashComplete(
  completeEvent: CompleteEvent,
): Promise<{ options: SlashCompletionOption[] } | void> {
  // Query pages tagged with meta/template/aiPrompt that have a slashCommand defined
  const allTemplates = await index.queryLuaObjects<AIPromptTemplate>(
    "page",
    {
      objectVariable: "_",
      where: await lua.parseExpression(
        "_.itags and table.includes(_.itags, 'meta/template/aiPrompt') and _.aiprompt and _.aiprompt.slashCommand",
      ),
    },
  );
  return {
    options: allTemplates.map((template: AIPromptTemplate) => {
      const aiPromptTemplate = template.aiprompt!;

      return {
        label: aiPromptTemplate.slashCommand!, // Query ensures this exists
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
 * Options for Space Lua defined prompts
 */
interface SpaceLuaPromptOptions {
  template: string;
  systemPrompt?: string;
  insertAt?: string;
  chat?: boolean;
  enrichMessages?: boolean;
  postProcessors?: string[];
  extraContext?: Record<string, unknown>;
}

/**
 * Executes an AI prompt template. Supports two modes:
 * 1. Page-based: Pass SlashCompletionOption with templatePage to read template from a page
 * 2. Direct: Pass SpaceLuaPromptOptions with template string directly
 */
export async function insertAiPromptFromTemplate(
  options: SlashCompletionOption | SpaceLuaPromptOptions | undefined,
) {
  let selectedTemplate;
  let directTemplate: string | undefined;
  let extraContext: Record<string, unknown> | undefined;

  // Check if this is a direct template (Space Lua) vs page-based
  const isDirectTemplate = options && "template" in options && options.template;

  if (isDirectTemplate) {
    const luaOptions = options as SpaceLuaPromptOptions;
    directTemplate = luaOptions.template;
    extraContext = luaOptions.extraContext;
    selectedTemplate = {
      ref: "space-lua-prompt",
      systemPrompt: luaOptions.systemPrompt ||
        "You are an AI note assistant. Please follow the prompt instructions.",
      insertAt: luaOptions.insertAt || "cursor",
      chat: luaOptions.chat || false,
      enrichMessages: luaOptions.enrichMessages || false,
      postProcessors: luaOptions.postProcessors || [],
    };
  } else if (
    !options || !("templatePage" in options) || !options.templatePage
  ) {
    // Query pages tagged with meta/template/aiPrompt
    const aiPromptTemplates = await index.queryLuaObjects<AIPromptTemplate>(
      "page",
      {
        objectVariable: "_",
        where: await lua.parseExpression(
          "_.itags and table.includes(_.itags, 'meta/template/aiPrompt') and _.aiprompt",
        ),
      },
    );

    selectedTemplate = await editor.filterBox(
      "Prompt Template",
      aiPromptTemplates.map((templateObj: AIPromptTemplate) => {
        const niceName = templateObj.ref.split("/").pop()!;
        return {
          ...templateObj,
          description: templateObj.aiprompt.description || templateObj.ref,
          name: templateObj.aiprompt.displayName || niceName,
          systemPrompt: templateObj.aiprompt.systemPrompt ||
            "You are an AI note assistant. Please follow the prompt instructions.",
          insertAt: templateObj.aiprompt.insertAt || "cursor",
          chat: templateObj.aiprompt.chat || false,
          enrichMessages: templateObj.aiprompt.enrichMessages || false,
          postProcessors: templateObj.aiprompt.postProcessors || [],
        };
      }),
      `Select the template to use as the prompt.  The prompt will be rendered and sent to the LLM model.`,
    );
  } else {
    const slashOptions = options as SlashCompletionOption;
    console.log("selectedTemplate from slash completion: ", slashOptions);
    const templatePageContent = await space.readPage(slashOptions.templatePage);
    const tree = await markdown.parseMarkdown(templatePageContent);
    const { aiprompt } = await extractFrontMatter(tree);
    console.log("templatePage from slash completion: ", templatePageContent);
    selectedTemplate = {
      ref: slashOptions.templatePage,
      systemPrompt: aiprompt.systemPrompt ||
        aiprompt.system ||
        "You are an AI note assistant. Please follow the prompt instructions.",
      insertAt: aiprompt.insertAt || "cursor",
      chat: aiprompt.chat || false,
      enrichMessages: aiprompt.enrichMessages || false,
      postProcessors: aiprompt.postProcessors || [],
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
    "start-of-line",
    "end-of-line",
    // Item can mean either a list item or a task
    "start-of-item",
    "end-of-item",
    "new-line-above",
    "new-line-below",
    "replace-line",
    "replace-paragraph",
    "replace-selection",
    "replace-smart",
    // "frontmatter",
    // "modal",
    // "replace",
  ];
  if (!validInsertAtOptions.includes(selectedTemplate.insertAt)) {
    console.error(
      `Invalid insertAt value: ${selectedTemplate.insertAt}. It must be one of ${
        validInsertAtOptions.join(
          ", ",
        )
      }`,
    );
    await editor.flashNotification(
      `Invalid insertAt value: ${selectedTemplate.insertAt}. Please select a valid option.`,
      "error",
    );
    return;
  }

  await initIfNeeded();

  let templateText: string;
  let currentPage: string;
  let pageMeta;
  try {
    // Use direct template if provided, otherwise read from page
    if (directTemplate) {
      templateText = directTemplate;
    } else {
      templateText = await space.readPage(selectedTemplate.ref);
    }
    currentPage = await editor.getCurrentPage();
    pageMeta = await space.getPageMeta(currentPage);
  } catch (error) {
    console.error("Error fetching template details or page metadata", error);
    await editor.flashNotification(
      "Error fetching template details or page metadata",
      "error",
    );
    return;
  }

  let currentPageText: string = "";
  let currentLineNumber: number = 0;
  let curCursorPos: number = 0;
  let lineStartPos: number = 0;
  let lineEndPos: number = 0;
  let currentItemBounds: { from: number; to: number } | undefined;
  let currentItemText: string | undefined;
  let parentItemBounds: { from: number; to: number } | undefined;
  let parentItemText: string | undefined;
  let currentParagraph: { from: number; to: number; text: string } | undefined;
  let selectedText: { from: number; to: number; text: string } | undefined;
  let smartReplaceType:
    | "selected-text"
    | "current-paragraph"
    | "current-item"
    | undefined;
  let smartReplaceText: string | undefined;

  try {
    // This is all to get the current line number and position
    currentPageText = await editor.getText();
    curCursorPos = await editor.getCursor();
    const lines = currentPageText.split("\n");
    currentLineNumber = currentPageText
      .substring(0, curCursorPos)
      .split("\n").length;
    lineStartPos = curCursorPos -
      (currentPageText.substring(0, curCursorPos).split("\n").pop()?.length ||
        0);
    lineEndPos = lineStartPos + lines[currentLineNumber - 1].length;
  } catch (error) {
    console.error("Error fetching current page text or cursor position", error);
    await editor.flashNotification(
      "Error fetching current page text or cursor position",
      "error",
    );
    return;
  }

  try {
    // Also get the current item if we need it
    if (
      selectedTemplate.insertAt === "start-of-item" ||
      selectedTemplate.insertAt === "end-of-item" ||
      selectedTemplate.insertAt === "replace-smart"
    ) {
      currentItemBounds = await system.invokeFunction(
        "editor.determineItemBounds",
        currentPageText,
        curCursorPos,
        undefined,
        true,
      );
      if (currentItemBounds) {
        currentItemText = currentPageText.slice(
          currentItemBounds.from,
          currentItemBounds.to,
        );
      }

      parentItemBounds = await system.invokeFunction(
        "editor.determineItemBounds",
        currentPageText,
        curCursorPos,
        0,
        true,
      );
      if (parentItemBounds) {
        parentItemText = currentPageText.slice(
          parentItemBounds.from,
          parentItemBounds.to,
        );
      }
    }
  } catch (error) {
    console.error("Error fetching current item", error);
  }

  try {
    if (
      selectedTemplate.insertAt === "replace-paragraph" ||
      selectedTemplate.insertAt === "replace-smart"
    ) {
      currentParagraph = getParagraph(currentPageText, curCursorPos);
    }
  } catch (error) {
    console.error("Error fetching current paragraph", error);
    await editor.flashNotification("Error fetching current paragraph", "error");
    return;
  }

  try {
    if (
      selectedTemplate.insertAt == "replace-selection" ||
      selectedTemplate.insertAt == "replace-smart"
    ) {
      selectedText = await getSelectedText();
    }
  } catch (error) {
    console.error("Error fetching selected text", error);
  }

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
    case "replace":
      // TODO: Replace selection
      break;
    case "replace-line":
      cursorPos = lineStartPos;
      await editor.replaceRange(lineStartPos, lineEndPos, "");
      break;
    case "replace-selection":
      if (selectedText?.text) {
        cursorPos = selectedText.from;
        await editor.replaceRange(selectedText.from, selectedText.to, "");
      } else {
        // If no text is selected, act like the 'cursor' option
        cursorPos = await editor.getCursor();
      }
      break;
    case "replace-paragraph":
      if (currentParagraph?.text) {
        cursorPos = currentParagraph.from;
        await editor.replaceRange(
          currentParagraph.from,
          currentParagraph.to,
          "",
        );
      } else {
        await editor.flashNotification(
          "Error: current paragraph is undefined",
          "error",
        );
      }
      break;
    case "replace-smart":
      // replace-smart: text selection -> current item -> current paragraph
      if (selectedText?.text) {
        smartReplaceType = "selected-text";
        smartReplaceText = selectedText.text;
        cursorPos = selectedText.from;
        await editor.replaceRange(selectedText.from, selectedText.to, "");
      } else if (currentItemText && currentItemBounds) {
        smartReplaceType = "current-item";
        smartReplaceText = currentItemText;
        cursorPos = currentItemBounds.from;
        await editor.replaceRange(
          currentItemBounds.from,
          currentItemBounds.to,
          "\n",
        );
      } else if (currentParagraph?.text) {
        smartReplaceType = "current-paragraph";
        smartReplaceText = currentParagraph.text;
        cursorPos = currentParagraph.from;
        await editor.replaceRange(
          currentParagraph.from,
          currentParagraph.to,
          "",
        );
      } else {
        await editor.flashNotification(
          "Error: replace-smart: no text selected, current paragraph, or current item",
          "error",
        );
        return;
      }
      console.log("smartReplaceType: ", smartReplaceType);
      console.log("smartReplaceText: ", smartReplaceText);
      break;
    case "start-of-line":
      cursorPos = lineStartPos;
      break;
    case "end-of-line":
      cursorPos = lineEndPos;
      break;
    case "new-line-above":
      cursorPos = lineStartPos;
      await editor.insertAtPos("\n", cursorPos);
      cursorPos += 1;
      break;
    case "new-line-below":
      cursorPos = lineEndPos;
      await editor.insertAtPos("\n", cursorPos);
      cursorPos += 1;
      break;
    case "start-of-item":
      cursorPos = currentItemBounds?.from ?? curCursorPos;
      break;
    case "end-of-item":
      cursorPos = currentItemBounds?.to ?? curCursorPos;
      break;
    case "cursor":
    default:
      cursorPos = await editor.getCursor();
  }

  if (cursorPos === undefined) {
    cursorPos = await getPageLength();
  }

  console.log("templatetext: ", templateText);

  let messages: ChatMessage[] = [];
  const globalMetadata = {
    page: pageMeta,
    currentItemText: currentItemText,
    currentLineNumber: currentLineNumber,
    lineStartPos: lineStartPos,
    lineEndPos: lineEndPos,
    currentPageText: currentPageText,
    parentItemText: parentItemText,
    selectedText: selectedText?.text,
    currentParagraph: currentParagraph?.text,
    smartReplaceType: smartReplaceType,
    smartReplaceText: smartReplaceText,
    // Merge in any extra context provided by Space Lua prompts
    ...(extraContext || {}),
  };

  if (!selectedTemplate.chat) {
    // non-multi-chat template
    let renderedTemplate: string;
    try {
      const templateContent = templateText;
      const templateData = globalMetadata;
      const luaExpression = `spacelua.interpolate(${
        JSON.stringify(templateContent)
      }, ${JSON.stringify(templateData)})`;
      console.log("Evaluating template Lua expression:", luaExpression);
      renderedTemplate = await lua.evalExpression(luaExpression);
      console.log("Template rendered successfully:", renderedTemplate);
    } catch (error) {
      console.error("Template rendering failed:", error);
      console.error("Failed template content:", templateText);
      console.error("Template metadata:", globalMetadata);

      // Fallback to plain text if template rendering fails
      renderedTemplate = templateText;
    }
    if (selectedTemplate.systemPrompt) {
      messages.push({
        role: "system",
        content: selectedTemplate.systemPrompt,
      });
    }
    messages.push({
      role: "user",
      content: renderedTemplate,
    });
  } else {
    // multi-turn-chat template
    messages = await convertPageToMessages(templateText);
    const systemMessage: ChatMessage = {
      role: "system",
      content: selectedTemplate.systemPrompt || "",
    };
    if (selectedTemplate.chat && selectedTemplate.enrichMessages) {
      const { messagesWithAttachments } = await enrichChatMessages(messages, globalMetadata);
      messages = assembleMessagesWithAttachments(systemMessage, messagesWithAttachments);
    } else if (selectedTemplate.systemPrompt) {
      messages.unshift(systemMessage);
    }
  }

  console.log("Messages: ", messages);
  await currentAIProvider.streamChatIntoEditor(
    {
      messages: messages,
      postProcessors: selectedTemplate.postProcessors,
    },
    cursorPos,
  );
}
