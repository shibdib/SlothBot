/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    //Cache intel
    creep.room.cacheRoomIntel();
    //Initial move
    if (creep.pos.roomName !== creep.memory.destination) return creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 17});
    //Generate Discussion
    if (!creep.memory.sentence) {
        let roomIntel = Memory.roomCache[creep.pos.roomName];
        let sentence = ['Hello', roomIntel.user, 'I am', 'an', 'envoy', 'from', MY_USERNAME];
        if (Memory._badBoyList[roomIntel.user]) sentence = sentence.concat(['You', 'have a', 'threat', 'rating', 'of', Memory._badBoyList[roomIntel.user].threatRating]);
        if (creep.room.controller.ticksToDowngrade && creep.room.controller.ticksToDowngrade <= 10000) sentence = sentence.concat(['Your', 'controller', 'appears', 'to be', 'down', 'grading.']);
        if (creep.room.terminal && _.sum(creep.room.terminal.store) >= creep.room.terminal.storeCapacity * 0.95) sentence = sentence.concat(['Your', 'terminal', 'is', 'awfully', 'full.']);
        if (creep.room.storage && _.sum(creep.room.storage.store) >= creep.room.storage.storeCapacity * 0.95) sentence = sentence.concat(['Your', 'storage', 'is', 'awfully', 'full.']);
        if (_.filter(creep.room.structures, (s) => (s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART) && s.hits < 1000000)) sentence = sentence.concat(['HA!', 'you', 'have a', 'barrier', 'below', '1 mil', 'you', 'peasant!']);
        if (Math.random() > 0.5 || sentence.length === 7) {
            let str = _.sample(["Did you ever hear the Tragedy of Darth Plagueis the wise? I thought not. It's not a story the Jedi would tell you. It's a Sith legend. Darth Plagueis was a Dark Lord of the Sith, so powerful and so wise he could use the Force to influence the midichlorians to create life... He had such a knowledge of the dark side that he could even keep the ones he cared about from dying. The dark side of the Force is a pathway to many abilities some consider to be unnatural. He became so powerful... the only thing he was afraid of was losing his power, which eventually, of course, he did. Unfortunately, he taught his apprentice everything he knew, then his apprentice killed him in his sleep. It's ironic he could save others from death, but not himself.", "What the fuck did you just fucking say about me, you little bitch? I’ll have you know I graduated top of my class in the Navy Seals, and I’ve been involved in numerous secret raids on Al-Quaeda, and I have over 300 confirmed kills. I am trained in gorilla warfare and I’m the top sniper in the entire US armed forces. You are nothing to me but just another target. I will wipe you the fuck out with precision the likes of which has never been seen before on this Earth, mark my fucking words. You think you can get away with saying that shit to me over the Internet? Think again, fucker. As we speak I am contacting my secret network of spies across the USA and your IP is being traced right now so you better prepare for the storm, maggot. The storm that wipes out the pathetic little thing you call your life. You’re fucking dead, kid. I can be anywhere, anytime, and I can kill you in over seven hundred ways, and that’s just with my bare hands. Not only am I extensively trained in unarmed combat, but I have access to the entire arsenal of the United States Marine Corps and I will use it to its full extent to wipe your miserable ass off the face of the continent, you little shit. If only you could have known what unholy retribution your little “clever” comment was about to bring down upon you, maybe you would have held your fucking tongue. But you couldn’t, you didn’t, and now you’re paying the price, you goddamn idiot. I will shit fury all over you and you will drown in it. You’re fucking dead, kiddo."]);
            sentence = str.split(" ");
        }
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
        if (creep.pos.checkForRoad()) {
            creep.moveRandom();
        }
    }
};