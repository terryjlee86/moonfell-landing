import { getGameplay, setGameplay } from "../../state/gameplay";
import { getContext, setNearby } from "../../state/context";
import { CREATURE_SPECIES } from "../../catalog/creature_species"; // Import the creature database

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

  // Fetch the mirefold from the creature database
  const mirefold = CREATURE_SPECIES.find(creature => creature.id === "mirefold");

  if (mirefold) {
    setNearby([
      {
        id: "mirefold_1",
        name: mirefold.name,
        kind: mirefold.id,
        attitude: "hostile",
        distanceM: 10,
        cover: "none",
        status: [],
        // You can add more attributes here if needed
      },
    ]);
  }

  setGameplay({ debug: { scenarioSpawnedOnce: true } });
}

