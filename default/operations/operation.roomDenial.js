const highCommand = require('module.highCommand');
const {notifySiegeEvent} = require('module.notifications');

// Must match ATTACK_ROUTE_MAX_EXTRA_HOPS in prototype.room.js. Intel may pick
// a flank that is better for towers; creeps skip it if it is this many hops
// farther from their colony than the closest staging neighbor.
const ATTACK_ROUTE_MAX_EXTRA_HOPS = 2;

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

// attackDirection is a neighboring room name (current writer) or a
// FIND_EXIT_* key (legacy intel). Either must resolve to a room name.
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

function resolveDenialStaging(dest, origin) {
    if (!dest) return dest;
    const attackRoom = resolveAttackRoom(dest);
    if (!attackRoom) return dest;
    const exits = Game.map.describeExits(dest);
    if (!exits) return dest;

    if (origin && origin !== dest && origin !== attackRoom) {
        const attackHops = attackRouteHops(origin, attackRoom);
        const neighbors = Object.values(exits);
        let minHops = attackHops;
        for (let i = 0; i < neighbors.length; i++) {
            const n = neighbors[i];
            const intel = INTEL[n];
            if (intel && intel.owner && !isFriendlyOwner(intel.owner)) continue;
            const hops = attackRouteHops(origin, n);
            if (hops < minHops) minHops = hops;
        }
        if (attackHops > minHops + ATTACK_ROUTE_MAX_EXTRA_HOPS) return dest;
    }
    return attackRoom;
}

Creep.prototype.ensureDenialStaging = function () {
    if (!this.memory.destination) return;
    if (!this.memory.misc) this.memory.misc = {};
    const origin = this.memory.misc.formColony || this.memory.colony;
    const resolved = resolveDenialStaging(this.memory.destination, origin);
    const current = this.memory.misc.stagingRoom;
    if (!current || current === this.memory.destination) {
        this.memory.misc.stagingRoom = resolved;
    } else if (!this.memory.misc.staged && resolved !== this.memory.destination && resolved !== current) {
        this.memory.misc.stagingRoom = resolved;
    }
    if (this.memory.misc.stagingRoom === this.room.name) this.memory.misc.staged = true;
};

Creep.prototype.denyRoom = function (options = {}) {
    // Make sure to display status to inform the user what's happening
    const sentence = ['Coming', 'For', 'That', 'Booty'];
    this.say(sentence[Game.time % sentence.length], true);

    if (this.room.name === this.memory.destination) {
        // Track wave if we haven't yet
        if (!this.memory.waveTracked) {
            if (Memory.targetRooms[this.room.name] && (!Memory.targetRooms[this.room.name].lastWave || Memory.targetRooms[this.room.name].lastWave + 20 < Game.time)) {
                this.memory.waveTracked = true;
                Memory.targetRooms[this.room.name].lastWave = Game.time;
                Memory.targetRooms[this.room.name].waves = (Memory.targetRooms[this.room.name].waves || 0) + 1;
                notifySiegeEvent(this.room.name, 'WAVE');
            } else {
                this.memory.waveTracked = true;
            }
        }
        if (!this.memory.activeTracked || this.memory.activeTracked + 50 < Game.time) {
            const armedHostiles = this.room.creeps.filter((c) => !c.my && (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK)));
            if (INTEL[this.room.name]) INTEL[this.room.name].activeDefenders = armedHostiles.length > 0;
            this.memory.activeTracked = Game.time;
        }

        this.operationManager();

        // Update sustainability of operation in this room
        if (highCommand.operationSustainability(this.room)) {
            return this.memory.operation = 'borderPatrol';
        }

        // Packed quads move via shibSquadMovement — fightRanged would peel the leader.
        if (options.squadMove) return;

        // Ignore-border would skip exit-camping defenders — the usual hold.
        if (this.handleMilitaryCreep(false, true, false)) return;

        // Move towards the controller
        if (this.pos.getRangeTo(this.room.controller) > 5) {
            return this.shibMove(this.room.controller, {range: 4});
        }

        this.idleFor(this.pos.getRangeTo(this.pos.findClosestByPath(FIND_EXIT)) * 0.5);
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
