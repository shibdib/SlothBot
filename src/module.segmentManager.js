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
    if (RawMemory.foreignSegment && FRIENDLIES.includes(RawMemory.foreignSegment.username) && RawMemory.foreignSegment.id === 98) {
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
            else if (!Game.rooms[room].energyState) priority = _.round(1 - (Game.rooms[room].energy / ENERGY_AMOUNT[Game.rooms[room].level]), 2);
            requestArray.push(
                {
                    requestType: 0,
                    resourceType: RESOURCE_ENERGY,
                    maxAmount: ENERGY_AMOUNT[Game.rooms[room].level] - Game.rooms[room].energy,
                    roomName: room,
                    priority: priority
                }
            )
        }
    }

    // Base mineral requests && Boost requests
    if (Memory.saleTerminal) {
        for (let resource of BASE_MINERALS) {
            if (Game.rooms[Memory.saleTerminal.room].store(resource) < REACTION_AMOUNT * 3) {
                let priority = 0.1;
                requestArray.push(
                    {
                        requestType: 0,
                        resourceType: resource,
                        maxAmount: (REACTION_AMOUNT * 3) - Game.rooms[Memory.saleTerminal.room].store(resource),
                        roomName: Memory.saleTerminal.room,
                        priority: priority
                    }
                )
            }
        }
        for (let boost of BUY_THESE_BOOSTS) {
            if (Game.rooms[Memory.saleTerminal.room].store(boost) < BOOST_AMOUNT * 3) {
                requestArray.push(
                    {
                        requestType: 0,
                        resourceType: boost,
                        maxAmount: (BOOST_AMOUNT * 3) - Game.rooms[Memory.saleTerminal.room].store(boost),
                        roomName: Memory.saleTerminal.room,
                        priority: 0.1
                    }
                )
            }
        }
    }

    // Ghodium requests
    let terminalRooms = _.filter(Memory.myRooms, (r) => Game.rooms[r].terminal);
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
    let defenseRooms = _.filter(Memory.myRooms, (r) => Game.rooms[r].memory.dangerousAttack || Game.rooms[r].memory.defenseCooldown > Game.time);
    for (let room of defenseRooms) {
        let priority = 0.25;
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