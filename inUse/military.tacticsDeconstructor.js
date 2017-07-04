/**
 * Created by rober on 7/3/2017.
 */
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

tacticSiege = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let armedHostile = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    if (!Game.flags[this.memory.attackTarget]) {
        this.travelTo(Game.flags[this.memory.staging]);
        this.memory.attackTarget = 'available';
    }
    if (Game.flags[this.memory.attackTarget] && this.pos.roomName === Game.flags[this.memory.attackTarget].pos.roomName) {
        if (this.pos.getRangeTo(armedHostile) <= 4) {
            this.travelTo(new RoomPosition(25, 25, this.memory.fallBackRoom), {range: 15});
            return true;
        } else {
            this.siege();
        }
    } else if (!squadLeader[0] || squadLeader[0].memory.attackStarted !== true) {
        this.memory.siege = undefined;
        this.memory.fallBackRoom = this.pos.roomName;
        this.travelTo(Game.flags[this.memory.staging]);
    } else {
        this.memory.siege = undefined;
        this.memory.fallBackRoom = this.pos.roomName;
        this.travelTo(Game.flags[this.memory.attackTarget], {allowHostile: false});
    }
};
Creep.prototype.tacticSiege = profiler.registerFN(tacticSiege, 'tacticSiegeTactic');
