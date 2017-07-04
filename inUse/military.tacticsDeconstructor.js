/**
 * Created by rober on 7/3/2017.
 */
let borderChecks = require('module.borderChecks');
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

tacticSiege = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let targets = this.pos.findInRange(FIND_CREEPS, 3, {filter: (c) => c.hits < c.hitsMax && _.includes(doNotAggress, c.owner['username']) === true});
    let armedHostile = this.pos.findClosestByPath(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    if (this.pos.roomName === Game.flags[this.memory.attackTarget].pos.roomName) {
        if (this.pos.getRangeTo(armedHostile) <= 2) {
            this.fleeFromHostile(armedHostile);
        } else {
            this.siege();
        }
    } else if (squadLeader[0].memory.attackStarted !== true || !squadLeader[0]) {
        this.travelTo(Game.flags[this.memory.staging]);
    } else {
        this.travelTo(Game.flags[this.memory.attackTarget], {allowHostile: false});
    }
};
Creep.prototype.tacticSiege = profiler.registerFN(tacticSiege, 'tacticSiegeTactic');
