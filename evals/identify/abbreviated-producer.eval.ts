import { defineEval } from "eve/evals";
import { addBottlesCommitting, ids, searchReturning } from "../fixtures";

export default defineEval({
  description: "An abbreviated label producer resolves to the existing producer instead of creating a new one.",
  tags: ["identify"],
  async test(t) {
    const session = await t.session({
      stubs: [searchReturning(2016, ids.vintage2016), addBottlesCommitting(ids.vintage2016, 1)],
    });
    const turn = await session.send('The label says "Ch. Musar 2016", red. Add one bottle.');
    turn.expectOk();
    turn.calledTool("search_catalog", { input: { producer: /musar/i } });
    turn.calledTool("add_bottles", {
      input: { producer: { id: ids.producer }, vintage: { id: ids.vintage2016 }, quantity: 1 },
      count: 1,
    });
    t.judge("The reply confirms one bottle of Château Musar 2016 was added and does not claim a new producer was created.");
  },
});
