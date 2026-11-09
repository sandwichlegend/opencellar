export type BottleState =
  | { status: "cellar" }
  | { status: "consumed"; at: string }
  | { status: "gifted"; at: string }
  | { status: "lost"; at: string };

export type BottleStatus = BottleState["status"];

export type BottleEvent =
  | { type: "consume"; at: string }
  | { type: "gift"; at: string }
  | { type: "lose"; at: string }
  | { type: "move" };

export type Transition = { ok: true; state: BottleState } | { ok: false; error: string };

const LEAVES_CELLAR: Record<Exclude<BottleEvent["type"], "move">, Exclude<BottleStatus, "cellar">> = {
  consume: "consumed",
  gift: "gifted",
  lose: "lost",
};

export function transition(state: BottleState, event: BottleEvent): Transition {
  if (state.status !== "cellar") {
    return { ok: false, error: `bottle is already ${state.status} (${state.at})` };
  }
  if (event.type === "move") return { ok: true, state };
  return { ok: true, state: { status: LEAVES_CELLAR[event.type], at: event.at } };
}
