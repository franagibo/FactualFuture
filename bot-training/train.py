import argparse
from pathlib import Path

import torch
from torch.utils.data import DataLoader, random_split
from tqdm import tqdm

from dataset import ImitationDataset
from model import PolicyMLP


def collate(batch):
    """
    Custom collate that pads the variable number of actions per state.

    Each item has:
      state:   [S]
      actions: [A_i, A_dim]   (A_i varies per sample)
      chosen:  scalar in [0, A_i)
      weight:  float (for outcome-weighted loss)

    We pad all actions to [max_A, A_dim] within the batch.
    The chosen index always refers to a real (unpadded) action.
    """
    states = torch.stack([b[0] for b in batch], dim=0)  # [B, S]

    action_tensors = [b[1] for b in batch]
    chosen = torch.tensor([b[2] for b in batch], dtype=torch.long)  # [B]
    weights = torch.tensor([b[3] for b in batch], dtype=torch.float32)  # [B]

    # Number of real actions per sample (before padding).
    counts = torch.tensor([a.shape[0] for a in action_tensors], dtype=torch.long)  # [B]

    max_actions = int(max(a.shape[0] for a in action_tensors))
    a_dim = int(action_tensors[0].shape[1])

    padded_actions = []
    for a in action_tensors:
        pad_len = max_actions - a.shape[0]
        if pad_len > 0:
            pad = torch.zeros(pad_len, a_dim, dtype=a.dtype)
            padded = torch.cat([a, pad], dim=0)
        else:
            padded = a
        padded_actions.append(padded)

    actions = torch.stack(padded_actions, dim=0)  # [B, max_A, A_dim]
    return states, actions, chosen, counts, weights


def main() -> None:
    parser = argparse.ArgumentParser(description="Train imitation-learning policy from NDJSON.")
    parser.add_argument(
        "--data",
        type=str,
        required=False,
        default="../data/imitation/imitation-gungirl-seed123456-N50.ndjson",
        help="Path to NDJSON dataset produced by collect-imitation-data script.",
    )
    parser.add_argument("--epochs", type=int, default=20)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--val-frac", type=float, default=0.1)
    parser.add_argument("--out", type=str, default="policy_best.pt")
    parser.add_argument(
        "--init-weights",
        type=str,
        default="",
        help="Optional path to an existing weights .pt file to continue training from.",
    )
    parser.add_argument(
        "--win-weight",
        type=float,
        default=0.5,
        help="Extra weight for samples from winning combats (sample weight = 1 + win_weight if combatWon else 1).",
    )
    args = parser.parse_args()

    dataset = ImitationDataset(args.data, win_weight=args.win_weight)

    val_size = int(len(dataset) * args.val_frac)
    train_size = len(dataset) - val_size
    train_ds, val_ds = random_split(dataset, [train_size, val_size])

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True, collate_fn=collate)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size * 2, shuffle=False, collate_fn=collate)

    state_dim = dataset.samples[0][0].shape[0]
    action_dim = dataset.samples[0][1].shape[1]

    print(f"Training PolicyMLP with state_dim={state_dim}, action_dim={action_dim}")
    model = PolicyMLP(state_dim, action_dim)
    if args.init_weights:
        init_path = Path(args.init_weights)
        if init_path.is_file():
            state_dict = torch.load(init_path, map_location="cpu")
            model.load_state_dict(state_dict)
            print(f"Loaded initial weights from {init_path}")
    optimizer = torch.optim.Adam(model.parameters(), lr=args.lr)
    criterion = torch.nn.CrossEntropyLoss(reduction="none")  # per-sample loss for outcome weighting

    best_val_acc = 0.0
    out_path = Path(args.out)

    for epoch in range(args.epochs):
        model.train()
        total_loss = 0.0
        total = 0
        correct = 0

        for states, actions, chosen, counts, weights in tqdm(train_loader, desc=f"Epoch {epoch} [train]"):
            optimizer.zero_grad()
            logits = model(states, actions)               # [B, A]
            # Mask out padded actions so they don't affect the loss.
            b, a = logits.shape
            device = logits.device
            idx = torch.arange(a, device=device).unsqueeze(0)  # [1, A]
            valid_mask = idx < counts.to(device).unsqueeze(1)  # [B, A] True where real
            logits = logits.masked_fill(~valid_mask, -1e9)

            per_sample_loss = criterion(logits, chosen)   # [B]
            weights = weights.to(device)
            loss = (per_sample_loss * weights).mean()
            loss.backward()
            optimizer.step()

            total_loss += loss.item() * states.size(0)
            total += states.size(0)
            preds = logits.argmax(dim=1)
            correct += (preds == chosen).sum().item()

        train_loss = total_loss / max(1, total)
        train_acc = correct / max(1, total)

        # Validation
        model.eval()
        val_total = 0
        val_correct = 0
        with torch.no_grad():
            for states, actions, chosen, counts, _ in val_loader:
                logits = model(states, actions)
                b, a = logits.shape
                device = logits.device
                idx = torch.arange(a, device=device).unsqueeze(0)
                valid_mask = idx < counts.to(device).unsqueeze(1)
                logits = logits.masked_fill(~valid_mask, -1e9)

                preds = logits.argmax(dim=1)
                val_total += states.size(0)
                val_correct += (preds == chosen).sum().item()

        val_acc = val_correct / max(1, val_total)
        print(f"Epoch {epoch}: train_loss={train_loss:.4f}, train_acc={train_acc:.3f}, val_acc={val_acc:.3f}")

        if val_acc >= best_val_acc:
            best_val_acc = val_acc
            torch.save(model.state_dict(), out_path)
            print(f"  Saved new best model to {out_path}")

    print(f"Training complete. Best val_acc={best_val_acc:.3f}, weights at {out_path}")


if __name__ == "__main__":
    main()

