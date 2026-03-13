import json
from pathlib import Path
from typing import List, Tuple

import torch
from torch.utils.data import Dataset


class ImitationDataset(Dataset):
    """
    Minimal loader for the NDJSON produced by the engine's collect-imitation-data script.

    Each line has:
      {
        "state": [float...],        # shape [S]
        "actions": [[float...]],    # shape [A, A_dim]
        "chosenIndex": int,         # in [0, A)
        "combatWon": bool (optional)  # if present, used to weight samples (winning combats upweighted)
      }
    Returns (state, actions, chosen, weight). weight is higher for combatWon=True when win_weight > 0.
    """

    def __init__(self, path: str, win_weight: float = 0.5):
        """
        win_weight: extra weight for samples from winning combats. Sample weight = 1.0 + (win_weight if combatWon else 0).
        Default 0.5 -> winning decisions get weight 1.5, losing get 1.0.
        """
        self.samples: List[Tuple[torch.Tensor, torch.Tensor, int, float]] = []
        self.win_weight = win_weight

        p = Path(path)
        if not p.is_file():
            raise FileNotFoundError(f"NDJSON file not found: {p}")

        with p.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                obj = json.loads(line)
                state = torch.tensor(obj["state"], dtype=torch.float32)
                actions = torch.tensor(obj["actions"], dtype=torch.float32)
                chosen = int(obj["chosenIndex"])
                combat_won = obj.get("combatWon", True)  # backward compat: treat missing as win
                weight = 1.0 + (win_weight if combat_won else 0.0)
                self.samples.append((state, actions, chosen, weight))

        if not self.samples:
            raise RuntimeError(f"No samples found in {p}")

        s_dim = self.samples[0][0].shape[0]
        a_dim = self.samples[0][1].shape[1]
        n_win = sum(1 for s in self.samples if s[3] > 1.0)
        print(f"Loaded {len(self.samples)} samples from {p}")
        print(f"  state_dim = {s_dim}, action_dim = {a_dim}")
        print(f"  samples from winning combats (weighted up): {n_win}")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        return self.samples[idx]

