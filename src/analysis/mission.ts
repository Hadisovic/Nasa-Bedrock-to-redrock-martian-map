import type { MissionAssessment, MissionAssumptions, MissionEstimate, RoundTrip, RouteResult } from "../contracts/index.ts";

function estimate(trip: RoundTrip, a: MissionAssumptions): MissionEstimate {
  const outboundS = trip.outbound.horizontalDistanceM / a.walkingSpeedMps;
  const returnS = trip.return.horizontalDistanceM / a.walkingSpeedMps;
  const elapsedS = outboundS + returnS + a.scienceStopS;
  return { outboundS, returnS, elapsedS, returnMarginS: a.timeBudgetS - elapsedS - a.reserveS };
}

export function validAssumptions(a: MissionAssumptions): boolean {
  return Number.isFinite(a.walkingSpeedMps) && a.walkingSpeedMps > 0 &&
    [a.scienceStopS, a.timeBudgetS, a.reserveS].every((value) => Number.isFinite(value) && value >= 0);
}

/** Time estimate under the user's assumptions. It does not establish astronaut safety. */
export function assessMission(route: RouteResult, assumptions: MissionAssumptions): MissionAssessment {
  if (!validAssumptions(assumptions)) {
    return { status: "unavailable", reason: "invalid-assumptions", detail: "Walking speed must be above zero; stop time, budget and reserve must be zero or more." };
  }
  if (route.status !== "available") {
    return { status: "unavailable", reason: "route-unavailable", detail: route.detail };
  }
  return {
    status: "assessed",
    assumptions,
    shortest: estimate(route.shortest, assumptions),
    terrainWeighted: route.alternative.status === "distinct" ? estimate(route.alternative.terrainWeighted, assumptions) : undefined,
  };
}

export function formatDuration(seconds: number): string {
  const sign = seconds < 0 ? "−" : "";
  const total = Math.round(Math.abs(seconds) / 60);
  const h = Math.floor(total / 60), m = total % 60;
  return h ? `${sign}${h} h ${String(m).padStart(2, "0")} min` : `${sign}${m} min`;
}
