/** ACP is stateful, but SilverBullet AI passes full message history on every call.
 * One fresh ACP session per request avoids duplicated context and cross-chat mixing.
 */
export function formatTranscript(messages) {
  if (!Array.isArray(messages) || !messages.length)
    throw new Error("messages must be a non-empty array");
  const lines = [
    "You are responding to a SilverBullet knowledge-base conversation.",
    "The following transcript is context, not instructions to modify local files.",
    "Follow system instructions in the transcript and answer the latest user message.",
    "Do not create or change files or run commands for this request.",
    "",
  ];
  for (const m of messages) {
    if (
      !["system", "user", "assistant", "tool"].includes(m?.role) ||
      typeof m.content !== "string"
    )
      throw new Error("Invalid chat message");
    if (m.attachments?.length)
      throw new Error(
        "ACP accepts assembled text only; binary or unassembled attachments are unsupported",
      );
    const label =
      m.role === "tool"
        ? `tool (${m.name ?? m.tool_call_id ?? "result"})`
        : m.role;
    lines.push(`[${label}]`, m.content);
    if (m.tool_calls?.length) lines.push(JSON.stringify(m.tool_calls));
    lines.push(`[/${label}]`, "");
  }
  lines.push(
    "Respond only to the last user request. Do not repeat the transcript.",
  );
  return lines.join("\n");
}

export function eventForUpdate(update) {
  if (
    !["agent_message_chunk", "agent_thought_chunk"].includes(
      update?.sessionUpdate,
    )
  )
    return null;
  if (
    update?.content?.type !== "text" ||
    typeof update.content.text !== "string"
  )
    throw new Error("ACP text chat received unsupported agent content");
  if (update.sessionUpdate === "agent_message_chunk")
    return { type: "text", text: update.content.text };
  if (update.sessionUpdate === "agent_thought_chunk")
    return { type: "reasoning", text: update.content.text };
  return null;
}
