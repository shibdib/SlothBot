/*
 * Defense Visualizer — renders hypothetical defender positions using room visuals.
 * No creeps are spawned, no game state is changed.
 *
 * Console commands:
 *   defViz('W1N1')              — static view, 3 melee + 2 ranged (defaults)
 *   defViz('W1N1', 4, 3)        — static view, custom counts
 *   defVizSim('W1N1')           — full attack simulation, default wave config
 *   defVizSim('W1N1', {melee:3, ranged:2, waveSize:4, waveDelay:60})
 *   defVizOff('W1N1')           — disable for a room
 *   defVizOff()                 — disable all
 *
 * D / D1 / D2 ... flags still work as pinned threat markers.
 * highCommand ignores these flags so they persist indefinitely.
 */

const profiler = require('tools.profiler');

// ─── Colors ──────────────────────────────────────────────────────────────────
const MELEE_COLOR = '#ff5544';
const RANGED_COLOR = '#4488ff';
const ATTACKER_COLOR = '#ff9900';
const MELEE_RANGE = 1;
const RANGED_RANGE = 3;

// ─── Attacker archetypes ──────────────────────────────────────────────────────
const ARCHETYPE = {
    melee: {maxHp: 1800, range: 1, color: '#ff6600', label: 'A'},
    ranged: {maxHp: 1000, range: 3, color: '#ff3300', label: 'R'},
    healer: {maxHp: 1400, range: 3, color: '#ff99cc', label: 'H'},
};

const TOWER_MAX_DMG = 600;
const TOWER_MIN_DMG = 150;
const TOWER_MAX_RANGE = 20;

// ─── Simulation state (module-level — persists in global) ─────────────────────
const simState = {};

// ─── Flag helper (same stripping logic as highCommand) ────────────────────────
function isSim(flagName) {
    return flagName.replace(/[^a-z]/gi, '').toLowerCase() === 'd';
}

// ─── Top-level runner ─────────────────────────────────────────────────────────
class DefenseVisualizer {
    constructor() {
    }

    run() {
        const configs = Memory._defenseViz;
        if (!configs) return;
        for (const roomName in configs) {
            const room = Game.rooms[roomName];
            if (!room) continue;
            try {
                new RoomDefenseViz(room, configs[roomName]).render();
            } catch (e) {
                log.e(`DefenseVisualizer error in ${roomName}: ${e}`);
            }
        }
    }
}

// ─── Per-room renderer ────────────────────────────────────────────────────────
class RoomDefenseViz {
    constructor(room, config) {
        this.room = room;
        this.vis = room.visual;
        this.melee = config.melee || 0;
        this.ranged = config.ranged || 0;
        this.simEnabled = !!config.sim;
        this.simCfg = {
            waveSize: config.waveSize || 3,
            waveDelay: config.waveDelay || 60,
            types: config.types || ['melee', 'ranged'],
        };
    }

    render() {
        const ramparts = this.room.structures.filter(
            s => s.structureType === STRUCTURE_RAMPART && !s.pos.checkForObstacleStructure()
        );
        const realHostiles = this.room.hostileCreeps;
        const simFlags = Object.values(Game.flags).filter(
            f => f.pos.roomName === this.room.name && isSim(f.name)
        );

        // ── Simulation tick ──────────────────────────────────────────────────
        let sim = null;
        if (this.simEnabled) sim = this.tickSim(ramparts);

        // ── Build threat list ────────────────────────────────────────────────
        const threats = [
            ...realHostiles.map(h => ({pos: h.pos})),
            ...simFlags.map(f => ({pos: f.pos})),
            ...(sim ? sim.attackers.filter(a => !a.dead).map(a => ({
                pos: {x: a.x, y: a.y, roomName: this.room.name}
            })) : []),
        ];

        // ── Assign defenders ─────────────────────────────────────────────────
        const assignments = ramparts.length ? this.assignDefenders(ramparts, threats) : [];
        const assignedIds = new Set(assignments.map(a => a.rampartId));

        // ── Apply simulation combat (needs assignments) ──────────────────────
        if (sim) this.applySimCombat(sim, assignments);

        // ── Draw ─────────────────────────────────────────────────────────────
        if (!ramparts.length) {
            this.vis.text('NO RAMPARTS', 25, 25, {color: '#ff4444', font: 1, align: 'center', opacity: 0.8});
        } else {
            this.drawUnoccupiedRamparts(ramparts, assignedIds);
            for (const a of assignments) this.drawDefender(a, threats);
        }

        this.drawSimFlags(simFlags, assignments);
        if (sim) this.drawSim(sim);
        this.drawTowerRanges();
        this.drawHUD(assignments, ramparts.length, realHostiles.length, simFlags.length, sim);
    }

    // ── Defender assignment ───────────────────────────────────────────────────
    assignDefenders(ramparts, threats) {
        const sorted = ramparts.slice().sort((a, b) => {
            if (threats.length) {
                const nearA = _.min(threats, t => Math.abs(t.pos.x - a.pos.x) + Math.abs(t.pos.y - a.pos.y));
                const nearB = _.min(threats, t => Math.abs(t.pos.x - b.pos.x) + Math.abs(t.pos.y - b.pos.y));
                return (Math.abs(nearA.pos.x - a.pos.x) + Math.abs(nearA.pos.y - a.pos.y))
                    - (Math.abs(nearB.pos.x - b.pos.x) + Math.abs(nearB.pos.y - b.pos.y));
            }
            return (Math.abs(a.pos.x - 25) + Math.abs(a.pos.y - 25))
                - (Math.abs(b.pos.x - 25) + Math.abs(b.pos.y - 25));
        });

        const used = new Set(), assignments = [];
        const assign = (type, range, count) => {
            let n = 0;
            for (const r of sorted) {
                if (n >= count) break;
                if (used.has(r.id)) continue;
                used.add(r.id);
                assignments.push({pos: r.pos, rampartId: r.id, type, range});
                n++;
            }
        };
        assign('melee', MELEE_RANGE, this.melee);
        assign('ranged', RANGED_RANGE, this.ranged);
        return assignments;
    }

    // ── SIMULATION ────────────────────────────────────────────────────────────

    tickSim(ramparts) {
        const name = this.room.name;
        if (!simState[name]) this.initSimState();
        const state = simState[name];

        // Age effects
        state.effects = state.effects.filter(e => Game.time - e.tick < e.duration);

        // Advance attacker positions — collision avoidance keeps them from stacking
        const occupied = new Set(
            state.attackers.filter(a => !a.dead).map(a => `${a.x},${a.y}`)
        );
        for (const a of state.attackers) {
            if (a.dead) continue;
            if (a.pathIdx < a.path.length) {
                const next = a.path[a.pathIdx];
                const nextKey = `${next.x},${next.y}`;
                if (!occupied.has(nextKey)) {
                    occupied.delete(`${a.x},${a.y}`);
                    a.x = next.x;
                    a.y = next.y;
                    occupied.add(nextKey);
                    a.pathIdx++;
                }
                // tile occupied — wait this tick, natural stagger
            }
        }

        // Prune dead attackers after death animation
        state.attackers = state.attackers.filter(a => !a.dead || Game.time - a.deadTick < 7);

        // Spawn next wave when all gone
        const alive = state.attackers.filter(a => !a.dead);
        if (!alive.length && state.attackers.length === 0 && Game.time >= state.nextWave) {
            this.spawnWave(state);
        }
        if (!alive.length && state.attackers.length > 0) {
            // All killed — start countdown for next wave
            if (!state.waveClearedTick) state.waveClearedTick = Game.time;
            if (Game.time - state.waveClearedTick >= state.config.waveDelay) {
                state.attackers = [];
                state.waveClearedTick = 0;
                state.wave++;
                state.nextWave = Game.time;
            }
        }

        return state;
    }

    applySimCombat(sim, assignments) {
        const towers = this.room.structures.filter(s => s.structureType === STRUCTURE_TOWER);

        for (const a of sim.attackers) {
            if (a.dead) continue;

            // Tower damage
            for (const tower of towers) {
                const dist = Math.max(Math.abs(tower.pos.x - a.x), Math.abs(tower.pos.y - a.y));
                if (dist > TOWER_MAX_RANGE) continue;
                const ratio = dist / TOWER_MAX_RANGE;
                const dmg = Math.round(TOWER_MAX_DMG - (TOWER_MAX_DMG - TOWER_MIN_DMG) * ratio);
                a.hp -= dmg;
                sim.effects.push({
                    type: 'beam', from: {x: tower.pos.x, y: tower.pos.y}, to: {x: a.x, y: a.y},
                    color: '#ffee00', tick: Game.time, duration: 2,
                });
            }

            // Defender damage
            for (const def of assignments) {
                const dist = Math.max(Math.abs(def.pos.x - a.x), Math.abs(def.pos.y - a.y));
                if (dist > def.range) continue;
                const dmg = def.type === 'melee' ? 30 : 10;
                a.hp -= dmg;
                sim.effects.push({
                    type: 'beam',
                    from: {x: def.pos.x, y: def.pos.y},
                    to: {x: a.x, y: a.y},
                    color: def.type === 'melee' ? MELEE_COLOR : RANGED_COLOR,
                    tick: Game.time, duration: 2,
                });
            }

            // Kill
            if (a.hp <= 0 && !a.dead) {
                a.dead = true;
                a.deadTick = Game.time;
                sim.effects.push({
                    type: 'explode', x: a.x, y: a.y,
                    tick: Game.time, duration: 7,
                });
            }
        }
    }

    initSimState() {
        const name = this.room.name;
        const exits = [
            ...this.room.find(FIND_EXIT_TOP),
            ...this.room.find(FIND_EXIT_BOTTOM),
            ...this.room.find(FIND_EXIT_LEFT),
            ...this.room.find(FIND_EXIT_RIGHT),
        ];
        simState[name] = {
            wave: 1, attackers: [], effects: [],
            exits: exits.map(p => ({x: p.x, y: p.y})),
            nextWave: Game.time + 5, waveClearedTick: 0,
            config: this.simCfg,
        };
    }

    spawnWave(state) {
        if (!state.exits.length) return;
        const types = state.config.types;

        // Sort exits so we can pick evenly-spaced points around the perimeter
        const sorted = state.exits.slice().sort((a, b) => {
            // Map to perimeter order: top → right → bottom → left
            const edge = p => p.y === 0 ? p.x : p.x === 49 ? 50 + p.y : p.y === 49 ? 150 - p.x : 200 - p.y;
            return edge(a) - edge(b);
        });
        const stride = Math.max(1, Math.floor(sorted.length / state.config.waveSize));

        // Pick a random starting offset so waves don't always enter from the same spots
        const offset = Math.floor(Math.random() * sorted.length);
        const targets = this.findTargets(state.config.waveSize);

        for (let i = 0; i < state.config.waveSize; i++) {
            const type = types[i % types.length];
            const spawn = sorted[(offset + i * stride) % sorted.length];
            const tgt = targets[i % targets.length];
            const path = this.computePath(spawn, tgt);
            state.attackers.push({
                x: spawn.x, y: spawn.y, type, path, pathIdx: 0,
                hp: ARCHETYPE[type].maxHp, maxHp: ARCHETYPE[type].maxHp,
                dead: false, deadTick: 0,
            });
        }
    }

    findTargets(count) {
        const prio = [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL];
        const targets = this.room.structures.filter(s => prio.includes(s.structureType));
        const open = targets.filter(s => !s.pos.checkForRampart());
        const pool = open.length ? open : (targets.length ? targets : null);
        if (!pool) return [{x: 25, y: 25, roomName: this.room.name}];
        // Return up to `count` distinct targets so attackers spread across structures
        const shuffled = _.shuffle(pool);
        return shuffled.slice(0, count).map(s => s.pos);
    }

    computePath(from, to) {
        const room = this.room;
        const result = PathFinder.search(
            new RoomPosition(from.x, from.y, room.name),
            {pos: new RoomPosition(to.x, to.y, room.name), range: 1},
            {
                maxRooms: 1, maxOps: 1500,
                roomCallback: (roomName) => {
                    const matrix = new PathFinder.CostMatrix();
                    const r = Game.rooms[roomName];
                    if (!r) return matrix;
                    for (const s of r.structures) {
                        if (s.structureType === STRUCTURE_RAMPART) {
                            // Ramparts are walls to attackers — find the gaps
                            matrix.set(s.pos.x, s.pos.y, 255);
                        } else if (s.structureType === STRUCTURE_ROAD) {
                            matrix.set(s.pos.x, s.pos.y, 1);
                        } else if (OBSTACLE_OBJECT_TYPES.includes(s.structureType)) {
                            matrix.set(s.pos.x, s.pos.y, 255);
                        }
                    }
                    return matrix;
                }
            }
        );
        return result.path.map(p => ({x: p.x, y: p.y}));
    }

    // ── DRAWING ───────────────────────────────────────────────────────────────

    drawUnoccupiedRamparts(ramparts, assignedIds) {
        for (const r of ramparts) {
            if (assignedIds.has(r.id)) continue;
            this.vis.circle(r.pos, {
                radius: 0.42, fill: 'transparent',
                stroke: '#335533', strokeWidth: 0.06, opacity: 0.45
            });
        }
    }

    drawDefender(defender, threats) {
        const {pos, type, range} = defender;
        const color = type === 'ranged' ? RANGED_COLOR : MELEE_COLOR;

        this.vis.rect(pos.x - 0.5, pos.y - 0.5, 1, 1, {
            fill: color, opacity: 0.12, stroke: color, strokeWidth: 0.07
        });
        this.vis.circle(pos, {radius: 0.46, fill: color, opacity: 0.88});
        this.vis.text(type === 'ranged' ? 'R' : 'M', pos.x, pos.y + 0.15, {
            color: '#ffffff', font: 0.38, align: 'center'
        });
        this.vis.circle(pos, {
            radius: range + 0.5, fill: 'transparent',
            stroke: color, strokeWidth: 0.06, opacity: 0.22, lineStyle: 'dashed'
        });

        if (!threats.length) return;
        const closest = _.min(threats, t => Math.max(Math.abs(t.pos.x - pos.x), Math.abs(t.pos.y - pos.y)));
        const chebyshev = Math.max(Math.abs(closest.pos.x - pos.x), Math.abs(closest.pos.y - pos.y));
        const inRange = chebyshev <= range;
        this.vis.line(pos, closest.pos, {
            color: inRange ? '#ff3333' : '#ffcc44', width: inRange ? 0.12 : 0.06,
            opacity: inRange ? 0.9 : 0.35, lineStyle: inRange ? 'solid' : 'dashed'
        });
        if (inRange) {
            this.vis.circle(closest.pos, {
                radius: 0.6, fill: 'transparent',
                stroke: '#ff3333', strokeWidth: 0.1, opacity: 0.7
            });
        }
    }

    drawSimFlags(simFlags, assignments) {
        for (const flag of simFlags) {
            const pos = flag.pos;
            this.vis.circle(pos, {
                radius: 0.7, fill: ATTACKER_COLOR, opacity: 0.18,
                stroke: ATTACKER_COLOR, strokeWidth: 0.08
            });
            this.vis.circle(pos, {radius: 0.42, fill: ATTACKER_COLOR, opacity: 0.9});
            this.vis.text('!', pos.x, pos.y + 0.15, {color: '#000000', font: 0.42, align: 'center'});
            this.vis.text(flag.name, pos.x, pos.y - 0.65, {
                color: ATTACKER_COLOR, font: 0.32, align: 'center', opacity: 0.85
            });
            const covered = assignments.some(a => {
                return Math.max(Math.abs(a.pos.x - pos.x), Math.abs(a.pos.y - pos.y)) <= a.range;
            });
            if (!covered && assignments.length) {
                this.vis.circle(pos, {
                    radius: 0.9, fill: 'transparent',
                    stroke: '#ff0000', strokeWidth: 0.1, opacity: 0.8, lineStyle: 'dashed'
                });
                this.vis.text('UNCOVERED', pos.x, pos.y + 1.15, {
                    color: '#ff4444', font: 0.3, align: 'center', opacity: 0.85
                });
            }
        }
    }

    drawSim(sim) {
        // Combat beams and explosions
        for (const e of sim.effects) {
            const age = Game.time - e.tick;
            const opacity = Math.max(0, 1 - age / e.duration);
            if (e.type === 'beam') {
                this.vis.line(e.from, e.to, {
                    color: e.color, width: 0.07, opacity: opacity * 0.85
                });
            } else if (e.type === 'explode') {
                const r = 0.25 + age * 0.14;
                this.vis.circle({x: e.x, y: e.y}, {
                    radius: r, fill: '#ff6600', opacity: opacity * 0.75
                });
                this.vis.circle({x: e.x, y: e.y}, {
                    radius: r * 0.55, fill: '#ffeeaa', opacity: opacity * 0.55
                });
            }
        }

        // Attackers
        for (const a of sim.attackers) {
            if (a.dead) {
                const age = Game.time - a.deadTick;
                const fade = Math.max(0, 1 - age / 7);
                this.vis.circle({x: a.x, y: a.y}, {
                    radius: 0.5 + age * 0.12, fill: '#ff4400', opacity: fade * 0.45
                });
                continue;
            }

            const arc = ARCHETYPE[a.type];
            const ratio = Math.max(0, a.hp / a.maxHp);

            // Body
            this.vis.circle({x: a.x, y: a.y}, {radius: 0.46, fill: arc.color, opacity: 0.92});
            this.vis.text(arc.label, a.x, a.y + 0.15, {
                color: '#ffffff', font: 0.36, align: 'center'
            });

            // HP bar
            const barW = 1.1, barH = 0.13, bx = a.x - barW / 2, by = a.y - 0.75;
            this.vis.rect(bx, by, barW, barH, {fill: '#222222', opacity: 0.85});
            this.vis.rect(bx, by, barW * ratio, barH, {
                fill: ratio > 0.5 ? '#44ff44' : ratio > 0.25 ? '#ffcc00' : '#ff3333',
                opacity: 0.9
            });

            // Remaining path (faint trail)
            if (a.pathIdx < a.path.length) {
                const preview = a.path.slice(a.pathIdx, a.pathIdx + 8);
                for (let i = 0; i < preview.length - 1; i++) {
                    this.vis.line(preview[i], preview[i + 1], {
                        color: arc.color, width: 0.04, opacity: 0.18
                    });
                }
            }
        }

        // Wave countdown between waves
        const alive = sim.attackers.filter(a => !a.dead);
        if (!alive.length && !sim.attackers.length) {
            const wait = sim.nextWave - Game.time;
            if (wait > 0) {
                this.vis.text(`⚔ Wave ${sim.wave} arrives in ${wait}t`, 25, 2.8, {
                    color: '#ffcc44', font: 0.55, align: 'center', opacity: 0.85
                });
            }
        } else if (alive.length) {
            this.vis.text(`⚔ Wave ${sim.wave}  —  ${alive.length} attackers`, 25, 2.8, {
                color: '#ff7700', font: 0.5, align: 'center', opacity: 0.85
            });
        }
    }

    drawTowerRanges() {
        const towers = this.room.structures.filter(s => s.structureType === STRUCTURE_TOWER);
        for (const tower of towers) {
            this.vis.circle(tower.pos, {
                radius: 20.5, fill: 'transparent',
                stroke: '#ffcc00', strokeWidth: 0.05, opacity: 0.1, lineStyle: 'dashed'
            });
        }
    }

    drawHUD(assignments, rampartCount, realCount, simFlagCount, sim) {
        const mCount = assignments.filter(a => a.type === 'melee').length;
        const rCount = assignments.filter(a => a.type === 'ranged').length;

        const lines = [
            {text: '[ DEFENSE SIM ]', color: '#88ffcc', font: 0.52},
            {text: `Ramparts: ${rampartCount}   Occupied: ${mCount + rCount}`, color: '#cccccc', font: 0.40},
            {text: `Melee: ${mCount}   Ranged: ${rCount}`, color: '#cccccc', font: 0.40},
        ];
        if (sim) {
            const alive = sim.attackers.filter(a => !a.dead).length;
            lines.push({text: `⚔ Sim wave ${sim.wave}   Active: ${alive}`, color: '#ff9900', font: 0.40});
        }
        if (simFlagCount) lines.push({text: `⚑ Flag markers: ${simFlagCount}`, color: ATTACKER_COLOR, font: 0.40});
        if (realCount) lines.push({text: `⚠ Real hostiles: ${realCount}`, color: '#ff6666', font: 0.42});

        const padX = 0.4, padY = 0.35, lineH = 0.68;
        const boxW = 14, x0 = 0.6, y0 = 1.8;
        const boxH = lines.length * lineH + padY * 1.8 + 0.9;

        this.vis.rect(x0 - padX, y0 - padY - 0.45, boxW, boxH, {
            fill: '#000000', opacity: 0.5, stroke: '#445544', strokeWidth: 0.06
        });
        for (let i = 0; i < lines.length; i++) {
            const {text, color, font} = lines[i];
            this.vis.text(text, x0, y0 + i * lineH, {color, font, align: 'left', opacity: 0.95});
        }

        // Legend
        const lx = x0, ly = y0 + lines.length * lineH + 0.15;
        this.vis.circle(lx + 0.3, ly, {radius: 0.26, fill: MELEE_COLOR, opacity: 0.85});
        this.vis.text('Melee', lx + 0.65, ly + 0.12, {color: '#cccccc', font: 0.34, align: 'left'});
        this.vis.circle(lx + 3.8, ly, {radius: 0.26, fill: RANGED_COLOR, opacity: 0.85});
        this.vis.text('Ranged', lx + 4.15, ly + 0.12, {color: '#cccccc', font: 0.34, align: 'left'});
        this.vis.circle(lx + 7.5, ly, {radius: 0.26, fill: ATTACKER_COLOR, opacity: 0.85});
        this.vis.text('Attacker', lx + 7.85, ly + 0.12, {color: '#cccccc', font: 0.34, align: 'left'});
    }
}

profiler.registerClass(DefenseVisualizer, 'DefenseVisualizer');
module.exports = DefenseVisualizer;

// ─── Console helpers ──────────────────────────────────────────────────────────
global.defViz = function (roomName, melee = 3, ranged = 2) {
    Memory._defenseViz = Memory._defenseViz || {};
    Memory._defenseViz[roomName] = {melee, ranged};
    return `Defense visualizer ON for ${roomName}: ${melee} melee, ${ranged} ranged`;
};

global.defVizSim = function (roomName, opts = {}) {
    Memory._defenseViz = Memory._defenseViz || {};
    const prev = Memory._defenseViz[roomName] || {};
    Memory._defenseViz[roomName] = Object.assign(
        {melee: 3, ranged: 2}, prev, opts, {sim: true}
    );
    // Reset sim state so a fresh simulation starts
    delete simState[roomName];
    const cfg = Memory._defenseViz[roomName];
    return `Attack simulation ON for ${roomName}: wave size ${cfg.waveSize || 3}, delay ${cfg.waveDelay || 60}t`;
};

global.defVizOff = function (roomName) {
    if (!Memory._defenseViz) return 'Nothing active.';
    if (roomName) {
        delete Memory._defenseViz[roomName];
        delete simState[roomName];
        return `Defense visualizer OFF for ${roomName}`;
    }
    for (const r in simState) delete simState[r];
    delete Memory._defenseViz;
    return 'Defense visualizer OFF (all rooms)';
};
