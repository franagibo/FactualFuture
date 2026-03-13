## Offline bot imitation learning

This project includes a lightweight offline imitation-learning pipeline for the combat bot.

### 1. Collect data

- **Script**: `npm run collect:bot-data`
- **Environment variables**:
  - `SIM_CHARACTER` (optional, default `gungirl`)
  - `SIM_N` (optional, default `50`) – number of full runs to simulate
  - `SIM_SEED` (optional, default `123456`) – base seed for the runs
  - `IL_OUT_DIR` (optional) – output directory for dataset files

- **Recommended scale for better learned bots**: Use **3,000–5,000 runs** (e.g. `SIM_N=5000`) for a single “production” dataset. More runs yield more diverse states and more samples from winning runs, which improves imitation quality.

Running the script will:

- Load the real engine data from `src/engine/data`.
- Run the standard heuristic bot (with one-turn lookahead) through many combats.
- At each combat decision, encode:
  - State features (player, enemies, hand, archetype context).
  - Per-action features for all legal actions (play card X on target Y, or end turn).
  - The index of the action selected by the teacher policy.
- Write one JSON object per line (NDJSON) to:
  - `data/imitation/imitation-<characterId>-seed<seedBase>-N<N>.ndjson` (by default).

Each line has the shape:

```json
{
  "state": number[],
  "actions": number[][],
  "chosenIndex": number
}
```

You can load this NDJSON file from Python, JS, or any other tooling to train a supervised policy model.

### 2. Train a model (external)

Training is intentionally kept outside the engine repo. A typical workflow:

- Create a separate `bot-training/` project (e.g. in Python).
- Load NDJSON samples and build a dataset where each example is:
  - Input: `[stateFeatures || actionFeatures]` for each legal action.
  - Target: index of the teacher-chosen action.
- Train an MLP that outputs a scalar score for each (state, action) pair and optimizes cross-entropy over the chosen index.
- Export the trained weights into a JSON file matching the `LearnedPolicyWeights` shape:

```ts
interface LearnedPolicyWeights {
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
  W3: number[][];
  b3: number[];
}
```

### 3. Plug the model back into the simulator

At runtime, you have two options:

- **Programmatic usage**:
  - In Node, load your JSON weights and call:
    - `setLearnedPolicy({ weights: yourWeights })` from `src/engine/simulator/learnedPolicy`.
  - Configure `SimulatorOptions` with `useLearnedPolicyBot: true` to have runs use the learned policy (with automatic fallback to the heuristic bot if the model is missing).

- **Custom bot**:
  - You can also supply your own bot function via `SimulatorOptions.bot` that internally calls `pickActionLearned` or your own wrapper.

The simulator still supports:

- Baseline heuristic bot (default).
- Lookahead-enhanced teacher policy.
- Learned imitation policy via the new learned-policy integration.

