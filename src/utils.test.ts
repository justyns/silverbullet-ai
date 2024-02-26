import { assertEquals } from "https://deno.land/std@0.217.0/assert/mod.ts";
import { folderName } from "./utils.ts";

Deno.test("folderName should return the correct folder path", () => {
  assertEquals(
    folderName("/sub1/foo"),
    "/sub1",
    "folderName did not return the expected path",
  );
  assertEquals(
    folderName("/sub1/sub2/foo"),
    "/sub1/sub2",
    "folderName did not return the expected path",
  );
  // TODO: Fix trailing slashes on folderName function
  // assertEquals(folderName("/sub1/foo/"), "/sub1", "folderName did not return the expected path");
});

Deno.test("folderName should return an empty string for root files", () => {
  assertEquals(
    folderName("/fileone"),
    "",
    "folderName did not return an empty string for a root file",
  );
  assertEquals(
    folderName("/file one"),
    "",
    "folderName did not return an empty string for a root file",
  );
  assertEquals(
    folderName("filethree"),
    "",
    "folderName did not return an empty string for a root file",
  );
});

// TODO: Get the stubs/mocks working and test convertPageToMessages
