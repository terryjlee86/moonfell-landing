import { getGameplay } from "../state/gameplay";
import { runScenarioEncounterCycle } from "./managers/scenario_manager";

export async function runEncounterCycle(): Promise<void> {
  const { mode } = getGameplay();
  switch (mode) {
    case "scenario":
      await runScenarioEncounterCycle();
      break;
    // case "travel":
    //   await runTravelEncounterCycle();
    //   break;
    // case "rest":
    //   await runRestEncounterCycle();
    //   break;
    default:
      break;
  }
}

