const highCommand = require('module.highCommand');

function extraHopsCap() {
    return (typeof global.ATTACK_ROUTE_MAX_EXTRA_HOPS === 'number') ? global.ATTACK_ROUTE_MAX_EXTRA_HOPS : 2;
}

function isFriendlyOwner(owner) {
    if (!owner) return true;
    if (owner === MY_USERNAME) return true;
    return typeof FRIENDLIES !== 'undefined' && FRIENDLIES.includes(owner);
}

function attackRouteHops(from, to) {
    if (!from || !to) return Infinity;
    if (from === to) return 0;
    try {
        const hops = require('pathRoute').routeDistance(from, to);
        if (hops < Infinity) return hops;
    } catch (e) { /* pathfinder not loaded yet */
    }
    return Game.map.getRoomLinearDistance(from, to);
}

function resolveAttackRoom(dest) {
    if (!dest) return undefined;
    const attack = INTEL[dest] && INTEL[dest].attackDirection;
    if (!attack) return undefined;
    const exits = Game.map.describeExits(dest);
    if (!exits) return undefined;
    if (exits[attack]) return exits[attack];
    const neighbors = Object.values(exits);
    for (let i = 0; i < neighbors.length; i++) {
        if (neighbors[i] === attack) return attack;
    }
    return undefined;
}

function closestFriendlyNeighbor(dest, origin) {
    const exits = Game.map.describeExits(dest);
    if (!exits) return undefined;
    const neighbors = Object.values(exits);
    let closest = undefined;
    let minHops = Infinity;
    for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        const intel = INTEL[n];
        if (intel && intel.owner && !isFriendlyOwner(intel.owner)) continue;
        const hops = origin ? attackRouteHops(origin, n) : 0;
        if (hops < minHops) {
            minHops = hops;
            closest = n;
        }
    }
    return closest;
}

function resolveDenialStaging(dest, origin) {
    if (!dest) return dest;
    const destRoom = Game.rooms[dest];
    if (destRoom && destRoom.determineBestAttackRoute) {
        const picked = destRoom.determineBestAttackRoute(origin);
        if (picked) return picked;
    }

    const attackRoom = resolveAttackRoom(dest);
    const closest = closestFriendlyNeighbor(dest, origin);
    if (attackRoom && origin && origin !== dest && origin !== attackRoom) {
        const intel = INTEL[dest];
        const sameOrigin = intel && intel.attackDirectionOrigin === origin;
        const attackHops = attackRouteHops(origin, attackRoom);
        const minHops = closest ? attackRouteHops(origin, closest) : attackHops;
        if (sameOrigin || attackHops <= minHops + extraHopsCap()) return attackRoom;
        return closest || dest;
    }
    return attackRoom || closest || dest;
}

Creep.prototype.ensureDenialStaging = function () {
    if (!this.memory.destination) return;
    if (!this.memory.misc) this.memory.misc = {};
    const origin = this.memory.misc.formColony || this.memory.colony;
    if (this.memory.misc.stagingOrigin && origin && this.memory.misc.stagingOrigin !== origin) {
        this.memory.misc.staged = undefined;
        this.memory.misc.stagingRoom = undefined;
    }
    this.memory.misc.stagingOrigin = origin;
    const resolved = resolveDenialStaging(this.memory.destination, origin);
    const current = this.memory.misc.stagingRoom;
    if (!current || current === this.memory.destination) {
        this.memory.misc.stagingRoom = resolved;
    } else if (!this.memory.misc.staged && resolved !== this.memory.destination && resolved !== current) {
        this.memory.misc.stagingRoom = resolved;
    }
    if (this.memory.misc.stagingRoom === this.room.name) this.memory.misc.staged = true;
};

function destExitInward(pos) {
    if (pos.x <= 2) return {dx: 1, dy: 0};
    if (pos.x >= 47) return {dx: -1, dy: 0};
    if (pos.y <= 2) return {dx: 0, dy: 1};
    if (pos.y >= 47) return {dx: 0, dy: -1};
    return null;
}

function hostileBarrierAt(pos) {
    const structs = pos.lookFor(LOOK_STRUCTURES);
    let best = null;
    for (let i = 0; i < structs.length; i++) {
        const s = structs[i];
        if (s.structureType === STRUCTURE_WALL) {
            if (s.my) continue;
        } else if (s.structureType === STRUCTURE_RAMPART) {
            if (s.my || s.isPublic) continue;
        } else continue;
        if (!best || s.hits < best.hits) best = s;
    }
    return best;
}

function pickSoloBorderBreach(creep) {
    const inward = destExitInward(creep.pos);
    if (!inward) return null;
    const along = inward.dx !== 0 ? {dx: 0, dy: 1} : {dx: 1, dy: 0};
    let best = null;
    let bestScore = Infinity;
    for (let step = 1; step <= 2; step++) {
        let found = false;
        for (let k = -4; k <= 4; k++) {
            const x = creep.pos.x + inward.dx * step + along.dx * k;
            const y = creep.pos.y + inward.dy * step + along.dy * k;
            if (x < 1 || x > 48 || y < 1 || y > 48) continue;
            const barrier = hostileBarrierAt(new RoomPosition(x, y, creep.room.name));
            if (!barrier || creep.pos.getRangeTo(barrier) > 3) continue;
            found = true;
            const score = barrier.hits + Math.abs(k) * 1e5;
            if (score < bestScore) {
                bestScore = score;
                best = barrier;
            }
        }
        if (found) break;
    }
    return best;
}

function soloCanTankTowers(creep) {
    const towers = creep.room.towers || [];
    let dump = 0;
    for (let i = 0; i < towers.length; i++) {
        const t = towers[i];
        const o = t.safeOwnerName ? t.safeOwnerName() : (t.owner && t.owner.username);
        if (!o || FRIENDLIES.includes(o)) continue;
        if (!t.store || t.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;
        let mult = 1;
        if (t.effects) {
            for (let e = 0; e < t.effects.length; e++) {
                if (t.effects[e].effect === PWR_OPERATE_TOWER && t.effects[e].level) {
                    mult = 1 + (POWER_INFO[PWR_OPERATE_TOWER].effect[t.effects[e].level - 1] / 100);
                    break;
                }
            }
        }
        dump += TOWER_POWER_ATTACK * mult;
    }
    if (!dump) return true;
    const hps = (typeof abilityPower === 'function') ? abilityPower(creep.body).effectiveHeal : 0;
    return hps >= dump;
}

function engageDenialBreach(creep, barrier) {
    creep.memory.target = barrier.id;
    if (creep.pos.getRangeTo(barrier) > 3) {
        creep.shibMove(barrier, {range: 3});
        if (creep.hasActiveBodyparts(RANGED_ATTACK)) creep.attackInRange();
        if (creep.hasActiveBodyparts(HEAL)) creep.heal(creep);
        return true;
    }
    if (creep.hasActiveBodyparts(RANGED_ATTACK)) creep.rangedAttack(barrier);
    else if (creep.hasActiveBodyparts(ATTACK) && creep.pos.isNearTo(barrier)) creep.attack(barrier);
    if (creep.hasActiveBodyparts(HEAL)) creep.heal(creep);
    return true;
}

Creep.prototype.denyRoom = function (options = {}) {
    // Make sure to display status to inform the user what's happening
    const sentence = ['Coming', 'For', 'That', 'Booty'];
    this.say(sentence[Game.time % sentence.length], true);

    if (this.room.name === this.memory.destination) {
        if (!this.memory.activeTracked || this.memory.activeTracked + 50 < Game.time) {
            const armedHostiles = this.room.creeps.filter((c) => !c.my && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
            if (INTEL[this.room.name]) INTEL[this.room.name].activeDefenders = armedHostiles.length > 0;
            this.memory.activeTracked = Game.time;
        }

        this.operationManager();

        const nextOp = highCommand.operationSustainability(this.room);
        if (nextOp) {
            this.memory.operation = nextOp;
            const ids = this.memory.squadMembers || [];
            for (let i = 0; i < ids.length; i++) {
                const m = Game.getObjectById(ids[i]);
                if (m && m.memory) m.memory.operation = nextOp;
            }
            return;
        }

        // Packed quads move via shibSquadMovement — fightRanged would peel the leader.
        if (options.squadMove) return;

        // Dest-exit: chip the wall. fightRanged kites at range 5–7 of a tower
        // and never picks a border barrier.
        const barrier = pickSoloBorderBreach(this);
        if (barrier) return engageDenialBreach(this, barrier);

        if (!soloCanTankTowers(this)) {
            const exit = this.pos.findClosestByPath(FIND_EXIT);
            if (exit) return this.shibMove(exit, {range: 0});
        }

        // Ignore-border would skip exit-camping defenders — the usual hold.
        if (this.handleMilitaryCreep(false, true, false)) return;

        if (this.room.controller && this.pos.getRangeTo(this.room.controller) > 5) {
            return this.shibMove(this.room.controller, {range: 4});
        }

        const idleExit = this.pos.findClosestByPath(FIND_EXIT);
        if (idleExit) this.idleFor(this.pos.getRangeTo(idleExit) * 0.5);
        return;
    }

    // Packed quad travel is the caller's job (2×2 step, not a solo shibMove).
    if (options.squadMove) return;

    this.ensureDenialStaging();
    const destination = this.memory.misc && this.memory.misc.stagingRoom && !this.memory.misc.staged
        ? this.memory.misc.stagingRoom
        : this.memory.destination;
    if (this.room.name !== destination) {
        return this.shibMove(new RoomPosition(25, 25, destination), {range: 23});
    }
};
