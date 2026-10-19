import { test } from "node:test";
import { strict as assert } from "node:assert";
import { CHAT_ACCOUNTS } from "./chat-accounts";

test("the existing male account is named Manmadha", () => {
  assert.equal(CHAT_ACCOUNTS.find((account) => account.username === "manmadha")?.displayName, "Manmadha");
});

test("the existing female account is named Eshaaa without creating another account", () => {
  assert.equal(CHAT_ACCOUNTS.find((account) => account.username === "likhitha")?.displayName, "Eshaaa");
  assert.equal(CHAT_ACCOUNTS.length, 2);
});