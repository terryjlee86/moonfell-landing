export type GameplayMode = "scenario" | "travel" | "rest";

export type GameplayState = {
  mode: GameplayMode;
  debug: { scenarioSpawnedOnce: boolean };
};

let _gameplay: GameplayState = {
  mode: "scenario",
  debug: { scenarioSpawnedOnce: false },
};

export function getGameplay(): GameplayState { return _gameplay; }
export function setGameplay(next: Partial<GameplayState>) {
  _gameplay = { ..._gameplay, ...next, debug: { ..._gameplay.debug, ...(next.debug ?? {}) } };
}

