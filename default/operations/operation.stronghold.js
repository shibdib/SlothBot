const highCommand = require('module.highCommand');

function rampartOr(structure) {
    if (!structure || !structure.pos) return structure;
    const rampart = structure.pos.checkForRampart && structure.pos.checkForRampart();
    return rampart || structure;
}

/**
 * Core/tower bunker first. Armed defenders only if they sit on the path
 * (closer than the bunker, or adjacent to it) and are already in range 3.
 */
function pickStrongholdTarget(room, fromPos) {
    if (!room) return undefined;
    const core = room.invaderCore || room.structures.find(s => s.structureType === STRUCTURE_INVADER_CORE);
    let bunker;
    if (core) bunker = rampartOr(core);
    if (!bunker) {
        const towers = room.towers || [];
        let tower;
        for (let i = 0; i < towers.length; i++) {
            const t = towers[i];
            if (!t.store || t.store[RESOURCE_ENERGY] < TOWER_ENERGY_COST) continue;
            tower = t;
            break;
        }
        if (tower) bunker = rampartOr(tower);
    }
    if (!bunker) return undefined;

    if (fromPos) {
        const bunkerRange = fromPos.getRangeTo(bunker);
        const hostiles = room.hostileCreeps || [];
        for (let i = 0; i < hostiles.length; i++) {
            const c = hostiles[i];
            if (!c.hasActiveBodyparts(ATTACK) && !c.hasActiveBodyparts(RANGED_ATTACK)) continue;
            const range = fromPos.getRangeTo(c);
            if (range > 3) continue;
            if (range < bunkerRange || c.pos.getRangeTo(bunker) <= 1) return c;
        }
    }
    return bunker;
}

Creep.prototype.pickStrongholdTarget = function () {
    return pickStrongholdTarget(this.room, this.pos);
};

Creep.prototype.strongholdAttack = function (options = {}) {
    let destination = this.memory.destination;

    // Destination can be cleared by path failures or reassignment races.
    // RoomPosition throws if roomName is undefined (roomNameToXY → substr).
    if (!destination) {
        destination = recoverStrongholdDestination(this);
        if (!destination) {
            if (this.handleMilitaryCreep()) return;
            if (this.memory.colony && this.room.name !== this.memory.colony) {
                return this.shibMove(new RoomPosition(25, 25, this.memory.colony), {range: 24});
            }
            if (this.findDefensivePosition()) return;
            return;
        }
        this.memory.destination = destination;
    }

    const sentence = ['Gimme', 'The', 'Loot', destination];
    this.say(sentence[Game.time % sentence.length], true);

    if (this.room.name === destination) {
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

        const core = this.room.invaderCore || this.room.structures.find(s => s.structureType === STRUCTURE_INVADER_CORE);
        const target = pickStrongholdTarget(this.room, this.pos);
        if (target) this.memory.target = target.id;

        if (!core) {
            const container = this.room.containers.find((s) => _.sum(s.store) > (s.store[RESOURCE_ENERGY] || 0));
            if (container) {
                if (container.pos.checkForRampart()) this.memory.target = container.pos.checkForRampart().id;
                else {
                    const op = Memory.targetRooms[this.room.name] || Memory.auxiliaryTargets[this.room.name];
                    if (op) op.loot = true;
                }
            }
        }

        if (options.squadMove) return;

        if (target) {
            if (this.hasActiveBodyparts(RANGED_ATTACK) && this.fightRanged(target)) return;
            if (this.hasActiveBodyparts(ATTACK) && this.attackHostile(target)) return;
        }
        return;
    }

    if (options.squadMove) return;

    if (this.ensureDenialStaging) this.ensureDenialStaging();
    const dest = this.memory.misc && this.memory.misc.stagingRoom && !this.memory.misc.staged
        ? this.memory.misc.stagingRoom
        : destination;
    return this.shibMove(new RoomPosition(25, 25, dest), {range: 23});
};

/**
 * Recover a lost stronghold destination from partner memory or active ops.
 * @param {Creep} creep
 * @returns {string|undefined}
 */
function recoverStrongholdDestination(creep) {
    if (creep.memory.partner) {
        const partner = Game.getObjectById(creep.memory.partner);
        if (partner && partner.memory.destination) return partner.memory.destination;
    }
    if (Memory.targetRooms) {
        for (const roomName in Memory.targetRooms) {
            const op = Memory.targetRooms[roomName];
            if (op && op.type === 'stronghold') return roomName;
        }
    }
    if (Memory.auxiliaryTargets) {
        for (const roomName in Memory.auxiliaryTargets) {
            const op = Memory.auxiliaryTargets[roomName];
            if (op && op.type === 'stronghold') return roomName;
        }
    }
    return undefined;
}
