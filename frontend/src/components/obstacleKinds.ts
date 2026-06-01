// Obstacle kinds shared between the picker component and App (kept out of the component file
// so fast-refresh only sees component exports there).

export const OBSTACLE_KINDS = ['minefield', 'roadblock', 'crater', 'barricade', 'checkpoint'] as const
export type ObstacleKind = (typeof OBSTACLE_KINDS)[number]
