export const GAME_CONFIGS = Object.freeze({
  cash5: Object.freeze({
    id: 'cash5',
    displayName: 'Cash 5',
    officialGameId: 8,
    minimumNumber: 1,
    maximumNumber: 43,
    ballCount: 5,
    drawLabel: 'Evening drawing',
    drawTime: '6:59 p.m.',
    storageKey: 'cash5'
  }),
  treasureHunt: Object.freeze({
    id: 'treasureHunt',
    displayName: 'Treasure Hunt',
    officialGameId: 7,
    minimumNumber: 1,
    maximumNumber: 30,
    ballCount: 5,
    drawLabel: 'Day drawing',
    drawTime: '1:35 p.m.',
    storageKey: 'treasureHunt'
  })
});

export const DEFAULT_GAME_ID = 'cash5';
export const GAME_IDS = Object.freeze(Object.keys(GAME_CONFIGS));

export function getGameConfig(value = DEFAULT_GAME_ID) {
  if (value && typeof value === 'object' && GAME_CONFIGS[value.id]) return GAME_CONFIGS[value.id];
  const normalized = String(value || '').replace(/[\s_-]/g, '').toLowerCase();
  if (normalized === 'treasurehunt' || normalized === 'th') return GAME_CONFIGS.treasureHunt;
  return GAME_CONFIGS.cash5;
}

export function isSupportedGameId(value) {
  const normalized = String(value || '').replace(/[\s_-]/g, '').toLowerCase();
  return normalized === 'cash5' || normalized === 'treasurehunt';
}

export function numberRange(game) {
  const config = getGameConfig(game);
  return Array.from(
    { length: config.maximumNumber - config.minimumNumber + 1 },
    (_, index) => config.minimumNumber + index
  );
}
