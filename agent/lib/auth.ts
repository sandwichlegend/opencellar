import { timingSafeEqual } from "node:crypto";
import { type AuthFn, extractBearerToken, withAuthChallenges } from "eve/channels/auth";

const TOKEN_ENV = "OPENCELLAR_MCP_TOKEN";

function matches(candidate: string, expected: string): boolean {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function ownerToken(): AuthFn<Request> {
  return withAuthChallenges(
    (request) => {
      const expected = process.env[TOKEN_ENV];
      const token = extractBearerToken(request.headers.get("authorization"));
      if (!expected || !token || !matches(token, expected)) return null;
      return { authenticator: "opencellar-token", principalId: "cellar-owner", principalType: "user", attributes: {} };
    },
    [{ scheme: "Bearer" }],
  );
}
