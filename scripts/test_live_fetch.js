/** Manual smoke test for PA 5 Studio's two official live sources. */

import { fetchGameDraws, fetchGameJackpot } from '../js/liveFetcher.js';
import { GAME_IDS, getGameConfig } from '../js/gameConfig.js';

async function run() {
  for (const gameId of GAME_IDS) {
    const config = getGameConfig(gameId);
    const [draws, jackpot] = await Promise.all([
      fetchGameDraws(config),
      fetchGameJackpot(config)
    ]);
    console.log(`${config.displayName}: ${draws.length} validated draws; next jackpot ${jackpot.display}.`);
  }
}

run().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
