import { beforeEach, expect, test } from "vitest";
import "./mocks/syscalls.ts";
import { syscall } from "@silverbulletmd/silverbullet/syscalls";
import { initializeOpenAI } from "./init.ts";
import { refreshModelListCommand } from "./model-discovery.ts";

type Notification = { message: string; type: string };

beforeEach(async () => {
  await syscall("mock.clearNotifications");
});

test("refreshModelListCommand warns when no providers are configured", async () => {
  await syscall("mock.setConfig", "ai", { textModels: [] });
  await initializeOpenAI(false);

  await refreshModelListCommand();

  const notifications = await syscall("mock.getNotifications") as Notification[];
  expect(notifications).toEqual([
    {
      message: "No providers configured under ai.providers.",
      type: "warning",
    },
  ]);
});
