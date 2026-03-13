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

  const characterId = env.SIM_CHARACTER ?? 'gungirl';
  const simNCompare = env.SIM_N_COMPARE ?? '400';
  const simSeed = env.SIM_SEED ?? '';

  const imitationDir = path.join(root, 'data', 'imitation');
  const ndjsonPath = env.IL_DATA_FILE
    ? path.resolve(root, env.IL_DATA_FILE)
    : findLatestNdjson(imitationDir);

  if (!ndjsonPath || !fs.existsSync(ndjsonPath)) {
    throw new Error(
      `Could not find NDJSON dataset. Generate one first with "npm run collect:bot-data" or "npm run bot:full".`
    );
  }

  console.log(`Using dataset for continued training: ${ndjsonPath}`);

  // Prefer the bot-training virtualenv's Python if it exists, otherwise fall back to "python".
  const botTrainingDir = path.join(root, 'bot-training');
  const venvPython =
    process.platform === 'win32'
      ? path.join(botTrainingDir, '.venv', 'Scripts', 'python.exe')
      : path.join(botTrainingDir, '.venv', 'bin', 'python');
  const pythonCmd = fs.existsSync(venvPython) ? venvPython : 'python';

  const weightsFile = env.IL_WEIGHTS_OUT ?? 'policy_best.pt';
  const weightsPath = path.join(botTrainingDir, weightsFile);

  // 1) Continue training from existing weights (if present).
  runStep(
    pythonCmd,
    [
      path.join(botTrainingDir, 'train.py'),
      '--data',
      ndjsonPath,
      '--epochs',
      env.IL_EPOCHS ?? '10',
      '--batch-size',
      env.IL_BATCH_SIZE ?? '64',
      '--out',
      weightsFile,
      '--init-weights',
      weightsPath,
      '--win-weight',
      env.IL_WIN_WEIGHT ?? '0.5',
      '--run-weight',
      env.IL_RUN_WEIGHT ?? '0.3',
    ],
    {}
  );

  // 2) Export weights to JSON for the engine.
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

  // 3) Run heuristic vs learned comparison.
  runStep('npx', ['vitest', 'run', 'src/engine/simulator/run-learned-vs-heuristic.spec.ts', '--reporter=verbose'], {
    env: {
      SIM_CHARACTER: characterId,
      SIM_N: simNCompare,
      SIM_SEED: simSeed,
      POLICY_JSON: path.join('bot-training', env.IL_MODEL_JSON ?? 'learned-policy-gungirl.json'),
    },
  });

  console.log('\n=== Continued training + evaluation completed successfully. ===\n');
}

main();

