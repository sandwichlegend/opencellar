import { describe, expect, it, vi } from "vitest";
import { api } from "../../convex/_generated/api";
import { apiKey, expectCode, setup } from "./harness";

describe("api key guard", () => {
  it("accepts the configured key", async () => {
    const t = setup();
    await expect(t.query(api.locations.list, { apiKey })).resolves.toEqual([]);
  });

  it("rejects a wrong key", async () => {
    const t = setup();
    await expectCode(t.query(api.locations.list, { apiKey: "nope" }), "unauthorized");
    await expectCode(
      t.mutation(api.locations.create, { apiKey: `${apiKey}x`, name: "Rack", kind: "rack" }),
      "unauthorized",
    );
  });

  it("rejects a missing key argument", async () => {
    const t = setup();
    await expect(t.query(api.locations.list, {} as { apiKey: string })).rejects.toThrow(/apiKey/);
  });

  it("rejects every key when the deployment has no key configured", async () => {
    const t = setup();
    vi.stubEnv("OPENCELLAR_API_KEY", "");
    await expectCode(t.query(api.locations.list, { apiKey: "" }), "unauthorized");
    await expectCode(t.action(api.imports.cellarTracker, { apiKey: "", csv: "" }), "unauthorized");
  });
});
