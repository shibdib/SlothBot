/**
 * Created by Bob on 7/2/2017.
 */
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

tacticSquadLeaderMedic = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let siege = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.siegeComplete === true);
    let inCombat = _.min(_.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.inCombat === true), 'hits');
    if (squadLeader.length === 0) this.memory.squadLeader = true;
    let targets = _.min(this.pos.findInRange(FIND_CREEPS, 8, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true}), 'hits');
    let armedHostile = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    if (!armedHostile || this.pos.getRangeTo(armedHostile) >= 6) {
        if (targets.id) {
            if (this.heal(targets) === ERR_NOT_IN_RANGE) {
                this.travelTo(targets);
                this.rangedHeal(targets);
            }
        } else if (inCombat.id) {
            this.travelTo(inCombat);
        }
        else if (this.memory.attackStarted !== true) {
            this.travelTo(new RoomPosition(25, 25, this.memory.staging), {range: 15});
            if (this.memory.attackTarget) {
                let nearbyAttackers = this.pos.findInRange(_.filter(Game.creeps, (a) => a.memory.attackTarget === this.memory.attackTarget && a.memory.role === 'attacker'), 35);
                let nearbyHealers = this.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === 'healer'), 35);
                let nearbyRanged = this.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === 'ranged'), 35);
                let nearbyDeconstructors = this.pos.findInRange(_.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.role === 'deconstructor'), 35);
                if ((nearbyRanged.length >= this.memory.waitForRanged && nearbyAttackers.length >= this.memory.waitForAttackers && nearbyHealers.length >= this.memory.waitForHealers && nearbyDeconstructors.length >= this.memory.waitForDeconstructor) || (this.attackType === 'raid' && _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget).length > 0) || (this.attackType === 'decon' && _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget).length > 0)) {
                    this.memory.attackStarted = true;
                }
            }
        } else if (this.memory.attackType === 'raid' || siege.length > 0) {
            this.travelTo(new RoomPosition(25, 25, this.memory.attackTarget), {range: 12});
        } else if (this.memory.attackType !== 'siege' || siege.length > 0) {
            this.travelTo(new RoomPosition(25, 25, this.memory.attackTarget), {range: 23});
        } else if (this.memory.attackType === 'siege') {
            this.travelTo(new RoomPosition(25, 25, this.memory.siegePoint), {range: 4});
        }
    } else if (targets.id && this.pos.getRangeTo(armedHostile) > this.pos.getRangeTo(targets)) {
        if (this.heal(targets) === ERR_NOT_IN_RANGE) {
            this.travelTo(targets);
            this.rangedHeal(targets);
        }
    } else {
        this.kite(8);
    }
};
Creep.prototype.tacticSquadLeaderMedic = profiler.registerFN(tacticSquadLeaderMedic, 'squadLeaderMedicTactic');

tacticMedic = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let targets = _.min(this.pos.findInRange(FIND_CREEPS, 6, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true}), 'hits');
    let armedHostile = this.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    if (!armedHostile || this.pos.getRangeTo(armedHostile) >= 5) {
        if (targets.id) {
            if (this.heal(targets) === ERR_NOT_IN_RANGE) {
                this.travelTo(targets);
                this.rangedHeal(targets);
            }
        }
        else if (this.pos.getRangeTo(squadLeader[0]) > 4) {
            this.travelTo(squadLeader[0]);
        }
    } else if (targets.id && this.pos.getRangeTo(armedHostile) > this.pos.getRangeTo(targets)) {
        if (this.heal(targets) === ERR_NOT_IN_RANGE) {
            this.travelTo(targets);
            this.rangedHeal(targets);
        }
    } else {
        this.kite(8);
    }
};
Creep.prototype.tacticMedic = profiler.registerFN(tacticMedic, 'tacticMedicTactic');