import { getGameplay, setGameplay } from "../../state/gameplay";
import { getContext, setNearby } from "../../state/context";

/**
 * DEBUG ONLY (to be replaced by real encounter pipeline):
 * - On first player message while in scenario mode, if there are no creatures,
 *   spawn a single Mirefold at 10m (enemy) and mark spawnedOnce.
 */
export async function runScenarioEncounterCycle(): Promise<void> {
  const gp = getGameplay();
  if (gp.debug.scenarioSpawnedOnce) return;

  const ctx = getContext();
  const hasCreatures = Array.isArray(ctx.nearby) && ctx.nearby.length > 0;
  if (hasCreatures) {
    setGameplay({ debug: { scenarioSpawnedOnce: true } });
    return;
  }

  setNearby([
    {
      id: "mirefold_1",
      name: "Mirefold",
      kind: "mirefold",
      attitude: "enemy",
      distanceM: 10,
      cover: "none",
      status: [],
    },
  ]);

  setGameplay({ debug: { scenarioSpawnedOnce: true } });
}

