Creep.prototype.claimScout = function () {
    let sentence = [MY_USERNAME, 'Scout', 'Drone', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // If room is no longer a target
    if (!Memory.targetRooms[this.memory.targetRoom]) return this.memory.recycle = true;
    // Cache intel
    this.room.cacheRoomIntel();
    // Travel to room
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    // Determine if room is still suitable
    if (this.room.controller && !this.room.controller.owner && !this.room.controller.reservation && !this.findClosestEnemy()) {
        let closestRoom = this.room.findClosestOwnedRoom();
        Game.rooms[closestRoom].memory.claimTarget = this.room.name;
        Memory.lastExpansion = Game.time;
        log.i(this.room.name + ' - Has been marked for claiming');
        Game.notify(this.room.name + ' - Has been marked for claiming');
        this.room.cacheRoomIntel(true);
        delete Memory.targetRooms[this.room.name];
    } else {
        this.room.cacheRoomIntel(true);
        delete Memory.targetRooms[this.room.name];
    }
};