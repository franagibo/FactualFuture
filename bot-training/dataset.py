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
        "chosenIndex": int          # in [0, A)
      }
    """

    def __init__(self, path: str):
        self.samples: List[Tuple[torch.Tensor, torch.Tensor, int]] = []

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
                self.samples.append((state, actions, chosen))

        if not self.samples:
            raise RuntimeError(f"No samples found in {p}")

        s_dim = self.samples[0][0].shape[0]
        a_dim = self.samples[0][1].shape[1]
        print(f"Loaded {len(self.samples)} samples from {p}")
        print(f"  state_dim = {s_dim}")
        print(f"  action_dim = {a_dim}")

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, idx: int):
        return self.samples[idx]

