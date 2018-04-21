Creep.prototype.scoutRoom = function () {
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    this.room.cacheRoomIntel(true);
    let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let countableStructures = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL);
    let controller = this.room.controller;
    if (controller.owner && controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + this.room.controller.safeMode,
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && (!towers.length || _.max(towers, 'energy').energy === 0) && countableStructures.length) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'hold',
            level: 2
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && (!towers.length || _.max(towers, 'energy').energy === 0) && !countableStructures.length) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'hold',
            level: 1
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && towers.length) {
        this.room.cacheRoomIntel(true);
        if (controller.level <= 6 && _.random(0, 1) === 1) {
            let cache = Memory.targetRooms || {};
            let tick = Game.time;
            cache[this.room.name] = {
                tick: tick,
                type: 'swarm',
                level: 1
            };
        }
        delete Memory.targetRooms[this.pos.roomName];
    } else if (!controller.owner && countableStructures.length < 3) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'harass',
            level: 1
        };
        Memory.targetRooms = cache;
    } else if (!controller.owner && countableStructures.length > 2) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'clean',
            level: 1
        };
        Memory.targetRooms = cache;
    }
    return this.suicide();
};