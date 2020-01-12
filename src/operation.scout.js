/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

Creep.prototype.scoutRoom = function () {
    let sentence = [MY_USERNAME, 'Scout', 'Drone', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    // Handle edge case where room is overlord
    if (this.memory.targetRoom === this.memory.overlord) {
        delete Memory.targetRooms[this.room.name];
        return this.memory.recycle = true;
    }
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    // If room is no longer a target
    if (!Memory.targetRooms[this.room.name]) return this.memory.recycle = true;
    // Handle claim scout missions
    if (Memory.targetRooms[this.room.name] && Memory.targetRooms[this.room.name].type === 'claimScout') return claimScout(this);
    // Handle forward observer
    if (Memory.targetRooms[this.room.name] && Memory.targetRooms[this.room.name].type !== 'attack' && Memory.targetRooms[this.room.name].type !== 'scout') return forwardObserver(this);
    // Cache intel
    this.room.cacheRoomIntel(true);
    // Operation cooldown per room
    if (Memory.roomCache[this.room.name] && !Memory.roomCache[this.room.name].manual && Memory.roomCache[this.room.name].lastOperation && Memory.roomCache[this.room.name].lastOperation + ATTACK_COOLDOWN > Game.time) {
        delete Memory.targetRooms[this.room.name];
        return this.memory.recycle = true;
    }
    Memory.roomCache[this.room.name].lastOperation = Game.time;
    let maxLevel = Memory.maxLevel;
    // Get room details
    let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && (s.isActive() || !this.room.controller));
    let countableStructures = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTAINER);
    let lootStructures = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.structureType === STRUCTURE_TERMINAL && s.structureType === STRUCTURE_STORAGE && _.sum(_.filter(s.store, (r) => _.includes(TIER_2_BOOSTS, r.resourceType) || _.includes(END_GAME_BOOSTS, r.resourceType))) > 500);
    let controller = this.room.controller;
    // Handle Allied Stuff
    let ally;
    if (controller && (controller.owner || controller.reservation)) {
        // Recycle if my owned room
        if (controller.owner && controller.owner.username === MY_USERNAME) return this.memory.recycle;
        // Defend ally rooms
        if (controller.owner && _.includes(FRIENDLIES, controller.owner.username)) ally = true;
        if (controller.reservation && _.includes(FRIENDLIES, controller.reservation.username)) ally = true;
    }
    // Prioritize based on range
    let range = this.room.findClosestOwnedRoom(true);
    let priority = 4;
    if (range <= 1) priority = 1; else if (range <= 3) priority = 2; else if (range <= 5) priority = 3; else priority = 4;
    // Plan op based on room comp
    let cache = Memory.targetRooms || {};
    let tick = Game.time;
    let otherCreeps = _.filter(this.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper');
    let armedHostiles = _.filter(otherCreeps, (c) => !c.my && (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0) && !_.includes(FRIENDLIES, c.owner.username));
    let powerBanks = _.filter(this.room.structures, (e) => e.structureType === STRUCTURE_POWER_BANK && e.ticksToDecay > 1000);
    // Handle power bank rooms
    if (powerBanks.length && !armedHostiles.length && maxLevel >= 8) {
        cache[this.room.name] = {
            tick: tick,
            type: 'power',
            level: 1,
            priority: 1
        };
    } else
    // Guard ally rooms
    if (ally) {
        cache[this.room.name] = {
            tick: tick,
            type: 'guard',
            level: 1,
            priority: 1
        };
    } else {
        delete Memory.targetRooms[this.room.name];
        // If the room has no controller
        if (!controller) {
            // Handle SK Cores
            if (towers.length) {
                if (maxLevel === 8) {
                    if (towers.length <= 3) {
                        cache[this.room.name] = {
                            tick: tick,
                            type: 'siege',
                            level: 1,
                            priority: priority
                        };
                    }
                } else if (towers.length <= 2 && maxLevel >= 7) {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'siegeGroup',
                        level: 1,
                        priority: priority
                    };
                }
            } else
            // Use rangers if available
            if (maxLevel >= 4) {
                cache[this.room.name] = {
                    tick: tick,
                    type: 'rangers',
                    level: 0,
                    priority: priority
                };
                // Otherwise use old harass
            } else {
                cache[this.room.name] = {
                    tick: tick,
                    type: 'harass',
                    level: 1,
                    priority: priority,
                    annoy: true
                };
            }
            // If the room is in safemode queue up another scout
        } else if (controller.owner && controller.safeMode) {
            cache[this.room.name] = {
                tick: tick,
                type: 'pending',
                dDay: tick + this.room.controller.safeMode,
            };
            // If room is owned
        } else if (controller.owner) {
            // Do not siege non enemies unless close
            if (!_.includes(Memory._enemies, controller.owner.username) && range > LOCAL_SPHERE && controller.owner.username !== 'Invader') {
                delete Memory.targetRooms[this.room.name];
                log.a('Abandoning attack on room ' + roomLink(this.room.name) + ' as they do not meet the required ' +
                    'threat level for a siege', 'OPERATION PLANNER: ');
                return this.memory.recycle;
            }
            // If owned room has no towers
            if (!towers.length || _.max(towers, 'energy').energy < 10) {
                // Set room to be raided for loot if some is available
                cache[this.room.name] = {
                    tick: tick,
                    type: 'hold',
                    level: 0,
                    priority: 99
                };
                // If owned room has tower
            } else if (SIEGE_ENABLED) {
                if (maxLevel === 8) {
                    if (towers.length >= 3 && nukeTarget(this.room)) {
                        cache[this.room.name] = {
                            tick: tick,
                            dDay: tick + 50000,
                            type: 'nuke',
                            level: 1
                        };
                    } else if (towers.length <= 3) {
                        cache[this.room.name] = {
                            tick: tick,
                            type: 'siege',
                            level: 1,
                            priority: priority
                        };
                    }
                } else if (towers.length <= 1 && maxLevel >= 7) {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'siegeGroup',
                        level: 1,
                        priority: priority
                    };
                } else if (towers.length <= 2 && maxLevel >= 6) {
                    cache[this.room.name] = {
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
                // Use rangers if available
                if (maxLevel >= 4) {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'rangers',
                        level: 1,
                        priority: priority
                    };
                    // Otherwise use old harass
                } else {
                    let annoy = false;
                    if (armedHostiles.length) annoy = true;
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'harass',
                        level: 1,
                        annoy: annoy,
                        priority: priority
                    };
                }
            } else {
                // Set room to be raided for loot if some is available
                if (lootStructures.length) {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'robbery',
                        level: 1,
                        priority: priority
                    };
                    // Clean the room if there's structures present
                } else if (countableStructures.length) {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'clean',
                        level: 1,
                        priority: priority
                    };
                }
            }
        } else {
            delete Memory.targetRooms[this.room.name];
        }
    }
    if (!cache[this.room.name] || !cache[this.room.name].type || cache[this.room.name].type === 'attack' || cache[this.room.name].type === 'scout') {
        delete Memory.targetRooms[this.room.name];
    } else {
        log.a(cache[this.room.name].type + ' planned for room ' + roomLink(this.room.name), 'OPERATION PLANNER: ');
        Memory.targetRooms = cache;
    }
    return this.memory.recycle = true;
};

function nukeTarget(room) {
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

// Handle claim scouting
function claimScout(creep) {
    let sentence = [MY_USERNAME, 'Scout', 'Drone', 'For', creep.memory.targetRoom];
    let word = Game.time % sentence.length;
    creep.say(sentence[word], true);
    // If room is no longer a target
    if (!Memory.targetRooms[creep.memory.targetRoom]) return creep.memory.recycle = true;
    // Cache intel
    creep.room.cacheRoomIntel();
    // Travel to room
    if (creep.room.name !== creep.memory.targetRoom) return creep.shibMove(new RoomPosition(25, 25, creep.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    // Make sure it's not super far away
    let range = creep.room.findClosestOwnedRoom(true);
    // Determine if room is still suitable
    if (creep.room.controller && !creep.room.controller.owner && !creep.room.controller.reservation && !creep.room.hostileCreeps.length && range <= 10 && range > 1 && creep.room.controller.pos.countOpenTerrainAround()) {
        Memory.targetRooms[creep.room.name] = {
            tick: Game.time,
            type: 'claim'
        };
        creep.room.memory = undefined;
        Memory.lastExpansion = Game.time;
        log.i(creep.room.name + ' - Has been marked for claiming');
        Game.notify(creep.room.name + ' - Has been marked for claiming');
        creep.memory.role = 'explorer';
        creep.room.cacheRoomIntel(true);
    } else {
        let noClaim = Memory.noClaim || [];
        noClaim.push(creep.room.name);
        Memory.noClaim = noClaim;
        log.i(creep.room.name + ' - is not suitable for claiming');
        creep.memory.role = 'explorer';
        creep.room.cacheRoomIntel(true);
        delete Memory.targetRooms[creep.room.name];
    }
}

// Observer tasks
function forwardObserver(creep) {
    let highCommand = require('military.highCommand');
    highCommand.operationSustainability(creep.room);
    levelManager(creep);
    //Type specific stuff
    switch (Memory.targetRooms[creep.memory.targetRoom].type) {
        case 'hold':
            // HOLD - Clear target if room is no longer owned
            if (!creep.room.controller.owner || creep.room.controller.safeMode || !Memory.targetRooms[creep.room.name]) {
                log.a('Canceling hold operation in ' + roomLink(creep.memory.targetRoom) + ' as it is no longer owned.', 'HIGH COMMAND: ');
                delete Memory.targetRooms[creep.memory.targetRoom];
                return;
            }
            // Request unClaimer if room level is too high
            Memory.targetRooms[creep.memory.targetRoom].unClaimer = !creep.room.controller.upgradeBlocked && (!creep.room.controller.ticksToDowngrade || creep.room.controller.ticksToDowngrade > 1000);
            break;
    }
    let armedEnemies = _.filter(creep.room.hostileCreeps, (c) => c.getActiveBodyparts(ATTACK) || c.getActiveBodyparts(RANGED_ATTACK));
    if (armedEnemies.length) {
        if (Memory.targetRooms[creep.room.name].oldPriority) Memory.targetRooms[creep.room.name].priority = Memory.targetRooms[creep.room.name].oldPriority;
        Memory.targetRooms[creep.room.name].level = 2;
    } else if (creep.room.hostileCreeps.length) {
        if (Memory.targetRooms[creep.room.name].oldPriority) Memory.targetRooms[creep.room.name].priority = Memory.targetRooms[creep.room.name].oldPriority;
        Memory.targetRooms[creep.room.name].level = 1;
    } else {
        if (Memory.targetRooms[creep.room.name].type !== 'hold') {
            if (!Memory.targetRooms[creep.room.name].oldPriority) Memory.targetRooms[creep.room.name].oldPriority = Memory.targetRooms[creep.room.name].priority;
            Memory.targetRooms[creep.room.name].priority = 3;
        }
        Memory.targetRooms[creep.room.name].level = 0;
    }
}