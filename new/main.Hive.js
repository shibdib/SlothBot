let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');
let defense = require('military.defense');
let links = require('module.linkController');
let observers = require('module.observerController');

function mind() {
    Memory.ownedRooms = shuffle(_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner['username'] === 'Shibdib'));
    let cpuBucket = Game.cpu.bucket;

    // Handle Defense
    defense.controller();

    // Handle Links
    if (Game.time % 10 === 0) links.linkControl();

    //Observer Control
    observers.observerControl();

    // Process Overlords
    let processed = 0;
    let activeClaim;
    let overlordCount = Memory.ownedRooms.length;
    for (let key in Memory.ownedRooms) {
        let activeRoom = Memory.ownedRooms[key];
        if (!activeRoom.memory._caches) activeRoom.memory._caches = {};
        let cpuUsed = Game.cpu.getUsed();
        let cpuLimit = Game.cpu.limit - cpuUsed;
        let cpuTickLimit = Game.cpu.tickLimit - cpuUsed;
        let roomLimit = cpuLimit / (overlordCount - processed);
        if (cpuBucket > 2000) roomLimit = cpuTickLimit / (overlordCount - processed);
        overlord.overlordMind(activeRoom, roomLimit);
        //Expansion Manager
        if (Game.time % 500 === 0 && !activeRoom.memory.activeClaim && activeRoom.controller.level >= 4 && Game.gcl.level - 2 > overlordCount && !activeClaim) {
            activeRoom.claimNewRoom();
        }
        processed++;
    }
}
module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');

function shuffle(array) {
    let counter = array.length;

    // While there are elements in the array
    while (counter > 0) {
        // Pick a random index
        let index = Math.floor(Math.random() * counter);

        // Decrease counter by 1
        counter--;

        // And swap the last element with it
        let temp = array[counter];
        array[counter] = array[index];
        array[index] = temp;
    }

    return array;
}