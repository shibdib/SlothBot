Creep.prototype.powerScout = function () {
    let sentence = [MY_USERNAME, 'Power', 'In', this.memory.targetRoom, '?'];
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
    // Make sure it's not super far away
    let range = this.room.findClosestOwnedRoom(true);
    // Determine if room is still suitable
    if (!this.room.hostileCreeps.length && range <= 10) {
        let cache = Memory.targetRooms || {};
        cache[this.room.name] = {
            tick: Game.time,
            type: 'power',
            level: 1,
            priority: 1
        };
        log.i(this.room.name + ' - Has been marked for power mining');
        this.room.cacheRoomIntel(true);
        Memory.targetRooms = cache;
        this.memory.recycle = true;
    } else {
        this.room.cacheRoomIntel(true);
        this.memory.recycle = true;
        delete Memory.targetRooms[this.room.name];
    }
};