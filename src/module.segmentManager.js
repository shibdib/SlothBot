module.exports.segmentManager = function () {
//Alliance List Management
    let doNotAggressArray;
    if (!!~['shard0', 'shard1', 'shard2', 'shard3'].indexOf(Game.shard.name)) {
        doNotAggressArray = LOANlist;
        doNotAggressArray = _.union(doNotAggressArray, MANUAL_FRIENDS);
    } else {
        doNotAggressArray = [MY_USERNAME];
        doNotAggressArray = _.union(doNotAggressArray, MANUAL_FRIENDS);
    }
    global.FRIENDLIES = doNotAggressArray;
    if (Game.time % 100 === 0) {
        let helpNeeded = [];
        if (Memory.ownedRooms) {
            let requestSupport = _.filter(Memory.ownedRooms, (r) => Game.rooms[r.name].memory.threatLevel >= 4);
            requestSupport.forEach((r) => helpNeeded.push(r.name));
        }
        RawMemory.segments[2] = JSON.stringify(doNotAggressArray);
        // Store your requests for help into segment 22, to use this create an array with the rooms needing assistance called helpNeeded
        if (helpNeeded && helpNeeded.length && JSON.stringify(helpNeeded) !== RawMemory.segments[22]) RawMemory.segments[22] = JSON.stringify(helpNeeded);
    }
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
    if (Game.time % 100 === 0) {
        let attackNeeded = [];
        if (attackNeeded && attackNeeded.length && JSON.stringify(attackNeeded) !== RawMemory.segments[23]) RawMemory.segments[23] = JSON.stringify(attackNeeded);
    }
    // Every 33 ticks check to see if friends need help or not and if they do store them in Memory._alliedRoomDefense in array format
    if (Game.time % 33 === 0 && LOANlist && LOANlist.length) {
        let helpRequested;
        let attackArray = Memory._alliedRoomAttack || [];
        for (let user of LOANlist) {
            let allianceUserAttack = RawMemory.setActiveForeignSegment(user, 23);
            if (allianceUserAttack && JSON.parse(allianceUserAttack).length) {
                helpRequested = true;
                JSON.parse(allianceUserAttack).forEach((r) => attackArray.push(r));
            }
        }
        if (helpRequested) Memory._alliedRoomAttack = attackArray; else Memory._alliedRoomAttack = undefined;
    }
    // Set segment as public/active
    RawMemory.setPublicSegments([2, 22, 23]);
    RawMemory.setActiveSegments([2, 22, 23]);
};