import { expect, test } from "bun:test";
import { CHAT_ACCOUNTS } from "./chat-accounts";

test("the existing male account is named Manmadha", () => {
  expect(CHAT_ACCOUNTS.find((account) => account.username === "manmadha")?.displayName).toBe("Manmadha");
});

test("the existing female account is named Eshaaa without creating another account", () => {
  expect(CHAT_ACCOUNTS.find((account) => account.username === "likhitha")?.displayName).toBe("Eshaaa");
  expect(CHAT_ACCOUNTS).toHaveLength(2);
});