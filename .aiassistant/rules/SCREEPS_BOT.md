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

The bot should be entirely autonomous while supporting optional flag-based guidance. It favors efficient small-unit
tactics (especially duos and quads) over large zerg-style armies.

## How to Use This Document with AI

When helping with this codebase:

- **CPU impact is the top priority.** Evaluate cost of every suggestion, especially in combat and hot paths.
- **Avoid overcomplicated systems** Overcomplication leads too difficult to diagnose edge case failures.
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

### Colony room roles

Owned rooms are classified in `module.colonyProfile.js` (HUD: CORE / FRNT / LNCH / OUTP). Geography is sticky for one
creep lifetime so a room does not flip every tick; capability (RCL, terminal, labs) is not. Override with
`colonyRoles(roomName, 'core'|'frontier'|'launch'|'outpost'|'auto')` or `room.memory.forceRole`.

These are **jobs**, not layout types. A launch room still mines and upgrades. A core still defends.

| Role         | Who gets it                                                                                                                                                   | Intent                                                              | Keep / logistics                                                                                                                         | Military                                     |
|--------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------|
| **Outpost**  | RCL &lt; 6                                                                                                                                                    | Growing room. Not a warehouse, not a combat pad.                    | Working stock only.                                                                                                                      | Last choice to spawn ops (penalty 4).        |
| **Frontier** | Convex-hull / leaf, or ≤3 hops from a hostile, or remote/intel pressure ≥ 15. Not chosen as a launch pad.                                                     | Border: see the enemy, feed remotes, do **not** hoard empire stock. | Operational boosts only. 1k bars. At ≥80% storage, evacuate surplus to the nearest core. Energy target ×1.15.                            | Prefer over core for spawning (penalty 1).   |
| **Launch**   | Thinned subset of RCL6+ rooms with terminal + labs. One pad per nearby hostile contact and per hot incapable outpost; neighbors of a pad are not also launch. | Combat door: waves spawn where the T3 is.                           | Combat T3 at `BOOST_AMOUNT`. Other boosts operational. 1k bars (not a bar warehouse). Energy target ×1.25. Surplus still dumps to cores. | First choice to spawn ops (penalty 0).       |
| **Core**     | Interior: not hull, not launch, RCL ≥ 6.                                                                                                                      | Safe shelf: hold empire minerals/boosts, supply hungry rooms.       | Non-combat boosts at `BOOST_AMOUNT`. 10k of each compressed mineral (50k mineral-eq). Do not dump into other cores.                      | Spawn ops only if closer/better (penalty 3). |

**Market hub** is not a fifth role. It is a **job** on one room: `Memory._banker.marketHub`. Buy/sell orders, ally
segment publish, and credit logic live there so we do not bid against ourselves. The hub **must be a core** when any
core exists (scored by energy, RCL, storage headroom, distance from hostiles). If the empire is all frontier, the hub
falls back to the best available room and that room temporarily gets warehouse keep.

**How stock is supposed to move**

1. Frontier/outpost keep only what they are using. Extra bars and idle boosts load into the terminal and ship.
2. Hungry rooms (labs, launch T3, core keep) pull first — bars count as mineral supply and are planned before raw
   minerals.
3. Whatever is still extra goes to the **nearest core with space**, not only the market hub.
4. Cores fill each other via normal demand (keep), not via “everything piles in one room.”

`isFrontierRoom()` is a helper that is true for **frontier or launch** (anything on the border). Do not treat it as a
fifth role.

**Do we need more types?** No. Do not add `hub`, `warehouse`, `factory`, or `lab` as colony roles.

- Hub is a job on a core (above).
- Warehouse **is** core.
- Combat pad **is** launch.
- Factory/commodity assignment is already per-room mineral (`commodityProduction`), not a geography role.
- Power processing and SK mining are room features, not empire roles.

A fifth role would overlap these four and make keep/spawn/routing branch on two flags for the same room. If a room is
misbehaving, force its role or fix the keep/routing rules — do not invent a new type.

Code: `default/modules/module.colonyProfile.js`, keep in `termKeep.js`, hub pick in `termMarket.js`, routing in
`termTransfers.js`, spawn origin in `spawnOperations.js` (`COLONY_ASSIGN_PENALTY`).

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
- `room.memory.colonyProfile` — `{role, hull, hostileHops, pressure, launchEligible, forced, tick}`
- `room.memory.forceRole` — optional sticky override (`core`/`frontier`/`launch`/`outpost`)
- `Memory._banker.marketHub` — single market-desk room name (a core when any core exists)
- `creep.memory` — role, target, squad info, working state, traffic data
- Squad/memory coordination for duos and quads
- Global configuration via `configs/`

(Expand with exact keys as the implementation is explored.)

## Build / Deployment Notes

- Code in the `default/` folder is what gets uploaded to Screeps.
- Original project uses **Grunt** (`Gruntfile.js`) for automated uploads (recommended workflow).
- Configuration is handled via `config.default.js` (copy and customize).
- Local development uses Docker + Steamless client setup.

## Seasonal Specific information

Active season for upcoming seasonal-shard work: **Season 11**. Treat this section as the source of truth when adding or
gating season-only code. Persistent-world / MMO assumptions (market, portals, GCL-scaled CPU) do **not** apply on this
shard.

### Season 11 — Thorium Reactors (Season 5 rules + uneven map)

Season 11 reuses **Season 5** mechanics with one map change: Thorium is **not** evenly distributed. Density increases
toward the **upper (north) part of the world**. Deposits also contain **less material than Season 5**.

**Win condition:** deliver Thorium to sector-center Reactors and keep them claimed and continuously fed. Highest score
wins.

#### Environment (all seasons, including 11)

| Constraint                               | Effect on the bot                                                    |
|------------------------------------------|----------------------------------------------------------------------|
| Constant **100 CPU**                     | No GCL CPU scaling. Bucket still matters; do not assume "unlimited." |
| **Market disabled**                      | No NPC/player orders. Energy and minerals must be produced or taken. |
| Terminals send **only to own terminals** | Own-network logistics still work; no trading with others.            |
| **No portals** (Season 11)               | Single shard. No intershard movement or portal scouting.             |

#### Thorium (`RESOURCE_THORIUM`)

- Finite mineral. **Does not regenerate.** Once a room's deposit is mined out, it is gone.
- Present in controller rooms (Season 5 layout); Season 11 amounts are lower and **skewed north**.
- Harvest like a mineral (extractor + WORK). Do not assume mineral regen timers apply.

**Tile hazard — accelerated decay / aging**

Anything on the same tile as Thorium ages/decays faster. Thorium counts whether it is in a **creep carry**, a
**structure store**, or **dropped**. Multiplier:

```
decayBonus = Math.floor(Math.log10(totalThoriumOnTile))
```

Applies to **creep TTL** and decay of **roads** and **containers** on that tile.

| Thorium on tile | Extra decay/aging per tick |
|----------------:|---------------------------:|
|             0–9 |                          0 |
|           10–99 |                         +1 |
|         100–999 |                         +2 |
|     1,000–9,999 |                         +3 |
|   10,000–99,999 |                         +4 |

Do not park loaded Thorium haulers on roads/containers. Avoid storing large Thorium piles in containers. Prefer
storage/terminal/reactor, then keep the carry moving.

#### Reactors (sector center)

- One Reactor in the **center room of each game sector**.
- Claim with any creep that has a **CLAIM** body part. Ownership can flip at any time.
- A claimed Reactor consumes **1 Thorium per tick** and scores for its owner.
- Score per tick while operating:

```
points = 1 + Math.floor(Math.log10(ticksOfContinuousOperation))
```

| Continuous ticks | Points / tick | Thorium → points efficiency |
|-----------------:|--------------:|----------------------------:|
|              1–9 |             1 |                           1 |
|            10–99 |             2 |                           2 |
|          100–999 |             3 |                           3 |
|      1,000–9,999 |             4 |                           4 |
|    10,000–99,999 |             5 |                           5 |
|  100,000–999,999 |             6 |                           6 |

- If the Reactor **runs out of Thorium**, the continuous-operation bonus **resets to 0**. Uptime is worth more than
  burst dumps.
- API shape from Season 5 (confirm against `https://docs-season.screeps.com/api/#Reactor` when the shard is live):
  - `FIND_REACTORS` / `STRUCTURE_REACTOR`
  - `reactor.store` — Thorium cargo (`REACTOR_THORIUM_CAPACITY` exists in Season 5 constants)
  - `reactor.continuousWork` — ticks of uninterrupted operation
  - `reactor.my` / `reactor.owner`
  - Transfer Thorium in; CLAIM to take ownership

#### Season 11 vs Season 5

- Same scoring, claiming, decay, CPU, and terminal rules.
- **Uneven Thorium:** richer toward the **upper/north** map. Where and when to expand is a season-defining choice.
- **Smaller deposits:** less Thorium per room → logistics and room-cycling matter more; do not treat every claimed room
  as a long-term mine.
- **No portals.**

#### Bot implications (use when implementing)

1. **Expansion:** scout and prefer northern rooms for Thorium yield; do not expand only by distance-from-spawn.
2. **Economy:** Thorium mining + haul-to-reactor is a first-class pipeline, not a mineral side job. Terminals are for
   **own-empire** Thorium (and energy) routing only.
3. **Reactor ops:** keep a claimed Reactor continuously stocked. Track `continuousWork` and treat empty-store as a score
   emergency. Defend / re-claim sector centers; CLAIM creeps are offensive tools.
4. **Pathing / structures:** Thorium on a tile taxes roads, containers, and the carrying creep. Minimize dwell time;
   skip container-mining patterns for Thorium.
5. **Combat:** reactors are contestable objectives. Duo/quad work around sector-center rooms is more valuable than
   random room fights.
6. **Do not assume:** market buys, portal travel, regenerating Thorium, or GCL CPU. Gate season code so MMO shards are
   unaffected.

#### Confirmed from live `docs-season.screeps.com` + Season 5 engine (2026-09-02)

- `FIND_REACTORS` = `10051`. `LOOK_REACTORS` = `"reactor"`. Reactors are **custom objects**, not `FIND_STRUCTURES`.
- `RESOURCE_THORIUM` = `"T"`. Reactor store capacity **1,000**.
- `Creep.claimReactor(reactor)` — CLAIM part, adjacent. Instant ownership flip; no GCL cost. Cannot withdraw Thorium
  from a reactor.
- Thorium is a **second mineral** in every controller room, spawned in a wall with at least one walkable neighbor. When
  mined out the mineral object is **removed**.
- Season 5 density table (Season 11 amounts may be lower, but same shape): 10k / 22k / 45k / 67k.

## Current Implementation Status

**To be filled as we map the current codebase:**

| System                   | Status | Notes                                                                                                                                                               |
|--------------------------|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Core roles               | TBD    | Many roles exist in reference (harvester, upgrader, hauler, defender, siegeDuo, etc.)                                                                               |
| Colony management        | TBD    | `main.colony.js` with traffic management                                                                                                                            |
| World operations         | TBD    | `main.world.js`                                                                                                                                                     |
| Economy / Harvesting     | TBD    |                                                                                                                                                                     |
| Defense systems          | TBD    |                                                                                                                                                                     |
| Duo combat               | TBD    | Reference has `role.siegeDuo.js`                                                                                                                                    |
| Quad combat              | TBD    | Listed as in-progress in original project                                                                                                                           |
| CPU / Traffic management | TBD    | Recent improvements in colony logic                                                                                                                                 |
| Prototypes & Modules     | TBD    | `prototypes/` and `modules/` folders exist                                                                                                                          |
| Season 11 Thorium        | Live   | Season 10 score pickup removed. `module.season.js` claims/feeds reactors, mines Thorium without containers, terminals route to a feeder room. Gated by `IS_SEASON`. |

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
- **2026-08-27** — Documented Season 11 (Thorium Reactors, Season 5 rules + northern density skew, no portals) under
  Seasonal Specific information.
- **2026-08-27** — Documented colony room roles (core / frontier / launch / outpost) and the market-hub job. No extra
  role types; hub is a job on a core, warehouse is core, combat pad is launch.
- **2026-09-02** — Season 11 implementation: removed Season 10 `FIND_SCORES` / `scoreTarget` pickup. Added Thorium
  mining (no container), reactor claim/feed pipeline, northern expansion bias, season market skip, no portal jumps.
- **2026-09-02** — Aligned to live docs-season: `FIND_REACTORS` 10051 (not structures), reactor cap 1000, Thorium as a
  second wall mineral, `claimReactor` adjacent CLAIM, no reactor withdraw.

---

**Last updated:** 2026-09-02