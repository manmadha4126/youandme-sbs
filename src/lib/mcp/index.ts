import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listMessagesTool from "./tools/list-messages";
import sendMessageTool from "./tools/send-message";
import whoamiTool from "./tools/whoami";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "youandme-mcp",
  title: "YouAndMe MCP",
  version: "0.1.0",
  instructions:
    "Tools for the YouAndMe private two-person chat. Use `whoami` to identify the signed-in user, `list_messages` to read recent chat messages, and `send_message` to post a new message as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [whoamiTool, listMessagesTool, sendMessageTool],
});
