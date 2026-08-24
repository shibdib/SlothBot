---
apply: always
---

# MyScreepsBot Context

**Base Organization:** Inspired by SlothBot[](https://github.com/shibdib/SlothBot)  
**Default branch in reference repo:** `dev`  
**Code location:** `default/` folder contains the runnable bot code

## Overview & Strategic Goals

**Primary objectives (in priority order):**

1. Reach **RCL 8** in rooms as quickly and safely as possible.
2. Maintain **strong, reliable defenses** (static + active).
3. Keep a **stable and resilient energy economy**.
4. Achieve **excellent CPU efficiency** and bucket management.
5. Field **effective duo and quad combat units** for both offense and defense.

The bot should be mostly autonomous while supporting optional flag-based guidance. It favors efficient small-unit
tactics (especially duos and quads) over large zerg-style armies.

## How to Use This Document with AI

When helping with this codebase:

- **CPU impact is the top priority.** Evaluate cost of every suggestion, especially in combat and hot paths.
- **Prefer duo and quad compositions** for combat tasks unless the situation clearly requires larger forces.
- Reference existing patterns from the `roles/`, `modules/`, `operations/`, and `prototypes/` folders before inventing
  new systems.
- When multiple approaches are valid, recommend the one that best follows the priority order above.
- Be explicit about memory usage, squad coordination, and traffic management where relevant.
- Proactively suggest caching and PathFinder improvements.
- Limit use of the 2MB memory as it costs CPU
- **Default to the smallest change that fixes the stated problem.** Do not refactor, restructure, or "improve
  architecture" beyond the request unless the user asks or the current code is clearly blocking the fix.
- **Extend before you extract.** Prefer patching the existing role/module/prototype flow over creating new files, state
  machines, colony-level passes, or helper layers — especially for localized behavior (movement, towing, spawning
  tweaks).
- **Working simple code beats elegant complex code.** A direct 20–40 line solution in the file that already runs the
  behavior is usually better than spreading the same logic across several modules with caches, assignment passes, and
  timeout state — unless reuse or CPU clearly demands it.
- **Add complexity only with a concrete payoff:** less CPU, fewer edge-case failures, or real reuse in 2+ call sites.
  "Might be cleaner someday" is not enough.
- **Bug fixes are patches, not redesigns.** When something regresses, trace and fix the broken path first; resist
  rebuilding the subsystem unless the user wants a rewrite.

## Directory Structure

The bot follows the SlothBot layout:
default/ ├── main.js # Primary entry point ├── main.colony.js # Colony management (includes traffic management)
├── main.world.js # World-level operations ├── configs/ # Configuration files (including config.default.js)
├── roles/ # Individual creep role logic (many combat + economy roles)
├── modules/ # Shared modular functionality ├── operations/ # Higher-level operational logic ├── prototypes/ # Prototype
extensions └── misc/ # Miscellaneous utilities

**Key observations from SlothBot structure:**

- Heavy use of dedicated role files in `roles/`
- Separation of colony-level and world-level logic (`main.colony.js` / `main.world.js`)
- Existing combat roles include `role.siegeDuo.js`, `role.longbow.js`, `role.longbowSquad.js`, `role.attacker.js`,
  `role.defender.js`, etc.
- Quad combat code was noted as in-progress work in the original project.

## Architecture Overview

Hybrid **role + manager/operations** architecture:

- Creeps are primarily **role-driven** via `creep.memory.role`.
- Higher-level logic lives in `main.colony.js`, `main.world.js`, `operations/`, and `modules/`.
- `prototypes/` is used for extending built-in objects.
- Duo and quad squads have dedicated role support (`role.siegeDuo.js` and squad-style roles exist in the reference).
- Traffic management and sorted creep operations have been added to colony logic.

## Prioritization Framework

When designing or modifying features, evaluate in this order:

1. **CPU cost & bucket safety**
2. **Room / colony defense & survivability**
3. **Energy economy stability**
4. **RCL 8 progression speed**
5. **Code clarity and long-term maintainability**

Simplicity and maintainability matter, but they are **not** a license to reorganize working code. Favor readable, local
solutions; introduce new layers only when the problem is genuinely hard to reason about in place or when the user
requests a structural change.

## Key Systems

### Economy & Harvesting

Stable source mining and hauling with good support for both local and remote operations. Focus on reliable energy flow
to spawns, towers, storage, and upgraders.

### RCL Progression

Prioritize upgrading once basic defense and economy are functional. Avoid over-building early structures.

### Spawning & Creep Management

Dynamic spawning driven by colony needs. Role-specific body compositions.

### Defense

Combination of tower focus, rampart planning, and active defensive creeps (`role.defender.js` style). Proper threat
response and safe mode usage.

### Combat (Duo & Quad)

Duo and quad units are preferred combat formations.

**Desired behavior:**

- Coordinated movement and formation logic
- Smart healing priority within squads
- Clear target selection and focus fire
- Ability to engage, kite, or disengage intelligently
- Shared squad memory or leader-based coordination
- CPU-efficient pathing (leverage existing traffic management patterns where possible)
- Support for both offensive and defensive squad usage

Note: The reference repo already contains `role.siegeDuo.js` and squad-style roles. Quad work was listed as ongoing.

### CPU Optimization

Aggressive caching, traffic management (as seen in recent `main.colony.js` updates), and bucket-aware behavior. Minimize
expensive operations in frequently called code.

## Screeps Constraints & Gotchas

- Respect **CPU bucket** at all times — scale behavior accordingly.
- Keep **Memory** lean due to size limits.
- Prefer `PathFinder` + caching over repeated `moveTo()` in performance-sensitive areas.
- Code must handle creeps and structures dying at any moment.
- Limited globals in the Screeps sandbox.
- Room visuals have CPU cost — use intentionally.

## Coding Conventions

- **Roles**: Clear `role` in `creep.memory`. Dedicated files in `roles/`.
- **Managers / Operations**: Higher-level coordination lives in `operations/`, `modules/`, `main.colony.js`, and
  `main.world.js`.
- **Naming**: Descriptive and consistent with existing roles (e.g. `role.hauler.js`, `role.siegeDuo.js`).
- **Performance**: Cache aggressively. Leverage and extend existing traffic management patterns.
- **Memory**: Follow established patterns. Document new keys.
- **Combat squads**: Use shared memory or flags for coordination between members.

## Memory Schema (High-Level)

- `Memory.rooms[roomName]` — room state, sources, defense status, threats
- `creep.memory` — role, target, squad info, working state, traffic data
- Squad/memory coordination for duos and quads
- Global configuration via `configs/`

(Expand with exact keys as the implementation is explored.)

## Build / Deployment Notes

- Code in the `default/` folder is what gets uploaded to Screeps.
- Original project uses **Grunt** (`Gruntfile.js`) for automated uploads (recommended workflow).
- Configuration is handled via `config.default.js` (copy and customize).
- Local development uses Docker + Steamless client setup.

## Current Implementation Status

**To be filled as we map the current codebase:**

| System                   | Status | Notes                                                                                 |
|--------------------------|--------|---------------------------------------------------------------------------------------|
| Core roles               | TBD    | Many roles exist in reference (harvester, upgrader, hauler, defender, siegeDuo, etc.) |
| Colony management        | TBD    | `main.colony.js` with traffic management                                              |
| World operations         | TBD    | `main.world.js`                                                                       |
| Economy / Harvesting     | TBD    |                                                                                       |
| Defense systems          | TBD    |                                                                                       |
| Duo combat               | TBD    | Reference has `role.siegeDuo.js`                                                      |
| Quad combat              | TBD    | Listed as in-progress in original project                                             |
| CPU / Traffic management | TBD    | Recent improvements in colony logic                                                   |
| Prototypes & Modules     | TBD    | `prototypes/` and `modules/` folders exist                                            |

## Development Notes

- Keep the bot efficient and maintainable while pushing toward RCL 8 and strong combat capability.
- When adding or modifying features, update this document so future assistance remains consistent.
- Prefer extending existing patterns (roles, traffic management, squad roles) over creating entirely new systems when
  possible.
- When proposing a change, briefly state **why** added complexity is worth it (CPU, correctness, reuse). If it isn't,
  keep the diff small.

## Changelog

- **2026-07-10** — Version 4 (Completed): Incorporated actual SlothBot folder structure (`default/`, `roles/`,
  `operations/`, `prototypes/`, `main.colony.js`, `main.world.js`, etc.), existing combat roles (including siegeDuo),
  and aligned all sections with user goals.
- **2026-07-14** — Added simplicity / change-discipline guidance: smallest fix first, extend before extract, complexity
  needs concrete payoff.

---

**Last updated:** 2026-07-14