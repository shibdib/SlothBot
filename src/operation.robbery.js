/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.robRoom = function () {
    let sentence = ['Gimme', 'The', 'Loot', this.memory.destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Return resources
    if (this.isFull || this.memory.hauling) {
        if (!_.sum(this.store)) return this.memory.hauling = undefined; else this.memory.hauling = true;
        this.memory.closestRoom = this.memory.closestRoom || findClosestOwnedRoom(this.room.name, false, 4);
        let deliver = Game.rooms[this.memory.closestRoom].terminal || Game.rooms[this.memory.closestRoom].storage;
        if (deliver) {
            for (let resourceType in this.store) {
                switch (this.transfer(deliver, resourceType)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        this.shibMove(deliver);
                        break;
                }
            }
        }
    } else if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 24});
    } else {
        let lootTarget = _.find(this.room.structures, (s) => (s.structureType === STRUCTURE_STORAGE || s.structureType === STRUCTURE_TERMINAL || s.structureType === STRUCTURE_CONTAINER) && _.sum(s.store) > 0);
        if (lootTarget) {
            Memory.auxiliaryTargets[this.room.name].tick = Game.time;
            for (let resourceType in lootTarget.store) this.withdrawResource(lootTarget, resourceType);
        } else {
            this.memory.hauling = true;
            Memory.auxiliaryTargets[this.room.name] = undefined;
            this.room.cacheRoomIntel(true);
        }
    }
};