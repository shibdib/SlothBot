const profiler = require('screeps-profiler');

function segmentManager() {
//Alliance List Management
    let doNotAggressArray;
    if (!!~['shard0', 'shard1', 'shard2'].indexOf(Game.shard.name)) {
        doNotAggressArray = LOANlist;
        doNotAggressArray.concat(MANUAL_FRIENDS);
        doNotAggressArray.push(MY_USERNAME);
    } else {
        doNotAggressArray = [MY_USERNAME];
        doNotAggressArray = doNotAggressArray.concat(MANUAL_FRIENDS)
    }
    let helpNeeded = [];
    if (Memory.ownedRooms) {
        let requestSupport = _.filter(Memory.ownedRooms, (r) => Game.rooms[r.name].memory.threatLevel >= 4);
        requestSupport.forEach((r) => helpNeeded.push(r.name));
    }
    RawMemory.segments[2] = JSON.stringify(doNotAggressArray);
    // Store your requests for help into segment 22, to use this create an array with the rooms needing assistance called helpNeeded
    if (helpNeeded && helpNeeded.length && JSON.stringify(helpNeeded) !== RawMemory.segments[22]) RawMemory.segments[22] = JSON.stringify(helpNeeded);
    // Set segment as public/active
    RawMemory.setPublicSegments([2, 22]);
    RawMemory.setActiveSegments([2, 22]);
    // Every 33 ticks check to see if friends need help or not and if they do store them in Memory._alliedRoomDefense in array format
    if (Game.time % 33 === 0 && LOANlist && LOANlist.length) {
        let helpRequested;
        let defenseArray = Memory._alliedRoomDefense || [];
        for (let user of LOANlist) {
            let allianceUserDefend = RawMemory.setActiveForeignSegment(user, 22);
            if (allianceUserDefend && JSON.parse(allianceUserDefend).length) {
                helpRequested = true;
                JSON.parse(allianceUserDefend).forEach((r) => defenseArray.push(r));
            }
        }
        if (helpRequested) Memory._alliedRoomDefense = defenseArray; else Memory._alliedRoomDefense = undefined;
    }
}

module.exports.segmentManager = profiler.registerFN(segmentManager, 'segmentManager');