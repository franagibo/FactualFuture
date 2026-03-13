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
  const policyJsonName = env.IL_MODEL_JSON ?? (characterId === 'gungirl' ? 'learned-policy-gungirl.json' : `learned-policy-${characterId}.json`);
  const weightsFile = env.IL_WEIGHTS_OUT ?? (characterId === 'gungirl' ? 'policy_best.pt' : `policy_best_${characterId}.pt`);

  const imitationDir = path.join(root, 'data', 'imitation');

  // 1) Collect data (NDJSON) using the engine script.
  // Respect an existing NODE_OPTIONS (especially a user-provided --max-old-space-size).
  // Only add a default heap size when none is present.
  const hasHeapSetting =
    typeof env.NODE_OPTIONS === 'string' &&
    env.NODE_OPTIONS.includes('--max-old-space-size');
  const nodeOptions = hasHeapSetting
    ? env.NODE_OPTIONS
    : ((env.NODE_OPTIONS || '') + ' --max-old-space-size=8192');
  runStep('npx', ['vitest', 'run', 'src/engine/simulator/collect-imitation-data.spec.ts', '--reporter=verbose'], {
    env: {
      ...env,
      SIM_CHARACTER: characterId,
      SIM_N: simN,
      SIM_SEED: simSeed,
      IL_OUT_DIR: imitationDir,
      NODE_OPTIONS: (nodeOptions || '').trim(),
    },
  });

  const ndjsonPath = env.IL_DATA_FILE
    ? path.resolve(root, env.IL_DATA_FILE)
    : findLatestNdjson(imitationDir);

  if (!ndjsonPath || !fs.existsSync(ndjsonPath)) {
    throw new Error(`Could not find NDJSON dataset in ${imitationDir}.`);
  }

  console.log(`Using dataset: ${ndjsonPath}`);

  const weightsPath = path.join(botTrainingDir, weightsFile);

  // 2) Train the Python policy (preferring venv Python when available). Use full path so output is in bot-training/.
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
      weightsPath,
      '--win-weight',
      env.IL_WIN_WEIGHT ?? '0.5',
      '--run-weight',
      env.IL_RUN_WEIGHT ?? '0.3',
    ],
    {}
  );

  // 3) Export weights to JSON for the engine. Use full path so output is in bot-training/.
  runStep(
    pythonCmd,
    [
      path.join(botTrainingDir, 'export_weights.py'),
      '--data',
      ndjsonPath,
      '--weights',
      weightsPath,
      '--out',
      path.join(botTrainingDir, policyJsonName),
    ],
    {}
  );

  // 4) Run heuristic vs learned comparison.
  runStep('npx', ['vitest', 'run', 'src/engine/simulator/run-learned-vs-heuristic.spec.ts', '--reporter=verbose'], {
    env: {
      SIM_CHARACTER: characterId,
      SIM_N: env.SIM_N_COMPARE ?? simN,
      SIM_SEED: simSeed,
      POLICY_JSON: path.join('bot-training', policyJsonName),
    },
  });

  console.log('\n=== Offline imitation-learning pipeline completed successfully. ===\n');
}

main();

