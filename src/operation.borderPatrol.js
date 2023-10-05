/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.borderPatrol = function () {
    let sentence = [ICONS.border, 'Border', 'Patrol'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Handle combat
    if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
        if (this.handleMilitaryCreep() || this.scorchedEarth()) return; else return this.shibKite();
    } else if (!this.healCreeps() && !this.memory.destination) {
        // Check neighbors
        let adjacent = _.filter(Game.map.describeExits(this.pos.roomName), (r) => INTEL[r] && INTEL[r].threatLevel)[0] || _.filter(Game.map.describeExits(this.pos.roomName), (r) => INTEL[r] && INTEL[r].roomHeat)[0];
        if (adjacent) {
            return this.memory.destination = adjacent;
        }
        if (!this.memory.awaitingOrders) {
            // If on target, be available to respond
            if (!this.memory.onTarget) this.memory.onTarget = Game.time;
            // Don't idle in SK rooms, go home
            if (INTEL[this.room.name] && INTEL[this.room.name].sk) return this.memory.destination = this.memory.overlord;
            // Idle in target rooms for 25 ticks then check if adjacent rooms need help or mark yourself ready to respond
            if (this.memory.onTarget + 25 <= Game.time) {
                this.memory.destination = undefined;
                this.memory.awaitingOrders = true;
                this.memory.onTarget = undefined;
            } else {
                this.idleFor(5);
            }
        }
    } else if (this.memory.destination && this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
    if (this.memory.destination && this.room.name === this.memory.destination && !this.room.hostileCreeps.length && !this.room.hostileStructures.length) this.memory.destination = undefined;
};

function offDuty(creep, partner = undefined) {
    if (!creep.healCreeps()) {
        let latestAttack = _.max(_.filter(INTEL, (r) => r.roomHeat > 0 && Game.map.getRoomLinearDistance(r.name, creep.memory.overlord) <= 2 && !r.threatLevel), 'roomHeat');
        if (latestAttack && latestAttack.name && latestAttack.name !== creep.room.name) {
            return creep.shibMove(new RoomPosition(25, 25, latestAttack.name), {range: 8})
        } else if (!latestAttack && creep.room.name !== creep.memory.overlord) {
            return creep.shibMove(new RoomPosition(25, 25, creep.memory.overlord), {range: 8})
        }
        if (!partner || partner.pos.isNearTo(creep)) {
            if (partner) partner.idleFor(10)
            return creep.idleFor(10);
        } else if (partner) {
            return partner.shibMove(this, {range: 0});
        }
    }
}