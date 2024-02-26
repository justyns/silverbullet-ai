import { readSecret } from "$sb/lib/secrets_page.ts";
import { readSetting } from "$sb/lib/settings_page.ts";
import { editor } from "$sb/syscalls.ts";
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.217.0/assert/mod.ts";
import {
  assertSpyCall,
  returnsNext,
  stub,
} from "https://deno.land/std@0.217.0/testing/mock.ts";
import { aiSettings, apiKey, initializeOpenAI } from "./init.ts";

Deno.test({
  name: "initializeOpenAI updates apiKey and notifies if changed",
  async fn() {
    const fakeApiKey = "new_fake_api_key";
    const readSecretStub = stub(readSecret, {
      returns: [Promise.resolve(fakeApiKey)],
    });
    const flashNotificationStub = stub(
      editor,
      "flashNotification",
      returnsNext([Promise.resolve()]),
    );

    await initializeOpenAI();

    assertEquals(apiKey, fakeApiKey);
    assertSpyCall(flashNotificationStub, 0, {
      args: ["silverbullet-ai API key updated"],
    });

    readSecretStub.restore();
    flashNotificationStub.restore();
  },
});

Deno.test({
  name: "initializeOpenAI throws error and notifies if apiKey is missing",
  async fn() {
    const readSecretStub = stub(readSecret, {
      returns: [Promise.resolve(null)],
    });
    const flashNotificationStub = stub(editor, "flashNotification", {
      returns: [Promise.resolve()],
    });
    const flashNotificationStub = stub(
      editor,
      "flashNotification",
      returnsNext([Promise.resolve()]),
    );

    await assertRejects(
      async () => {
        await initializeOpenAI();
      },
      Error,
      "OpenAI API key is missing. Please set it in the secrets page.",
    );
    assertSpyCall(flashNotificationStub, 0, {
      args: [
        "OpenAI API key is missing. Please set it in the secrets page.",
        "error",
      ],
    });

    readSecretStub.restore();
    flashNotificationStub.restore();
  },
});

Deno.test({
  name: "initializeOpenAI updates aiSettings and notifies if changed",
  async fn() {
    const newSettings = { defaultTextModel: "gpt-4" };
    const readSettingStub = stub(readSetting, {
      returns: [Promise.resolve(newSettings)],
    });
    const flashNotificationStub = stub(
      editor,
      "flashNotification",
      returnsNext([Promise.resolve()]),
    );

    await initializeOpenAI();

    assertEquals(aiSettings.defaultTextModel, "gpt-4");
    assertSpyCall(flashNotificationStub, 0, {
      args: ["silverbullet-ai settings updated"],
    });

    readSettingStub.restore();
    flashNotificationStub.restore();
  },
});

Deno.test({
  name: "initializeOpenAI does not update aiSettings or notify if unchanged",
  async fn() {
    const defaultSettings = {
      defaultTextModel: "gpt-3.5-turbo",
      openAIBaseUrl: "https://api.openai.com/v1",
      dallEBaseUrl: "https://api.openai.com/v1",
      requireAuth: true,
    };
    const readSettingStub = stub(readSetting, {
      returns: [Promise.resolve({})],
    });
    const flashNotificationStub = stub(
      editor,
      "flashNotification",
      returnsNext([Promise.resolve()]),
    );

    await initializeOpenAI();

    assertEquals(aiSettings, defaultSettings);
    assertEquals(flashNotificationStub.calls.length, 0);

    readSettingStub.restore();
    flashNotificationStub.restore();
  },
});
