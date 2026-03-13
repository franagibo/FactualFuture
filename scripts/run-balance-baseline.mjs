#!/usr/bin/env node
/**
 * Run balance sim with fixed seed file and write baseline snapshot to data/balance-baseline.json.
 * Usage: node scripts/run-balance-baseline.mjs
 * Or: npm run balance:baseline
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

process.env.SIM_SEED_FILE = path.join(repoRoot, 'scripts', 'balance-seeds.json');
process.env.BALANCE_BASELINE_OUT = path.join(repoRoot, 'data', 'balance-baseline.json');

const child = spawn(
  'npx',
  ['vitest', 'run', 'src/engine/simulator/run-balance-sim.spec.ts', '--reporter=verbose'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, SIM_SEED_FILE: process.env.SIM_SEED_FILE, BALANCE_BASELINE_OUT: process.env.BALANCE_BASELINE_OUT },
  }
);
child.on('exit', (code) => process.exit(code ?? 0));
