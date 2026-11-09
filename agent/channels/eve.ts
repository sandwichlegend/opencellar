import { localDev } from "eve/channels/auth";
import { eveChannel } from "eve/channels/eve";
import { ownerToken } from "../lib/auth";

const owner = ownerToken();
const developer = localDev();

export default eveChannel({
  auth: [
    owner,
    async (request) => {
      const caller = await developer(request);
      return caller ? { ...caller, allowToolStubs: true } : null;
    },
  ],
});
