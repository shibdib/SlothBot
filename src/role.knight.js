/**
 * Created by Bob on 7/12/2017.
 */
module.exports.role = function (creep) {
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    if (!creep.getActiveBodyparts(ATTACK) && !creep.getActiveBodyparts(RANGED_ATTACK)) return creep.goHomeAndHeal();
    if (!this.handleMilitaryCreep(false, false)) {
        // Set squad leader
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === this.memory.overlord && c.memory.operation === 'borderPatrol' && c.memory.squadLeader);
        if (squadLeader.length) {
            if (this.room.name === squadLeader[0].room.name) this.shibMove(squadLeader[0], {range: 0}); else this.shibMove(new RoomPosition(25, 25, squadLeader[0].room.name), {range: 17});
            if (this.hits === this.hitsMax && squadLeader[0].hits < squadLeader[0].hitsMax) {
                this.heal(squadLeader[0]);
            } else if (this.hits < this.hitsMax) {
                this.heal(this);
            }
        }
    }
};
