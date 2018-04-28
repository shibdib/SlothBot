Creep.prototype.scoutRoom = function () {
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    this.room.cacheRoomIntel(true);
    // Get current operations
    let totalCount = 0;
    if (_.size(Memory.targetRooms)) {
        totalCount = _.size(_.filter(Memory.targetRooms, (t) => t.type !== 'attack'));
    }
    // Chance it gets delayed
    if (Math.random() > 0.6) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + 2500,
        };
        Memory.targetRooms = cache;
        return this.suicide();
    }
    // Get available rooms
    let totalRooms = Memory.ownedRooms.length;
    let surplusRooms = _.filter(Memory.ownedRooms, (r) => r.memory.energySurplus).length;
    // Get room details
    let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let countableStructures = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL);
    let controller = this.room.controller;
    // Prioritize based on range
    let range = this.room.findClosestOwnedRoom(true);
    let closestOwned = this.room.findClosestOwnedRoom();
    let pathedRange = this.shibRoute(new RoomPosition(25, 25, closestOwned).roomName).length - 1;
    let priority = 4;
    if (range === 1) {
        priority = 1;
    } else if (range <= 2 && pathedRange <= 2) {
        priority = 2;
    } else if (pathedRange <= 5) {
        priority = 3;
    } else {
        priority = 4;
    }
    // Plan op based on room comp
    let cache = Memory.targetRooms || {};
    let tick = Game.time;
    if (totalCount < surplusRooms * 3 || totalCount < totalRooms || priority === 1) {
        if (!controller) {
            let type = 'swarmHarass';
            if (Math.random() > Math.random()) type = 'harass';
            cache[this.room.name] = {
                tick: tick,
                type: type,
                level: 1,
                priority: priority
            };
        } else if (controller.owner && controller.safeMode) {
            cache[this.room.name] = {
                tick: tick,
                type: 'pending',
                dDay: tick + this.room.controller.safeMode,
            };
        } else if (controller.owner && (!towers.length || _.max(towers, 'energy').energy === 0)) {
            cache[this.room.name] = {
                tick: tick,
                type: 'hold',
                level: 2,
                priority: 2
            };
        } else if (controller.owner && towers.length) {
            if (controller.level <= 5 && Math.random() > Math.random()) {
                cache[this.room.name] = {
                    tick: tick,
                    type: 'swarm',
                    level: 1,
                    priority: priority
                };
            }
        } else if (!controller.owner && countableStructures.length < 3) {
            let type = 'swarmHarass';
            if (Math.random() > Math.random()) type = 'harass';
            cache[this.room.name] = {
                tick: tick,
                type: type,
                level: 1,
                priority: priority
            };
        } else if (!controller.owner && countableStructures.length > 2) {
            cache[this.room.name] = {
                tick: tick,
                type: 'clean',
                level: 1,
                priority: priority
            };
        } else {
            cache[this.room.name] = {
                tick: tick,
                type: 'harass',
                level: 1,
                priority: priority
            };
        }
    } else {
        cache[this.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + 2500,
        };
    }
    Memory.targetRooms = cache;
    return this.suicide();
};