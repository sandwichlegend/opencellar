import { describe, expect, it } from "vitest";
import { transition } from "../../convex/lib/bottleState";
import { decideDrinkWindow } from "../../convex/lib/domain";

describe("bottle transitions", () => {
  it("lets a cellar bottle leave once", () => {
    const consumed = transition({ status: "cellar" }, { type: "consume", at: "2026-01-01" });
    expect(consumed).toEqual({ ok: true, state: { status: "consumed", at: "2026-01-01" } });
    if (!consumed.ok) return;
    expect(transition(consumed.state, { type: "gift", at: "2026-02-01" }).ok).toBe(false);
    expect(transition(consumed.state, { type: "move" }).ok).toBe(false);
  });
});

describe("drink window authority", () => {
  it("never lets an agent estimate replace a user window", () => {
    expect(decideDrinkWindow({ from: 2020, source: "user" }, { to: 2030, source: "agent" })).toEqual({
      kind: "skip",
      reason: "user-set",
    });
  });

  it("lets the user replace anything and the agent fill gaps", () => {
    expect(decideDrinkWindow({ from: 2020, source: "agent" }, { from: 2022, source: "user" }).kind).toBe("apply");
    expect(decideDrinkWindow(undefined, { from: 2022, source: "agent" }).kind).toBe("apply");
  });
});
