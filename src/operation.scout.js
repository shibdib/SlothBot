Creep.prototype.scoutRoom = function () {
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    this.room.cacheRoomIntel(true);
    //Chance nothing happens
    if (Math.random() > Math.random()) return this.suicide();
    let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let countableStructures = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL);
    let controller = this.room.controller;
    let range = this.room.findClosestOwnedRoom(true);
    let closestOwned = this.room.findClosestOwnedRoom();
    let pathedRange = this.shibRoute(new RoomPosition(25, 25, closestOwned).roomName).length;
    let priority = 4;
    if (range === 1) {
        priority = 1;
    } else if (range <= 2 && pathedRange <= 2) {
        priority = 2;
    } else if (pathedRange <= 4) {
        priority = 3;
    } else {
        priority = 4;
    }
    if (controller.owner && controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + this.room.controller.safeMode,
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && (!towers.length || _.max(towers, 'energy').energy === 0)) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'hold',
            level: 2,
            priority: 2
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && towers.length && range >= 4) {
        this.room.cacheRoomIntel(true);
        if (controller.level <= 5 && Memory.ownedRooms.length > 1) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.room.name] = {
                tick: tick,
                type: 'swarm',
                level: 1,
                priority: priority
            };
        }
        delete Memory.targetRooms[this.pos.roomName];
    } else if (controller.owner && towers.length && range < 4) {
        if (controller.level <= 5 && Memory.ownedRooms.length > 1) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.room.name] = {
                tick: tick,
                type: 'swarm',
                level: 1,
                priority: priority
            };
        }
        delete Memory.targetRooms[this.pos.roomName];
    } else if (!controller.owner && countableStructures.length < 3) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        let type = 'swarmHarass';
        if (Math.random() > Math.random()) type = 'harass';
        cache[this.room.name] = {
            tick: tick,
            type: type,
            level: 1,
            priority: priority
        };
        Memory.targetRooms = cache;
    } else if (!controller.owner && countableStructures.length > 2) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'clean',
            level: 1,
            priority: priority
        };
        Memory.targetRooms = cache;
    }
    return this.suicide();
};