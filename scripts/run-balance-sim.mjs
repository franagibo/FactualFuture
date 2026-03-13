/**
 * Balance simulation script. Runs N simulated runs with real game data and prints metrics.
 *
 * Preferred: use the Vitest-based script instead (no build step):
 *   npm run sim
 *
 * This Node script requires the engine to be built first:
 *   npm run build:engine
 *
 * Usage (from project root):
 *   node scripts/run-balance-sim.mjs [characterId] [N] [seedBase]
 *
 * Examples:
 *   node scripts/run-balance-sim.mjs              # gungirl, 100 runs, seed 0
 *   node scripts/run-balance-sim.mjs gungirl 50   # gungirl, 50 runs
 *   node scripts/run-balance-sim.mjs gungirl 200 1000  # 200 runs, seeds 1000..1199
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataDir = path.join(root, 'src', 'engine', 'data');
const distEngine = path.join(root, 'dist-engine');

function loadJson(file) {
  const filePath = path.join(dataDir, file);
  if (!fs.existsSync(filePath)) {
    console.error('Missing data file:', filePath);
    console.error('Run "npm run build:engine" and ensure src/engine/data/ exists.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

async function main() {
  if (!fs.existsSync(path.join(distEngine, 'simulator', 'runSimulator.js'))) {
    console.error('Engine not built. Run: npm run build:engine');
    process.exit(1);
  }

  const characterId = process.argv[2] ?? 'gungirl';
  const N = Math.max(1, parseInt(process.argv[3] ?? '100', 10));
  const seedBase = parseInt(process.argv[4] ?? '0', 10);

  const cardsData = loadJson('cards.json');
  const enemiesData = loadJson('enemies.json');
  const encountersData = loadJson('encounters.json');
  const charactersData = loadJson('characters.json');
  const mapConfigData = loadJson('mapConfig.json');
  let relicsData = [];
  let eventsData = [];
  try {
    relicsData = loadJson('relics.json');
  } catch (_) {}
  try {
    eventsData = loadJson('events.json');
  } catch (_) {}

  const { loadCards, loadEnemies, loadEncounters, loadCharacters, loadRelics, loadEvents } = await import(
    new URL('../dist-engine/loadData.js', import.meta.url).href
  );
  const { runSimulation } = await import(new URL('../dist-engine/simulator/runSimulator.js', import.meta.url).href);

  const cardsMap = loadCards(cardsData);
  const enemyDefs = loadEnemies(enemiesData);
  const encountersMap = loadEncounters(encountersData);
  const charactersMap = loadCharacters(Array.isArray(charactersData) ? charactersData : []);
  const relicDefs = loadRelics(Array.isArray(relicsData) ? relicsData : []);
  const eventPool = loadEvents(Array.isArray(eventsData) ? eventsData : []);

  const character = charactersMap.get(characterId);
  const rewardCardPool = character?.cardPoolIds?.length
    ? character.cardPoolIds.filter((id) => cardsMap.has(id))
    : Array.from(cardsMap.keys()).slice(0, 30);

  const mapConfig = {
    act1: mapConfigData.act1,
    act2: mapConfigData.act2,
    act3: mapConfigData.act3,
  };

  console.log(`Running ${N} simulations for "${characterId}" (seeds ${seedBase}..${seedBase + N - 1})...\n`);

  const start = Date.now();
  const { runs, winRate, avgFloorReached, avgHpAfterFirstCombat } = runSimulation(
    {
      characterId,
      charactersMap,
      mapConfig,
      cardsMap,
      enemyDefs,
      encountersMap,
      relicDefs: relicDefs.size ? relicDefs : undefined,
      eventPool,
      rewardCardPool,
    },
    N,
    seedBase
  );
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  const wins = runs.filter((r) => r.result === 'win').length;
  const losses = N - wins;
  const avgCombats = runs.reduce((s, r) => s + r.combats.length, 0) / N;
  const deathsByFloor = {};
  runs.filter((r) => r.result === 'lose').forEach((r) => {
    const f = r.floorReached ?? 0;
    deathsByFloor[f] = (deathsByFloor[f] ?? 0) + 1;
  });

  console.log('--- Results ---');
  console.log(`Win rate:        ${(winRate * 100).toFixed(1)}% (${wins} wins, ${losses} losses)`);
  console.log(`Avg floor:       ${avgFloorReached.toFixed(1)}`);
  console.log(`Avg HP after 1st combat: ${avgHpAfterFirstCombat.toFixed(1)}`);
  console.log(`Avg combats/run: ${avgCombats.toFixed(1)}`);
  if (Object.keys(deathsByFloor).length > 0) {
    console.log('Deaths by floor:', JSON.stringify(deathsByFloor));
  }
  console.log(`\nCompleted in ${elapsed}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
