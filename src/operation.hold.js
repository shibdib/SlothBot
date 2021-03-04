/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.holdRoom = function () {
    let sentence = ['Coming', 'For', 'That', 'Booty', this.memory.destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Move to response room if needed
    if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 23}); else {
        this.handleMilitaryCreep();
        let sentence = ['Please', 'Abandon'];
        let word = Game.time % sentence.length;
        this.say(sentence[word], true);
        levelManager(this);
        highCommand.operationSustainability(this.room);
    }
};

function levelManager(creep) {
    if (!Memory.targetRooms[creep.memory.destination] || creep.room.name !== creep.memory.destination) return;
    if (!creep.room.controller || (!creep.room.controller.owner && !creep.room.controller.reservation) || (!creep.room.creeps.length && !creep.room.structures.length)) return delete Memory.targetRooms[creep.memory.destination];
    // Safemode
    if (creep.room.controller.safeMode) {
        let cache = Memory.targetRooms || {};
        let tick = Game.time;
        cache[creep.room.name] = {
            tick: tick,
            type: 'pending',
            dDay: tick + creep.room.controller.safeMode,
        };
        Memory.targetRooms = cache;
        creep.memory.recycle = true;
        return;
    }
    let otherRooms = _.filter(Memory.roomCache, (r) => r.name !== creep.room.name && r.owner === Memory.roomCache[creep.room.name].owner)[0]
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10 && c.isActive());
    let armedEnemies = _.filter(creep.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)) && !_.includes(FRIENDLIES, c.owner.username));
    let armedOwners = _.filter(_.union(_.pluck(armedEnemies, 'owner.username'), [Memory.roomCache[creep.room.name].user]), (o) => !_.includes(FRIENDLIES, o) && o !== 'Invader');
    Memory.targetRooms[creep.memory.destination].claimAttacker = undefined;
    if (towers.length) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + '.', 'HIGH COMMAND: ');
        return creep.room.cacheRoomIntel(true);
    } else if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.destination].level = 2;
    } else if (otherRooms || creep.room.hostileCreeps.length) {
        Memory.targetRooms[creep.memory.destination].level = 1;
    } else {
        Memory.targetRooms[creep.memory.destination].level = 0;
    }
    if (creep.room.hostileStructures.length) Memory.targetRooms[creep.memory.destination].cleaner = true;
    if (creep.room.controller && creep.room.controller.owner && (!creep.room.controller.upgradeBlocked || creep.room.controller.upgradeBlocked < CREEP_CLAIM_LIFE_TIME) && creep.room.controller.pos.countOpenTerrainAround()) Memory.targetRooms[creep.memory.destination].claimAttacker = true;
    else Memory.targetRooms[creep.memory.destination].claimAttacker = false;
}

function hud(creep) {
    try {
        let response = creep.memory.destination || creep.room.name;
        Game.map.visual.text('HOLD', new RoomPosition(17, 3, response), {
            color: '#d68000',
            fontSize: 3,
            align: 'left'
        });
        if (response !== creep.room.name && creep.memory._shibMove && creep.memory._shibMove.route) {
            let route = [];
            for (let routeRoom of creep.memory._shibMove.route) {
                if (routeRoom === creep.room.name) route.push(new RoomPosition(creep.pos.x, creep.pos.y, routeRoom));
                else route.push(new RoomPosition(25, 25, routeRoom));
            }
            for (let posNumber = 0; posNumber++; posNumber < route.length) {
                Game.map.visual.line(route[posNumber], route[posNumber + 1])
            }
        }
    } catch (e) {
    }
}