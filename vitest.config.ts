import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "convex",
          include: ["test/convex/**/*.test.ts"],
          environment: "edge-runtime",
          server: { deps: { inline: ["convex-test"] } },
        },
      },
      {
        test: {
          name: "unit",
          include: ["test/lib/**/*.test.ts", "test/scripts/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
