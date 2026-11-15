// One effort unit corresponds to one metre on level ground. A metre of
// ascent adds six units. Descents add a quadratic braking cost based on
// grade (rise divided by horizontal run). These are scenario coefficients.
export const ASCENT_EFFORT = 6;
export const DESCENT_EFFORT = 8;

export function walkingEffort(runM: number, riseM: number): number {
  if (runM === 0) return 0;
  const downhillGrade = Math.max(0, -riseM / runM);
  return runM * (1 + DESCENT_EFFORT * downhillGrade ** 2) + ASCENT_EFFORT * Math.max(0, riseM);
}
