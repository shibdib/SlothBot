Creep.prototype.scoutRoom = function () {
    let sentence = [MY_USERNAME, 'Scout', 'Drone', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    this.room.cacheRoomIntel();
    // If room is no longer a target
    if (!Memory.targetRooms[this.room.name]) return this.memory.recycle = true;
};