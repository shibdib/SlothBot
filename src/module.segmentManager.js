module.exports.manager = function () {
    RawMemory.setActiveSegments([0, 98]);

    // Track allied requests
    logRequests();

    // Make requests
    if (Game.time % 50 === 0) makeRequests();
}

function logRequests() {
    if (!LOANcheck) return;
    // Store last tick
    if (RawMemory.foreignSegment) {
        ALLY_HELP_REQUESTS[RawMemory.foreignSegment.username] = JSON.parse(RawMemory.foreignSegment.data);
    }
    // Lookup and store for review next tick
    let filtered = _.filter(FRIENDLIES, (f) => f !== MY_USERNAME);
    if (filtered.length) {
        try {
            RawMemory.setActiveForeignSegment(filtered[Game.time % filtered.length], 98);
        } catch (e) {
        }
    }
}

function makeRequests() {
    RawMemory.setPublicSegments([98])
    RawMemory.setDefaultPublicSegment(98)
    let requestArray = [];
    // Energy requests
    let energyRooms = _.filter(Memory.myRooms, (r) => Game.rooms[r].energyState < 2 && Game.rooms[r].terminal);
    for (let room of energyRooms) {
        if (room) {
            let priority = 0.1;
            if (Game.rooms[room].memory.spawnDefenders) priority = 1;
            else if (!Game.rooms[room].energyState) priority = 1 - (Game.rooms[room].energy / ENERGY_AMOUNT[Game.rooms[room].level]);
            requestArray.push(
                {
                    requestType: 0,
                    resourceType: RESOURCE_ENERGY,
                    maxAmount: 10000,
                    roomName: room,
                    priority: priority
                }
            )
        }
    }

    // Base requests
    let terminalRooms = _.filter(Memory.myRooms, (r) => Game.rooms[r].terminal);
    for (let room of terminalRooms) {
        for (let resource of BASE_MINERALS) {
            if (!Memory.ownedMinerals.includes(resource) && Game.rooms[room].store(resource) < REACTION_AMOUNT * 2) {
                let priority = 0.1;
                if (Game.rooms[room].store(resource) < REACTION_AMOUNT) priority = 1 - (Game.rooms[room].store(resource) / REACTION_AMOUNT);
                requestArray.push(
                    {
                        requestType: 0,
                        resourceType: resource,
                        maxAmount: REACTION_AMOUNT,
                        roomName: room,
                        priority: priority
                    }
                )
            }
        }
    }

    // Boost requests
    for (let room of terminalRooms) {
        for (let boost of BUY_THESE_BOOSTS) {
            if (Game.rooms[room].store(boost) < BOOST_AMOUNT) {
                requestArray.push(
                    {
                        requestType: 0,
                        resourceType: boost,
                        maxAmount: BOOST_AMOUNT - Game.rooms[room].store(boost),
                        roomName: room,
                        priority: 0.5
                    }
                )
            }
        }
    }

    // Ghodium requests
    for (let room of terminalRooms) {
        if (Game.rooms[room].store(RESOURCE_GHODIUM) < NUKER_GHODIUM_CAPACITY) {
            requestArray.push(
                {
                    requestType: 0,
                    resourceType: RESOURCE_GHODIUM,
                    maxAmount: NUKER_GHODIUM_CAPACITY - Game.rooms[room].store(RESOURCE_GHODIUM),
                    roomName: room,
                    priority: 0.5
                }
            )
        }
    }

    // Defense requests
    let defenseRooms = _.filter(Memory.myRooms, (r) => Game.rooms[r].memory.dangerousAttack);
    for (let room of defenseRooms) {
        let priority = 0.5;
        if (Memory.roomCache[room].threatLevel === 4) priority = 1;
        requestArray.push(
            {
                requestType: 1,
                roomName: room,
                priority: priority
            }
        )
    }

    // Attack Requests
    if (_.size(Game.flags)) {
        let requestFlag = _.find(Game.flags, (f) => _.startsWith(f.name, 'request'))
        if (requestFlag) {
            requestArray.push(
                {
                    requestType: 2,
                    roomName: requestFlag.pos.roomName,
                    priority: requestFlag.name.match(/\d+$/)[0] || 0.5
                }
            )
        }
    }
    RawMemory.segments[98] = JSON.stringify(requestArray);
}