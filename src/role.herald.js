/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //ANNOUNCE
    let signs = OWNED_ROOM_SIGNS;
    if (creep.memory.inPlace) {
        let sentence = ['-', '#overlords', '-'];
        if (creep.room.memory.responseNeeded) {
            if (creep.room.memory.threatLevel === 1) sentence = sentence.concat(['FPCON', 'ALPHA']);
            if (creep.room.memory.threatLevel === 2) sentence = sentence.concat(['FPCON', 'BRAVO']);
            if (creep.room.memory.threatLevel === 3) sentence = sentence.concat(['FPCON', 'CHARLIE']);
            if (creep.room.memory.threatLevel >= 4) sentence = sentence.concat(['FPCON', 'DELTA']);
        } else {
            sentence = sentence.concat(['FPCON', 'NORMAL'])
        }
        if (Memory._badBoyArray && Memory._badBoyArray.length) {
            sentence = sentence.concat(['-', 'THREAT', 'LIST', '-']);
            sentence = sentence.concat(Memory._badBoyArray);
        }
        if (Memory._friendsArray && Memory._friendsArray.length > 1) {
            sentence = sentence.concat(['-', 'FRIENDS', 'LIST', '-']);
            sentence = sentence.concat(Memory._friendsArray);
        }
        let word = Game.time % sentence.length;
        creep.say(sentence[word], true);
    } else {
        if (!creep.memory.signed && (!creep.room.controller.sign || creep.room.controller.sign.username !== MY_USERNAME)) {
            switch (creep.signController(creep.room.controller, _.sample(signs))) {
                case OK:
                    creep.memory.signed = true;
                    break;
                case ERR_NOT_IN_RANGE:
                    return creep.shibMove(creep.room.controller, {range: 1});
            }
        } else if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        } else {
            creep.memory.inPlace = true;
            delete creep.memory._shibMove;
        }
    }
};