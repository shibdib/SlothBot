/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

let highCommand = require('military.highCommand');

Creep.prototype.holdRoom = function () {
    let sentence = ['Please', 'Abandon'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Set heal buddy
    if (!this.memory.squadLeader || !Game.getObjectById(this.memory.squadLeader)) {
        let squadLeader = _.filter(Game.creeps, (c) => c.memory && c.memory.squadLeader === c.id && c.memory.operation === 'hold' && c.memory.destination === this.memory.destination && !c.memory.buddyAssigned)[0];
        if (!squadLeader && this.memory.role === 'longbow') this.memory.squadLeader = this.id; else if (squadLeader) this.memory.squadLeader = squadLeader.id;
    }
    if (this.memory.squadLeader === this.id) {
        hud(this);
        // Sustainability
        if (this.room.name === this.memory.destination) {
            levelManager(this);
            highCommand.operationSustainability(this.room);
        }
        // Attack in range
        this.attackInRange();
        // Handle healing
        this.healInRange();
        // Handle partner checks
        let partner = Game.getObjectById(this.memory.buddyAssigned) || _.filter(Game.creeps, (c) => c.my && c.memory.squadLeader === this.id && c.id !== this.id)[0];
        if (partner) {
            this.memory.buddyAssigned = partner.id;
            // Attack in range
            partner.attackInRange();
            // Handle healing
            partner.healInRange();
            // If in same room but apart move to each other
            if (partner.room.name === this.room.name && !partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
                if (!this.canIWin(10)) this.shibKite();
                return;
            } // Handle separate rooms
            else if (partner.room.name !== this.room.name) {
                if (this.canIWin(10)) this.handleMilitaryCreep(); else this.shibKite();
                if (partner.canIWin(5)) partner.shibMove(this); else partner.shibKite();
            } // Handle next to each other
            else if (partner.pos.isNearTo(this)) {
                partner.shibMove(this, {range: 0});
                // Move to response room if needed
                if (this.room.name !== this.memory.destination) return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
                // Handle flee
                if (this.memory.runCooldown || (!this.getActiveBodyparts(RANGED_ATTACK) && !this.getActiveBodyparts(ATTACK))) {
                    this.fleeHome(true);
                    return partner.shibMove(this, {range: 0});
                }
                // Handle winnable fights
                if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(10) && (this.pairFighting(partner) || this.scorchedEarth())) {
                    return;
                }
            }
        } else {
            this.memory.buddyAssigned = undefined;
            if (this.canIWin(50) && this.handleMilitaryCreep()) return; else return this.goToHub();
        }
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
    let towers = _.filter(creep.room.structures, (c) => c.structureType === STRUCTURE_TOWER && c.energy > 10 && c.isActive());
    let armedEnemies = _.filter(creep.room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK)) && !_.includes(FRIENDLIES, c.owner.username));
    let armedOwners = _.filter(_.union(_.pluck(armedEnemies, 'owner.username'), [creep.room.controller.owner.username]), (o) => !_.includes(FRIENDLIES, o) && o !== 'Invader');
    if (armedOwners.length > 1) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as there is a 3rd party present.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
    } else if (towers.length) {
        delete Memory.targetRooms[creep.memory.destination];
        log.a('Canceling operation in ' + roomLink(creep.memory.destination) + ' as we cannot hold it due to towers.', 'HIGH COMMAND: ');
        creep.room.cacheRoomIntel(true);
    } else if (armedEnemies.length) {
        Memory.targetRooms[creep.memory.destination].level = 2;
    } else {
        Memory.targetRooms[creep.memory.destination].level = 1;
    }
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