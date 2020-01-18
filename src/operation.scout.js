/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.scoutRoom = function () {
    let sentence = [MY_USERNAME, 'Scout', 'Drone', 'For', this.memory.destination];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Handle edge case where room is overlord
    if (this.memory.destination === this.memory.overlord) {
        delete Memory.targetRooms[this.room.name];
        return this.memory.recycle = true;
    }
    if (this.room.name !== this.memory.destination) {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {
            range: 23,
            offRoad: true
        });
    }
    return operationPlanner(this.room, this);
};

StructureObserver.prototype.operationPlanner = function (room) {
    return operationPlanner(room);
};

function operationPlanner(room, creep = undefined) {
    // If room is no longer a target
    if (!Memory.targetRooms[room.name] && creep) return creep.memory.role = 'explorer';
    // Handle claim scout missions
    if (Memory.targetRooms[room.name] && Memory.targetRooms[room.name].type === 'claimScout') return claimScout(room);
    // Handle forward observer
    if (Memory.targetRooms[room.name] && Memory.targetRooms[room.name].type !== 'attack' && Memory.targetRooms[room.name].type !== 'scout') return forwardObserver(room);
    // Cache intel
    room.cacheRoomIntel(true);
    // Operation cooldown per room
    if (Memory.roomCache[room.name] && !Memory.roomCache[room.name].manual && Memory.roomCache[room.name].lastOperation && Memory.roomCache[room.name].lastOperation + ATTACK_COOLDOWN > Game.time) {
        delete Memory.targetRooms[room.name];
        if (creep) return creep.memory.role = 'explorer';
    }
    Memory.roomCache[room.name].lastOperation = Game.time;
    let maxLevel = Memory.maxLevel;
    // Get room details
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && (s.isActive() || !room.controller));
    let controller = room.controller;
    // Handle Allied Stuff
    let ally;
    if (controller && (controller.owner || controller.reservation)) {
        // Recycle if my owned room
        if (controller.owner && controller.owner.username === MY_USERNAME) return memory.recycle;
        // Defend ally rooms
        if (controller.owner && _.includes(FRIENDLIES, controller.owner.username)) ally = true;
        if (controller.reservation && _.includes(FRIENDLIES, controller.reservation.username)) ally = true;
    }
    // Prioritize based on range
    let range = room.findClosestOwnedRoom(true);
    let priority = 4;
    if (range <= LOCAL_SPHERE) priority = 1; else if (range <= LOCAL_SPHERE * 1.25) priority = 2; else if (range <= LOCAL_SPHERE * 2) priority = 3; else priority = 4;
    // Plan op based on room comp
    let cache = Memory.targetRooms || {};
    let tick = Game.time;
    let otherCreeps = _.filter(room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper');
    // Guard ally rooms
    if (ally) {
        cache[room.name] = {
            tick: tick,
            type: 'guard',
            level: 1,
            priority: 1
        };
    } else {
        delete Memory.targetRooms[room.name];
        // If the room has no controller
        if (!controller) {
            // Handle SK Cores
            if (towers.length) {
                if (maxLevel === 8) {
                    if (towers.length <= 3) {
                        cache[room.name] = {
                            tick: tick,
                            type: 'siege',
                            level: 1,
                            priority: priority
                        };
                    }
                } else if (towers.length <= 2 && maxLevel >= 7) {
                    cache[room.name] = {
                        tick: tick,
                        type: 'siegeGroup',
                        level: 1,
                        priority: priority
                    };
                }
            }
            // If the room is in safemode queue up another scout
        } else if (controller.owner && controller.safeMode) {
            cache[room.name] = {
                tick: tick,
                type: 'pending',
                dDay: tick + room.controller.safeMode,
            };
            // If room is owned
        } else if (controller.owner) {
            // Do not siege non enemies unless close
            if (!_.includes(Memory._enemies, controller.owner.username) && range > LOCAL_SPHERE && controller.owner.username !== 'Invader') {
                delete Memory.targetRooms[room.name];
                log.a('Abandoning attack on room ' + roomLink(room.name) + ' as they do not meet the required ' +
                    'threat level for a siege', 'OPERATION PLANNER: ');
                return memory.recycle;
            }
            // If owned room has no towers
            if (!towers.length || _.max(towers, 'energy').energy < 10) {
                cache[room.name] = {
                    tick: tick,
                    type: 'hold',
                    level: 0,
                    priority: 99
                };
                // If owned room has tower
            } else if (SIEGE_ENABLED) {
                if (maxLevel === 8) {
                    if (towers.length >= 3 && nukeTarget(room)) {
                        cache[room.name] = {
                            tick: tick,
                            dDay: tick + 50000,
                            type: 'nuke',
                            level: 1
                        };
                    } else if (towers.length <= 3) {
                        cache[room.name] = {
                            tick: tick,
                            type: 'siege',
                            level: 1,
                            priority: priority
                        };
                    }
                } else if (towers.length <= 1 && maxLevel >= 7) {
                    cache[room.name] = {
                        tick: tick,
                        type: 'siegeGroup',
                        level: 1,
                        priority: priority
                    };
                } else if (towers.length <= 2 && maxLevel >= 6) {
                    cache[room.name] = {
                        tick: tick,
                        type: 'drain',
                        level: 1,
                        priority: priority
                    };
                }
            }
            // If the room is unowned
        } else if (!controller.owner) {
            // If other creeps are present
            if (otherCreeps.length) {
                let type = 'rangers';
                if (POKE_ATTACKS && Math.random() > 0.5) type = 'poke';
                cache[room.name] = {
                    tick: tick,
                    type: type,
                    level: 1,
                    priority: priority
                };
            }
        } else {
            delete Memory.targetRooms[room.name];
        }
    }
    if (!cache[room.name] || !cache[room.name].type || cache[room.name].type === 'attack' || cache[room.name].type === 'scout') {
        delete Memory.targetRooms[room.name];
    } else {
        log.a(cache[room.name].type + ' planned for room ' + roomLink(room.name), 'OPERATION PLANNER: ');
        Memory.targetRooms = cache;
    }
    if (creep) return creep.memory.role = 'explorer';
}

function claimScout(room) {
    let roomPlanner = require('module.roomPlanner');
    // Make sure it's not super far away
    let range = room.findClosestOwnedRoom(true);
    // Determine if room is still suitable
    if (room.controller && !room.controller.owner && !room.controller.reservation && !room.hostileCreeps.length && range <= 10 && range > 2 && room.controller.pos.countOpenTerrainAround() && roomPlanner.hubCheck(room)) {
        Memory.auxiliaryTargets[room.name] = {
            tick: Game.time,
            type: 'claim'
        };
        room.memory = undefined;
        log.i(room.name + ' - Has been marked for claiming');
        Game.notify(room.name + ' - Has been marked for claiming');
        room.cacheRoomIntel(true);
    } else {
        let noClaim = Memory.noClaim || [];
        noClaim.push(room.name);
        Memory.noClaim = noClaim;
        room.cacheRoomIntel(true);
        delete Memory.targetRooms[room.name];
        delete Memory.auxiliaryTargets[room.name];
    }
}

function nukeTarget(room) {
    return false;
    //TODO: Rework nuke threshold
    let nukes = _.filter(Game.structures, (s) => s.structureType === STRUCTURE_NUKER && s.energy === s.energyCapacity && s.ghodium === s.ghodiumCapacity && !s.cooldown && Game.map.getRoomLinearDistance(s.room.name, room.name) <= 10);
    let inboundNukes = room.find(FIND_NUKES);
    if (nukes.length && !inboundNukes.length) {
        let launched = 0;
        let towerTarget, spawnTarget, terminalTarget;
        for (let nuker of nukes) {
            if (launched >= 2) break;
            let clusteredTower = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.pos.findInRange(room.structures, 4, {filter: (l) => l.structureType === STRUCTURE_TOWER}).length >= 3)[0];
            let clusteredSpawns = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.pos.findInRange(room.structures, 4, {filter: (l) => l.structureType === STRUCTURE_SPAWN}).length >= 2)[0];
            if (clusteredTower && !towerTarget) {
                launched += 1;
                nuker.launchNuke(clusteredTower.pos);
                log.a('NUCLEAR LAUNCH DETECTED - ' + clusteredTower.pos.roomName + ' ' + clusteredTower.pos.x + '.' + clusteredTower.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
                Game.notify('NUCLEAR LAUNCH DETECTED - ' + clusteredTower.pos.roomName + ' ' + clusteredTower.pos.x + '.' + clusteredTower.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
            } else if (clusteredSpawns && !spawnTarget) {
                launched += 1;
                nuker.launchNuke(clusteredSpawns.pos);
                log.a('NUCLEAR LAUNCH DETECTED - ' + clusteredSpawns.pos.roomName + ' ' + clusteredSpawns.pos.x + '.' + clusteredSpawns.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
                Game.notify('NUCLEAR LAUNCH DETECTED - ' + clusteredSpawns.pos.roomName + ' ' + clusteredSpawns.pos.x + '.' + clusteredSpawns.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
            } else if (room.terminal && !terminalTarget) {
                launched += 1;
                nuker.launchNuke(room.terminal.pos);
                log.a('NUCLEAR LAUNCH DETECTED - ' + room.terminal.pos.roomName + ' ' + room.terminal.pos.x + '.' + room.terminal.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
                Game.notify('NUCLEAR LAUNCH DETECTED - ' + room.terminal.pos.roomName + ' ' + room.terminal.pos.x + '.' + room.terminal.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
            } else if (room.storage) {
                nuker.launchNuke(room.storage.pos);
                log.a('NUCLEAR LAUNCH DETECTED - ' + room.storage.pos.roomName + ' ' + room.storage.pos.x + '.' + room.storage.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
                Game.notify('NUCLEAR LAUNCH DETECTED - ' + room.storage.pos.roomName + ' ' + room.storage.pos.x + '.' + room.storage.pos.y + ' has a nuke inbound from ' + nuker.room.name + ' and will impact in 50,000 ticks.');
                break;
            }
        }
        return true;
    }
    return false;
}

// Observer tasks
function forwardObserver(room) {
    let highCommand = require('military.highCommand');
    highCommand.operationSustainability(room);
    levelManager(room);
    //Type specific stuff
    switch (Memory.targetRooms[room.name].type) {
        case 'hold':
            // HOLD - Clear target if room is no longer owned
            if (!room.controller.owner || room.controller.safeMode || !Memory.targetRooms[room.name]) {
                log.a('Canceling hold operation in ' + roomLink(memory.destination) + ' as it is no longer owned.', 'HIGH COMMAND: ');
                delete Memory.targetRooms[room.name];
                return;
            }
            // Request unClaimer if room level is too high
            Memory.targetRooms[room.name].claimAttacker = !room.controller.upgradeBlocked && (!room.controller.ticksToDowngrade || room.controller.ticksToDowngrade > 1000);
            break;
    }
    let armedEnemies = _.filter(room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (armedEnemies.length) {
        if (Memory.targetRooms[room.name].oldPriority) Memory.targetRooms[room.name].priority = Memory.targetRooms[room.name].oldPriority;
        Memory.targetRooms[room.name].level = 2;
    } else if (room.hostileCreeps.length) {
        if (Memory.targetRooms[room.name].oldPriority) Memory.targetRooms[room.name].priority = Memory.targetRooms[room.name].oldPriority;
        Memory.targetRooms[room.name].level = 1;
    } else {
        if (Memory.targetRooms[room.name].type !== 'hold') {
            if (!Memory.targetRooms[room.name].oldPriority) Memory.targetRooms[room.name].oldPriority = Memory.targetRooms[room.name].priority;
            Memory.targetRooms[room.name].priority = 3;
        }
        Memory.targetRooms[room.name].level = 0;
    }
}

function levelManager(room) {
    let armedEnemies = _.filter(room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (armedEnemies.length) {
        if (Memory.targetRooms[room.name].oldPriority) Memory.targetRooms[room.name].priority = Memory.targetRooms[room.name].oldPriority;
        Memory.targetRooms[room.name].level = 2;
    } else if (room.hostileCreeps.length) {
        if (Memory.targetRooms[room.name].oldPriority) Memory.targetRooms[room.name].priority = Memory.targetRooms[room.name].oldPriority;
        Memory.targetRooms[room.name].level = 1;
    } else {
        if (Memory.targetRooms[room.name].type !== 'hold') {
            if (!Memory.targetRooms[room.name].oldPriority) Memory.targetRooms[room.name].oldPriority = Memory.targetRooms[room.name].priority;
            Memory.targetRooms[room.name].priority = 3;
        }
        Memory.targetRooms[room.name].level = 0;
    }
}