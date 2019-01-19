/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Initial move
    if (!creep.pos.roomName !== creep.memory.destination) creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 17});
    //Cache intel
    creep.room.cacheRoomIntel();
    //Generate Discussion
    if (!creep.memory.sentence) {
        let roomIntel = Memory.roomCache[creep.pos.roomName];
        let sentence = ['Hello', roomIntel.user, 'I am', 'an', 'envoy', 'from', MY_USERNAME];
        if (Memory._badBoyList[roomIntel.user]) sentence = sentence.concat(['You', 'have a', 'threat', 'rating', 'of', Memory._badBoyList[roomIntel.user].threatRating]);
        if (creep.room.controller.ticksToDowngrade && creep.room.controller.ticksToDowngrade <= 10000) sentence = sentence.concat(['Your', 'controller', 'appears', 'to be', 'down', 'grading']);
        if (creep.room.terminal && _.sum(creep.room.terminal.store) >= creep.room.terminal.storeCapacity * 0.95) sentence = sentence.concat(['Your', 'terminal', 'is', 'awfully', 'full']);
        if (creep.room.storage && _.sum(creep.room.storage.store) >= creep.room.storage.storeCapacity * 0.95) sentence = sentence.concat(['Your', 'storage', 'is', 'awfully', 'full']);
        creep.memory.sentence = sentence;
    } else {
        let count = creep.memory.count || 0;
        let word = Game.time % creep.memory.sentence.length;
        creep.say(creep.memory.sentence[word], true);
        creep.memory.count = count + 1;
        if (creep.memory.count >= creep.memory.sentence.length) {
            creep.memory.sentence = undefined;
            creep.memory.count = 0;
        }
        creep.moveRandom();
    }
};