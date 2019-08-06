/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function role(creep) {
    let sentence = [MY_USERNAME, 'Power', 'In', creep.memory.targetRoom, '?'];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    // If room is no longer a target
    if (!Memory.targetRooms[creep.memory.targetRoom]) return creep.memory.recycle = true;
    // Cache intel
    creep.room.cacheRoomIntel();
    // Travel to room
    if (creep.room.name !== creep.memory.targetRoom) return creep.shibMove(new RoomPosition(25, 25, creep.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    // Make sure it's not super far away
    let range = creep.room.findClosestOwnedRoom(true);
    // Determine if room is still suitable
    if (!creep.room.hostileCreeps.length && range <= 10) {
        let cache = Memory.targetRooms || {};
        cache[creep.room.name] = {
            tick: Game.time,
            type: 'power',
            level: 1,
            priority: 1
        };
        log.i(creep.room.name + ' - Has been marked for power mining');
        creep.room.cacheRoomIntel(true);
        Memory.targetRooms = cache;
        creep.memory.recycle = true;
    } else {
        creep.room.cacheRoomIntel(true);
        creep.memory.recycle = true;
        delete Memory.targetRooms[creep.room.name];
    }
};
