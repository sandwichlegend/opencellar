import { defineEval } from "eve/evals";
import { addBottlesCommitting, ids, searchReturning } from "../fixtures";

export default defineEval({
  description: "A vintage already in the catalog is reused by id, not recreated.",
  tags: ["identify"],
  async test(t) {
    const session = await t.session({
      stubs: [searchReturning(2016, ids.vintage2016), addBottlesCommitting(ids.vintage2016, 2)],
    });
    const turn = await session.send("I picked up two bottles of 2016 Château Musar, the red. Add them to the cellar.");
    turn.expectOk();
    turn.toolOrder(["search_catalog", "add_bottles"]);
    turn.calledTool("search_catalog", { input: { producer: /musar/i, year: 2016 } });
    turn.calledTool("add_bottles", {
      input: { vintage: { id: ids.vintage2016 }, quantity: 2, ingestKey: /.+/ },
      count: 1,
    });
  },
});
