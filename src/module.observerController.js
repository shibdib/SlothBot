/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 5/16/2017.
 */
let observedRooms = {};
module.exports.observerControl = function (room) {
    let observer = _.filter(room.structures, (s) => s.structureType === STRUCTURE_OBSERVER)[0];
    if (observer) {
        if (observedRooms[room.name] && Game.rooms[observedRooms[room.name]]) {
            Game.rooms[observedRooms[room.name]].cacheRoomIntel();
            if (Game.map.getRoomLinearDistance(observedRooms[room.name], room.name) <= 2) Game.rooms[observedRooms[room.name]].invaderCheck();
            if (Memory.targetRooms[observedRooms[room.name]] && Memory.targetRooms[observedRooms[room.name]].type === 'attack') militaryScout(Game.rooms[observedRooms[room.name]]);
            if (Memory.targetRooms[observedRooms[room.name]] && Memory.targetRooms[observedRooms[room.name]].type === 'claimScout') claimScout(Game.rooms[observedRooms[room.name]]);
            if (Memory.targetRooms[observedRooms[room.name]] && Memory.targetRooms[observedRooms[room.name]].observerCheck) observerOp(Game.rooms[observedRooms[room.name]]);
        }
        // Observer queries (Military scouts first)
        let scoutOperation = _.findKey(Memory.targetRooms, (t) => t.type === 'attack');
        if (scoutOperation && Game.map.getRoomLinearDistance(room.name, scoutOperation) <= OBSERVER_RANGE) {
            observer.observeRoom(scoutOperation);
            observedRooms[room.name] = scoutOperation;
            return;
        }
        // Observer queries (Level 0's)
        let observerOperation = _.findKey(Memory.targetRooms, (t) => t.level === 0 && (!t.observerCheck || t.observerCheck + 20 < Game.time));
        if (observerOperation && Game.map.getRoomLinearDistance(room.name, observerOperation) <= OBSERVER_RANGE) {
            observer.observeRoom(observerOperation);
            observedRooms[room.name] = observerOperation;
            Memory.targetRooms[observerOperation].observerCheck = Game.time;
            return;
        }
        // Observer queries (Claim scouts)
        let claimScoutOperation = _.findKey(Memory.targetRooms, (t) => t.type === 'claimScout');
        if (claimScoutOperation && Game.map.getRoomLinearDistance(room.name, claimScoutOperation) <= OBSERVER_RANGE) {
            observer.observeRoom(claimScoutOperation);
            observedRooms[room.name] = claimScoutOperation;
            return;
        }
        // Observer queries (Random)
        let target;
        let roomX = room.name.match(/\d+/g).map(Number)[0];
        let roomY = room.name.match(/\d+/g).map(Number)[1];
        let targetX = Math.abs(roomX + (Math.round(Math.random() * 20 - 10)));
        let targetY = Math.abs(roomY + (Math.round(Math.random() * 20 - 10)));
        target = room.name.replace(/[0-9]/g, '')[0] + targetX + room.name.replace(/[0-9]/g, '')[1] + targetY;
        observer.observeRoom(target);
        observedRooms[room.name] = target;
    }
};

function militaryScout(room) {
    room.cacheRoomIntel(true);
    // If room is no longer a target
    if (!Memory.targetRooms[room.name] || (Memory.targetRooms[room.name].type !== 'attack' && Memory.targetRooms[room.name].type !== 'scout')) return;
    // Operation cooldown per room
    if (!Memory.roomCache[room.name].manual && Memory.roomCache[room.name].lastOperation && Memory.roomCache[room.name].lastOperation + ATTACK_COOLDOWN > Game.time) {
        delete Memory.targetRooms[room.name];
        return;
    }
    Memory.roomCache[room.name].lastOperation = Game.time;
    let maxLevel = Memory.maxLevel;
    // Get room details
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && (s.isActive() || !room.controller));
    let countableStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTAINER);
    let lootStructures = _.filter(room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.structureType === STRUCTURE_TERMINAL && s.structureType === STRUCTURE_STORAGE && _.sum(_.filter(s.store, (r) => _.includes(TIER_2_BOOSTS, r.resourceType) || _.includes(END_GAME_BOOSTS, r.resourceType))) > 500);
    let controller = room.controller;
    // Handle Allied Stuff
    let ally;
    if (controller && (controller.owner || controller.reservation)) {
        // Cancel if my owned room
        if (controller.owner && controller.owner.username === MY_USERNAME) {
            delete Memory.targetRooms[room.name];
            return;
        }
        // Defend ally rooms
        if (controller.owner && _.includes(FRIENDLIES, controller.owner.username)) ally = true;
        if (controller.reservation && _.includes(FRIENDLIES, controller.reservation.username)) ally = true;
    }
    // Prioritize based on range
    let range = room.findClosestOwnedRoom(true);
    let priority = 4;
    if (range <= 1) priority = 1; else if (range <= 3) priority = 2; else if (range <= 5) priority = 3; else priority = 4;
    // Plan op based on room comp
    let cache = Memory.targetRooms || {};
    let tick = Game.time;
    let otherCreeps = _.filter(room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper');
    let armedHostiles = _.filter(otherCreeps, (c) => !c.my && (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0) && !_.includes(FRIENDLIES, c.owner.username));
    let powerBanks = _.filter(room.structures, (e) => e.structureType === STRUCTURE_POWER_BANK && e.ticksToDecay > 1000);
    // Handle power bank rooms
    if (powerBanks.length && !armedHostiles.length && maxLevel >= 8) {
        cache[room.name] = {
            tick: tick,
            type: 'power',
            level: 1,
            priority: 1
        };
    } else
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
                if (maxLevel === 8 && towers.length >= 2) {
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
            } else
            // Use rangers if available
            if (maxLevel >= 4) {
                cache[room.name] = {
                    tick: tick,
                    type: 'rangers',
                    level: 0,
                    priority: priority
                };
                // Otherwise use old harass
            } else {
                cache[room.name] = {
                    tick: tick,
                    type: 'harass',
                    level: 1,
                    priority: priority,
                    annoy: true
                };
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
                return;
            }
            // If owned room has no towers
            if (!towers.length || _.max(towers, 'energy').energy < 10) {
                // Set room to be raided for loot if some is available
                if (lootStructures.length && !otherCreeps.length) {
                    cache[room.name] = {
                        tick: tick,
                        type: 'robbery',
                        level: 1,
                        priority: priority
                    };
                    // Otherwise try to hold the room
                } else {
                    cache[room.name] = {
                        tick: tick,
                        type: 'hold',
                        level: 0,
                        priority: 1
                    };
                }
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
                // Use rangers if available
                if (maxLevel >= 4) {
                    cache[room.name] = {
                        tick: tick,
                        type: 'rangers',
                        level: 1,
                        priority: priority
                    };
                    // Otherwise use old harass
                } else {
                    let annoy = false;
                    if (armedHostiles.length) annoy = true;
                    cache[room.name] = {
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
                    cache[room.name] = {
                        tick: tick,
                        type: 'robbery',
                        level: 1,
                        priority: priority
                    };
                    // Clean the room if there's structures present
                } else if (countableStructures.length) {
                    cache[room.name] = {
                        tick: tick,
                        type: 'clean',
                        level: 1,
                        priority: priority
                    };
                }
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
};

function claimScout(room) {
    // Make sure it's not super far away
    let range = room.findClosestOwnedRoom(true);
    // Determine if room is still suitable
    if (room.controller && !room.controller.owner && !room.controller.reservation && !room.hostileCreeps.length && range <= 10 && range > 2 && room.controller.pos.countOpenTerrainAround()) {
        Memory.targetRooms[room.name] = {
            tick: Game.time,
            type: 'claim'
        };
        room.memory = undefined;
        Memory.lastExpansion = Game.time;
        log.i(room.name + ' - Has been marked for claiming');
        Game.notify(room.name + ' - Has been marked for claiming');
        room.cacheRoomIntel(true);
    } else {
        let noClaim = Memory.noClaim || [];
        noClaim.push(room.name);
        Memory.noClaim = noClaim;
        room.cacheRoomIntel(true);
        delete Memory.targetRooms[room.name];
    }
}

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

function observerOp(room) {
    let highCommand = require('military.highCommand');
    highCommand.operationSustainability(room);
    levelManager(room);
    //Type specific stuff
    switch (Memory.targetRooms[room.name].type) {
        case 'hold':
            // HOLD - Clear target if room is no longer owned
            if (!room.controller.owner || room.controller.safeMode || !Memory.targetRooms[room.name]) {
                log.a('Canceling hold operation in ' + roomLink(room.name) + ' as it is no longer owned.', 'HIGH COMMAND: ');
                delete Memory.targetRooms[room.name];
                return;
            }
            // Request unClaimer if room level is too high
            Memory.targetRooms[room.name].claimAttacker = !room.controller.upgradeBlocked && (!room.controller.ticksToDowngrade || room.controller.ticksToDowngrade > 1000);
            break;
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
