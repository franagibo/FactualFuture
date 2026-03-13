import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function runStep(cmd, args, options = {}) {
  const pretty = `${cmd} ${args.join(' ')}`;
  console.log(`\n=== Running: ${pretty} ===\n`);
  const res = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, ...options.env },
  });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${pretty}`);
  }
}

function findLatestNdjson(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ndjson'))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(dir, f)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length ? path.join(dir, files[0].name) : null;
}

function main() {
  const root = process.cwd();
  const env = process.env;

  // Prefer the bot-training virtualenv's Python if it exists, otherwise fall back to "python".
  const botTrainingDir = path.join(root, 'bot-training');
  const venvPython =
    process.platform === 'win32'
      ? path.join(botTrainingDir, '.venv', 'Scripts', 'python.exe')
      : path.join(botTrainingDir, '.venv', 'bin', 'python');
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';

  const characterId = env.SIM_CHARACTER ?? 'gungirl';
  const simN = env.SIM_N ?? '200';
  const simSeed = env.SIM_SEED ?? ''; // let scripts default when empty

  const imitationDir = path.join(root, 'data', 'imitation');

  // 1) Collect data (NDJSON) using the engine script.
  runStep('npx', ['vitest', 'run', 'src/engine/simulator/collect-imitation-data.spec.ts', '--reporter=verbose'], {
    env: {
      SIM_CHARACTER: characterId,
      SIM_N: simN,
      SIM_SEED: simSeed,
      IL_OUT_DIR: imitationDir,
    },
  });

  const ndjsonPath = env.IL_DATA_FILE
    ? path.resolve(root, env.IL_DATA_FILE)
    : findLatestNdjson(imitationDir);

  if (!ndjsonPath || !fs.existsSync(ndjsonPath)) {
    throw new Error(`Could not find NDJSON dataset in ${imitationDir}.`);
  }

  console.log(`Using dataset: ${ndjsonPath}`);

  // 2) Train the Python policy (preferring venv Python when available).
  runStep(
    pythonCmd,
    [
      path.join(botTrainingDir, 'train.py'),
      '--data',
      ndjsonPath,
      '--epochs',
      env.IL_EPOCHS ?? '30',
      '--batch-size',
      env.IL_BATCH_SIZE ?? '64',
      '--out',
      env.IL_WEIGHTS_OUT ?? 'policy_best.pt',
      '--win-weight',
      env.IL_WIN_WEIGHT ?? '0.5',
    ],
    {}
  );

  const weightsPath = path.join(botTrainingDir, env.IL_WEIGHTS_OUT ?? 'policy_best.pt');

  // 3) Export weights to JSON for the engine.
  runStep(
    pythonCmd,
    [
      path.join(botTrainingDir, 'export_weights.py'),
      '--data',
      ndjsonPath,
      '--weights',
      weightsPath,
      '--out',
      env.IL_MODEL_JSON ?? 'learned-policy-gungirl.json',
    ],
    {}
  );

  // 4) Run heuristic vs learned comparison.
  runStep('npx', ['vitest', 'run', 'src/engine/simulator/run-learned-vs-heuristic.spec.ts', '--reporter=verbose'], {
    env: {
      SIM_CHARACTER: characterId,
      SIM_N: env.SIM_N_COMPARE ?? simN,
      SIM_SEED: simSeed,
      POLICY_JSON: path.join('bot-training', env.IL_MODEL_JSON ?? 'learned-policy-gungirl.json'),
    },
  });

  console.log('\n=== Offline imitation-learning pipeline completed successfully. ===\n');
}

main();

