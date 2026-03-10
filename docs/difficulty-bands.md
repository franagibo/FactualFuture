# Difficulty Bands

This document describes the intended difficulty of encounter types. Use it for balance passes and tuning.

## Bands

| Band | Description | Encounter IDs (examples) |
|------|-------------|--------------------------|
| **Easy / intro** | Solo, low total HP and damage. Good for first fights. | `first_contact`, `tutorial`, `solo_scout`, `solo_drone`, `solo_crawler`, `solo_shield` |
| **Standard** | Two medium enemies or a small swarm. | `double_drones`, `swarm` |
| **Hard / elite** | One big + adds, or two big. Higher total HP and damage per round. | `leader_and_adds`, `dual_heavy`, `solo_alpha`, `alpha_and_probes` |
| **Boss** | Single high-HP boss. | `boss_act1` (Hive Guardian) |

## Reference

- **Encounters:** `src/engine/data/encounters.json`
- **Enemy definitions:** `src/engine/data/enemies.json`
- **Act pools:** `src/engine/data/mapConfig.json` — `encounterPool` per act, `bossEncounter` per act.

## Balance notes

- Solo encounters: one medium enemy (e.g. 28–44 HP). Easy to read and counter.
- Dual / swarm: total HP and damage scale; avoid making standard fights feel like elites.
- Leader + adds and dual heavy: tune so they are winnable with starter deck but require planning (block, focus fire).
- Boss: single target, higher block and damage; act 1 boss is the main gate.

Optional: use a separate `eliteEncounterPool` in map config for elite nodes so they always pull from the hard band.
