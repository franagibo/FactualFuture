import argparse
import json
from pathlib import Path

import torch

from dataset import ImitationDataset
from model import PolicyMLP


def main() -> None:
    parser = argparse.ArgumentParser(description="Export trained policy weights to engine JSON format.")
    parser.add_argument(
        "--data",
        type=str,
        required=False,
        default="../data/imitation/imitation-gungirl-seed123456-N50.ndjson",
        help="Same NDJSON used for training (for inferring input dims).",
    )
    parser.add_argument(
        "--weights",
        type=str,
        required=False,
        default="policy_best.pt",
        help="Path to trained PyTorch weights (from train.py).",
    )
    parser.add_argument(
        "--out",
        type=str,
        required=False,
        default="learned-policy-gungirl.json",
        help="Output JSON file consumable by the engine.",
    )
    args = parser.parse_args()

    ds = ImitationDataset(args.data)
    state_dim = ds.samples[0][0].shape[0]
    action_dim = ds.samples[0][1].shape[1]

    model = PolicyMLP(state_dim, action_dim)
    state_dict = torch.load(args.weights, map_location="cpu")
    model.load_state_dict(state_dict)
    model.eval()

    weights = {
        "W1": model.fc1.weight.detach().cpu().tolist(),
        "b1": model.fc1.bias.detach().cpu().tolist(),
        "W2": model.fc2.weight.detach().cpu().tolist(),
        "b2": model.fc2.bias.detach().cpu().tolist(),
        "W3": model.fc3.weight.detach().cpu().tolist(),
        "b3": model.fc3.bias.detach().cpu().tolist(),
    }

    out_obj = {"weights": weights}
    out_path = Path(args.out)
    out_path.write_text(json.dumps(out_obj), encoding="utf-8")

    print(f"Exported learned policy to {out_path.resolve()}")


if __name__ == "__main__":
    main()

