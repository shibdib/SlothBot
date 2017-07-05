/**
 * Created by rober on 7/3/2017.
 */
let militaryFunctions = require('module.militaryFunctions');
const profiler = require('screeps-profiler');

let doNotAggress = RawMemory.segments[2];

tacticSiege = function () {
    let squadLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === this.memory.attackTarget && h.memory.squadLeader === true);
    let armedHostile = this.pos.findClosestByRange(FIND_HOSTILE_CREEPS, {filter: (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(doNotAggress, e.owner['username']) === false});
    if (!this.memory.attackTarget) {
        this.travelTo(new RoomPosition(25, 25, this.memory.staging), {range: 15});
        this.memory.attackTarget = 'available';
    }
    if (this.memory.attackTarget && this.pos.roomName === this.memory.attackTarget) {
        if (this.pos.getRangeTo(armedHostile) <= 4) {
            this.travelTo(new RoomPosition(25, 25, this.memory.siegePoint), {range: 15});
            return true;
        } else {
            this.siege();
        }
    } else if ((!squadLeader[0] || squadLeader[0].memory.attackStarted !== true) && this.memory.attackType !== 'decon') {
        this.memory.siege = undefined;
        this.memory.fallBackRoom = this.pos.roomName;
        this.travelTo(new RoomPosition(25, 25, this.memory.staging), {range: 15});
    } else if (this.memory.siegeStarted !== true) {
        this.memory.siege = undefined;
        this.memory.fallBackRoom = this.pos.roomName;
        if (this.pos.getRangeTo(new RoomPosition(25, 25, this.memory.siegePoint)) > 17) {
            this.travelTo(new RoomPosition(25, 25, this.memory.siegePoint), {range: 15});
        } else {
            this.memory.siegeStarted = true;
        }
    } else {
        this.memory.siege = undefined;
        this.memory.fallBackRoom = this.pos.roomName;
        this.travelTo(new RoomPosition(25, 25, this.memory.attackTarget), {range: 24});
    }
};
Creep.prototype.tacticSiege = profiler.registerFN(tacticSiege, 'tacticSiegeTactic');