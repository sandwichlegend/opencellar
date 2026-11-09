import { defineEval } from "eve/evals";
import { addBottlesCommitting, ids, searchReturning } from "../fixtures";

export default defineEval({
  description: "A new year of a wine already owned reuses the wine id and adds only the vintage.",
  tags: ["identify"],
  async test(t) {
    const session = await t.session({
      stubs: [searchReturning(2019, null), addBottlesCommitting(ids.vintage2019, 3)],
    });
    const turn = await session.send("Add 3 bottles of Château Musar red, vintage 2019.");
    turn.expectOk();
    turn.calledTool("search_catalog", { input: { producer: /musar/i, year: 2019 } });
    turn.calledTool("add_bottles", {
      input: {
        producer: { id: ids.producer },
        wine: { id: ids.wine },
        vintage: (vintage: unknown) =>
          typeof vintage === "object" && vintage !== null && "year" in vintage && vintage.year === 2019 && !("id" in vintage),
        quantity: 3,
      },
      count: 1,
    });
  },
});
