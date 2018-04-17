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
        if (!_.includes(FRIENDLIES, controller.owner.username)) addThreat(controller.owner.username, 100);
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'hold',
            level: 2
        };
        Memory.targetRooms = cache;
    } else if (controller.owner && (!towers.length || _.max(towers, 'energy').energy === 0) && !countableStructures.length) {
        if (!_.includes(FRIENDLIES, controller.owner.username)) addThreat(controller.owner.username, 100);
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
        delete Memory.targetRooms[this.pos.roomName];
    } else if (!controller.owner && countableStructures.length < 3) {
        if (controller.reservation && !_.includes(FRIENDLIES, controller.reservation.username)) addThreat(controller.reservation.username, 100);
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[this.room.name] = {
            tick: tick,
            type: 'harass',
            level: 1
        };
        Memory.targetRooms = cache;
    } else if (!controller.owner && countableStructures.length > 2) {
        if (controller.reservation && !_.includes(FRIENDLIES, controller.reservation.username)) addThreat(controller.reservation.username, 100);
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

function addThreat(user, amount = 50) {
    let cache = Memory._badBoyList || {};
    let threatRating;
    if (cache[user]) {
        if (cache[user].lastAction + 10 > Game.time) return true;
        log.e(this.name + ' has taken damage in ' + this.room.name + '. Adjusting threat rating for ' + user);
        if (_.includes(FRIENDLIES, user)) {
            threatRating = cache[user]['threatRating'] + 0.1;
        } else {
            threatRating = cache[user]['threatRating'] + 0.5;
        }
    } else {
        threatRating = 2.5;
    }
    cache[user] = {
        threatRating: threatRating,
        lastAction: Game.time,
    };
    Memory._badBoyList = cache;
}