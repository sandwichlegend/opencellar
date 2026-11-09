import { defineEvalConfig } from "eve/evals";

export default defineEvalConfig({
  maxConcurrency: 3,
  timeoutMs: 180_000,
});
