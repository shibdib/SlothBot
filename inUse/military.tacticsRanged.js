/**
 * Created by Bob on 7/2/2017.
 */
const profiler = require('screeps-profiler');

rangedTeamLeader = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let siege = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.siegeComplete === true);
    let healers = _.filter(Game.creeps, (h) => h.memory.role === 'healer');
    let hostiles = this.room.find(FIND_CREEPS, {filter: (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false});
    let hostileStructures = this.room.find(FIND_HOSTILE_STRUCTURES, {filter: (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTROLLER && _.includes(RawMemory.segments[2], s.owner['username']) === false});
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeArmed = this.pos.findInRange(armedHostile, 3);
    let closestArmed = this.pos.findClosestByPath(armedHostile);
    let closestHostile = this.pos.findClosestByPath(hostiles);
    let nearbyHealers = this.pos.findInRange(healers, 5);
    let farHealers = this.pos.findInRange(healers, 15);

    //Retreat if wounded
    if (this.getActiveBodyparts(TOUGH) === 0) {
        this.heal(this);
        if (inRangeArmed.length > 1) {
            this.rangedMassAttack();
        } else if (inRangeArmed.length === 1) {
            this.rangedAttack(inRangeArmed[0]);
        }
        if (nearbyHealers.length > 0) {
            this.travelTo(nearbyHealers[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else if (squadLeader.length > 0) {
            this.travelTo(squadLeader[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else if (farHealers.length > 0) {
            this.travelTo(farHealers[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else {
            this.retreat();
        }
    }
    if (this.hits < this.hitsMax) {
        this.heal(this);
    }
    //Check if safe mode
    if (this.room.controller && this.room.controller.owner && _.includes(RawMemory.segments[2], this.room.controller.owner['username']) === false && this.room.controller.safeMode) {
        this.memory.attackStarted = 'safe';
        Memory.warControl[this.memory.attackTarget] = undefined;
        Memory.militaryNeeds[this.memory.attackTarget] = undefined;
        this.travelTo(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    }
    if (closestArmed || closestHostile) {
        this.memory.inCombat = true;
        this.borderCheck();
        if (closestArmed) {
            this.memory.rangedTarget = closestArmed.id;
            this.fightRanged(closestArmed);
        } else if (closestHostile) {
            this.memory.rangedTarget = closestHostile.id;
            this.fightRanged(closestHostile);
        }
    } else if (hostileStructures.length > 0 && (!this.memory.attackTarget || this.pos.roomName === this.memory.attackTarget)) {
        this.memory.inCombat = true;
        this.borderCheck();
        let inRangeStructure = this.pos.findInRange(hostileStructures, 3);
        if (inRangeStructure.length > 0) {
            this.memory.rangedTarget = inRangeStructure[0].id;
            this.fightRanged(inRangeStructure[0]);
        } else {
            this.travelTo(this.pos.findClosestByPath(hostileStructures));
        }
    } else if (squadLeader[0] && this.pos.roomName === squadLeader[0].pos.roomName) {
        this.memory.inCombat = undefined;
        if (this.pos.getRangeTo(squadLeader[0]) > 4) {
            this.travelTo(squadLeader[0], {allowHostile: true, movingTarget: true});
        }
    } else if (this.memory.attackType === 'raid' || siege.length > 0) {
        this.memory.inCombat = undefined;
        this.travelTo(new RoomPosition(25, 25, this.memory.attackTarget), {range: 12});
    } else if (squadLeader[0].memory.attackStarted !== true) {
        this.memory.rangedTarget = undefined;
        this.travelTo(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    } else if (this.memory.attackType !== 'siege' || siege.length > 0) {
        this.memory.inCombat = undefined;
        this.travelTo(new RoomPosition(25, 25, this.memory.attackTarget), {range: 23});
    } else if (this.memory.attackType === 'siege') {
        this.travelTo(new RoomPosition(25, 25, this.memory.siegePoint), {range: 15});
    }
};
Creep.prototype.rangedTeamLeader = profiler.registerFN(rangedTeamLeader, 'rangedTeamTactic');

rangedTeamMember = function () {
    this.borderCheck();
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let rangedLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.rangedLeader === true);
    let healers = _.filter(Game.creeps, (h) => h.memory.role === 'healer');
    let hostiles = this.room.find(FIND_CREEPS, {filter: (c) => c.pos.y < 47 && c.pos.y > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false});
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeHostile = this.pos.findInRange(hostiles, 3);
    let inRangeArmed = this.pos.findInRange(armedHostile, 3);
    let closestArmed;
    let closestHostile;
    closestArmed = this.pos.findClosestByPath(inRangeArmed);
    closestHostile = this.pos.findClosestByPath(inRangeHostile);
    let nearbyHealers = this.pos.findInRange(healers, 5);
    let farHealers = this.pos.findInRange(healers, 15);
    let needsHeals = this.pos.findInRange(FIND_CREEPS, 3, {filter: (c) => c.hits < c.hitsMax && _.includes(RawMemory.segments[2], c.owner['username']) === true});
    if (rangedLeader.length === 0) this.memory.rangedLeader = true;

    //Retreat if wounded
    if (this.hits < this.hitsMax * 0.75) {
        this.heal(this);
        if (inRangeArmed.length > 1) {
            this.rangedMassAttack();
        } else if (inRangeArmed.length === 1) {
            this.rangedAttack(inRangeArmed[0]);
        }
        if (nearbyHealers.length > 0) {
            this.travelTo(nearbyHealers[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else if (squadLeader.length > 0) {
            this.travelTo(squadLeader[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else if (farHealers.length > 0) {
            this.travelTo(farHealers[0], {allowHostile: false, range: 0, repath: 1, movingTarget: true});
            return null;
        } else {
            this.retreat(this);
        }
    } else if (this.hits < this.hitsMax) {
        this.heal(this);
    }

    //
    if (rangedLeader[0]) {
        if (this.pos.getRangeTo(rangedLeader[0]) > 4) {
            if (this.room.name !== rangedLeader[0].pos.roomName) {
                this.travelTo(rangedLeader[0], {allowHostile: true});
            } else {
                this.travelTo(rangedLeader[0], {allowHostile: true, movingTarget: true});
            }
        }
    }
    if (this.pos.getRangeTo(rangedLeader[0].memory.rangedTarget) <= 3) {
        if (this.pos.getRangeTo(closestArmed) <= 2) {
            this.fightRanged(closestArmed);
        } else {
            this.fightRanged(Game.getObjectById(rangedLeader[0].memory.rangedTarget));
        }
    } else if (closestArmed && this.pos.getRangeTo(closestArmed) <= 3) {
        this.fightRanged(closestArmed);
    } else if (closestHostile && this.pos.getRangeTo(closestHostile) <= 3) {
        this.fightRanged(closestHostile);
    } else {
        if (needsHeals.length > 0) {
            this.rangedHeal(needsHeals[0])
        }
    }
};
Creep.prototype.rangedTeamMember = profiler.registerFN(rangedTeamMember, 'rangedTeamMemberTactic');