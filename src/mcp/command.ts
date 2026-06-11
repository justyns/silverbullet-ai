// "AI: Test MCP Connection" command: connects to every configured MCP server,
// writes a status report page, and returns the report markdown

import { editor, space } from "@silverbulletmd/silverbullet/syscalls";
import { aiSettings, initIfNeeded } from "../init.ts";
import { log } from "../utils.ts";
import { renderMCPTestReport, testMCPServers } from "./index.ts";

const MCP_TEST_PAGE = "AI: MCP Connection Test";

export async function testMcpConnection(): Promise<string> {
  try {
    await initIfNeeded();
  } catch (e) {
    log.warn("MCP test: initialization reported an error:", e);
  }

  const statuses = await testMCPServers(aiSettings?.mcpServers);
  const report = renderMCPTestReport(statuses);

  // Best-effort UX: persist + open the report. Failures (e.g. headless runtime,
  // read-only space) are logged but don't prevent returning the report.
  try {
    await space.writePage(MCP_TEST_PAGE, report);
    await editor.navigate(MCP_TEST_PAGE);
  } catch (e) {
    log.warn("MCP test: could not write/open the report page:", e);
  }

  return report;
}
