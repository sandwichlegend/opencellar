import { localDev } from "eve/channels/auth";
import { mcpChannel } from "eve/channels/mcp";
import { ownerToken } from "../lib/auth";

export default mcpChannel({
  auth: [ownerToken(), localDev()],
  tools: true,
  skills: true,
});
