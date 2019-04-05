/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.room.cacheRoomIntel();
    let sayings = EXPLORER_SPAM;
    creep.say(_.sample(sayings), true);
    if (!creep.memory.destination) {
        let adjacent = Game.map.describeExits(creep.pos.roomName);
        let possibles;
        possibles = _.filter(adjacent, (r) => !Memory.roomCache[r] || Memory.roomCache[r].cached + 1501 > Game.time);
        if (!possibles.length) possibles = adjacent;
        let target = _.sample(possibles);
        if (!Game.map.isRoomAvailable(target)) return creep.say("??");
        creep.memory.destination = target;
    }
    if (creep.memory.destinationReached !== true) {
        if (creep.pos.roomName === creep.memory.destination) {
            if (creep.room.controller && !creep.room.controller.owner && (!creep.room.controller.reservation || !_.includes(FRIENDLIES, creep.room.controller.reservation.username))) {
                if (creep.room.controller.sign && creep.room.controller.sign.username === MY_USERNAME) {
                    return creep.memory.destinationReached = true;
                }
                let signs = EXPLORED_ROOM_SIGNS;
                if (Memory.roomCache[creep.room.name].claimValue) signs = ['Overlord AI Room Claim Value - ' + Memory.roomCache[creep.room.name].claimValue, 'Claim Value of ' + Memory.roomCache[creep.room.name].claimValue];
                if (Memory.roomCache[creep.room.name].needsCleaning) signs = ['Overlord AI Has Marked This Room For Cleaning', 'Overlord AI finds this room filthy, I will return to clean it'];
                if (Memory.roomCache[creep.room.name].potentialTarget) signs = ['Overlord AI Finds This Room Interesting, We Will Return', 'This room has been marked for cleansing by an overlord AI'];
                switch (creep.signController(creep.room.controller, _.sample(signs))) {
                    case OK:
                        creep.memory.destinationReached = true;
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(creep.room.controller, {offRoad: true});
                }
            } else if (!creep.moveToHostileConstructionSites(true)) {
                creep.memory.destinationReached = true;
            }
        } else {
            creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {
                allowHostile: true,
                offRoad: true
            });
        }
    } else {
        creep.memory.destination = undefined;
        creep.memory.destinationReached = undefined;
    }
};