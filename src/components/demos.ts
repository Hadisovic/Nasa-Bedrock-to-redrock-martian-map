import type { MissionAssumptions } from "../contracts/index.ts";

export interface MissionInputs {
  habitatId: string;
  destinationId: string;
  maxAbsSlopeDeg: number;
  slopePenaltyWeight: number;
  assumptions: MissionAssumptions;
}

export const DEFAULT_INPUTS: MissionInputs = {
  habitatId: "habitat-se",
  destinationId: "wildcat-ridge",
  maxAbsSlopeDeg: 15,
  slopePenaltyWeight: 4,
  assumptions: { walkingSpeedMps: 0.7, scienceStopS: 30 * 60, timeBudgetS: 90 * 60, reserveS: 20 * 60 },
};

export const DEMOS: readonly { id: string; label: string; description: string; inputs: MissionInputs }[] = [
  { id: "baseline", label: "1 · Baseline Marswalk", description: "Habitat A to Wildcat Ridge with a 30 min science stop.", inputs: DEFAULT_INPUTS },
  {
    id: "changed", label: "2 · One changed assumption",
    description: "Same route, but the suited crew walks at 0.3 m/s with sample gear and the stop grows to 60 min.",
    inputs: { ...DEFAULT_INPUTS, assumptions: { ...DEFAULT_INPUTS.assumptions, walkingSpeedMps: 0.3, scienceStopS: 60 * 60 } },
  },
  {
    id: "blocked", label: "3 · Failure case",
    description: "Habitat C with a strict 4° slope limit: the terrain leaves no connected path.",
    inputs: { ...DEFAULT_INPUTS, habitatId: "habitat-n", maxAbsSlopeDeg: 4 },
  },
];
