import torch
import torch.nn as nn
import torch.nn.functional as F


class PolicyMLP(nn.Module):
    """
    Simple MLP that scores each action given a shared state representation.

    Input:
      state:   [B, S]
      actions: [B, A, A_dim]

    Output:
      scores:  [B, A]  (one scalar per action)
    """

    def __init__(self, state_dim: int, action_dim: int, hidden1: int = 256, hidden2: int = 128):
        super().__init__()
        input_dim = state_dim + action_dim

        self.fc1 = nn.Linear(input_dim, hidden1)
        self.fc2 = nn.Linear(hidden1, hidden2)
        self.fc3 = nn.Linear(hidden2, 1)

    def forward(self, state: torch.Tensor, actions: torch.Tensor) -> torch.Tensor:
        """
        state:   [B, S]
        actions: [B, A, A_dim]
        returns: [B, A] scores
        """
        b, a, _ = actions.shape
        state_expanded = state.unsqueeze(1).expand(b, a, state.shape[1])  # [B, A, S]
        x = torch.cat([state_expanded, actions], dim=-1)                  # [B, A, S + A_dim]
        x = x.view(b * a, -1)                                             # [B*A, input_dim]

        x = F.relu(self.fc1(x))
        x = F.relu(self.fc2(x))
        x = self.fc3(x)                                                   # [B*A, 1]
        x = x.view(b, a)
        return x

