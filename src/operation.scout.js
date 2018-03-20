Creep.prototype.scoutRoom = function () {
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {range: 23});
    this.room.cacheRoomIntel(true);
    let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER);
    let ramparts = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART);
    let terminal = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TERMINAL)[0];
    let storage = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_STORAGE)[0];
    let controller = this.room.controller;
    if (controller.owner && (towers.length === 0 || _.max(towers, 'energy').energy === 0) && ramparts[0]) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'clean',
            level: 2
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && (towers.length === 0 || _.max(towers, 'energy').energy === 0) && !ramparts[0] && ((terminal && _.sum(terminal.store) - terminal.store[RESOURCE_ENERGY] > 0) || (storage && _.sum(storage.store) - storage.store[RESOURCE_ENERGY] > 0))) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'robbery',
            level: 1
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && towers.length >= 1) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        let level = _.round((towers.length / 2) + 0.5);
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'siege',
            level: level
        };
        Memory.targetRooms = cache;
    } else if (!controller.owner && !ramparts[0]) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'harass',
            level: 1
        };
        Memory.targetRooms = cache;
    } else if (!controller.owner && this.room.structures.length > 2) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'clean',
            level: 2
        };
        Memory.targetRooms = cache;
    } else if (!controller.owner && !ramparts[0] && ((terminal && _.sum(terminal.store) - terminal.store[RESOURCE_ENERGY] > 0) || (storage && _.sum(storage.store) - storage.store[RESOURCE_ENERGY] > 0))) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.pos.roomName] = {
            tick: tick,
            type: 'robbery',
            level: 1
        };
        Memory.targetRooms = cache;
    }
    delete this.memory.targetRoom;
    this.memory.role = 'explorer';
};