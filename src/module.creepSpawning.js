/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */
let generator = require('module.bodyGenerator');
let roomQueue = {};
let globalQueue = {};
let energyOrder = {};
let orderStored = {};
let storedLevel = {};
let remoteHives = {};
let lastBuilt = {};
let creepCount = {};
let creepTTL = {};
let lastGlobalSpawn = Game.time;

//Build Creeps From Queue
let buildTick = {};
module.exports.processBuildQueue = function (room) {
    // Display/Retrieve Queue
    let queue = displayQueue(room.name);
    if (!queue) return;
    if (buildTick[room.name] + 5 > Game.time) return;
    buildTick[room.name] = Game.time;
    // Check for free spawns
    let availableSpawn = _.find(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && !s.spawning && s.isActive());
    if (availableSpawn) {
        let body, role, cost, queuedBuild;
        let level = room.level;
        // Pick build target
        for (let topPriority of queue) {
            role = topPriority.role;
            if (!role) continue;
            // If boosts are required to spawn check that a room has them
            if (topPriority.other.boostCheck) {
                let hasBoost;
                for (let boost of BOOST_USE[topPriority.other.boostCheck]) {
                    hasBoost = room.store(boost) >= 500;
                }
                if (!hasBoost) continue;
            }
            body = generator.bodyGenerator(level, role, room, topPriority);
            if (!body || !body.length) continue;
            // Add a distance sanity check for claim parts
            if (topPriority.destination && _.includes(body, CLAIM) && Game.map.findRoute(topPriority.destination, room.name).length > 12) continue;
            // Stop loop if we just can't afford it yet
            cost = global.UNIT_COST(body);
            if (cost > room.energyAvailable && cost <= room.energyCapacityAvailable) return;
            // If it's not something we can afford, continue
            if (cost > room.energyCapacityAvailable) continue;
            queuedBuild = topPriority;
            break;
        }
        if (queuedBuild) {
            determineEnergyOrder(room);
            if (typeof queuedBuild === 'object') {
                _.defaults(queuedBuild, {
                    role: undefined,
                    overlord: undefined,
                    assignedSource: undefined,
                    destination: undefined,
                    other: {},
                    military: undefined,
                    operation: undefined,
                    misc: undefined
                });
                let name = _.uniqueId(role + '_' + availableSpawn.room.name + '_T' + level + '_');
                if (queuedBuild.operation) name = _.uniqueId(queuedBuild.operation + '_' + availableSpawn.room.name + '_T' + level + '_');
                let energyStructures;
                if (energyOrder[availableSpawn.room.name]) energyStructures = JSON.parse(energyOrder[availableSpawn.room.name]);
                switch (availableSpawn.spawnCreep(body, name, {
                    memory: {
                        born: Game.time,
                        role: role,
                        overlord: availableSpawn.room.name,
                        assignedSource: queuedBuild.assignedSource,
                        destination: queuedBuild.destination,
                        other: queuedBuild.other,
                        military: queuedBuild.military,
                        operation: queuedBuild.operation,
                        misc: queuedBuild.misc
                    },
                    energyStructures: energyStructures
                })) {
                    case OK:
                        lastGlobalSpawn = Game.time;
                        lastBuilt[availableSpawn.room.name] = Game.time;
                        if (!queuedBuild.operation) log.d(availableSpawn.room.name + ' Spawning a ' + role);
                        if (queuedBuild.military && globalQueue[role]) delete globalQueue[role];
                        if (queuedBuild.buildCount && roomQueue[availableSpawn.room.name][role]) return roomQueue[availableSpawn.room.name][role].buildCount = queuedBuild.buildCount - 1;
                        if (roomQueue[availableSpawn.room.name]) delete roomQueue[availableSpawn.room.name][role];
                        if (creepCount) creepCount.tick--;
                        return;
                    case ERR_NOT_ENOUGH_ENERGY:
                        energyOrder[availableSpawn.room.name] = undefined;
                        return;
                    default:
                        let error = availableSpawn.spawnCreep(body, name, {
                            memory: {
                                born: Game.time,
                                role: role,
                                overlord: availableSpawn.room.name,
                                assignedSource: queuedBuild.assignedSource,
                                destination: queuedBuild.destination,
                                other: queuedBuild.other,
                                military: queuedBuild.military,
                                operation: queuedBuild.operation,
                                misc: queuedBuild.misc
                            },
                            energyStructures: energyStructures
                        });
                        log.e('Spawn error in ' + availableSpawn.room.name + ' code ' + error + '. Name - ' + name + '. Body - ' + body);
                        return;
                }
            }
        }
    }
};

//First Room Startup
module.exports.roomStartup = function (room) {
    if (getCreepCount(room, 'drone') < 12) {
        queueCreep(room, 2 + getCreepCount(room, 'drone'), {
            role: 'drone',
            other: {reboot: room.friendlyCreeps.length <= 3}
        })
    }
    if (getCreepCount(room, 'stationaryHarvester') < 2) {
        let reboot = !getCreepCount(room, 'stationaryHarvester') || room.friendlyCreeps.length < 5 || undefined;
        queueCreep(room, 1 + getCreepCount(room, 'stationaryHarvester'), {
            role: 'stationaryHarvester',
            other: {
                noBump: true,
                reboot: reboot
            }
        })
    }
    if (getCreepCount(room, 'stationaryHarvester') && !getCreepCount(room, 'hauler')) {
        queueCreep(room, 1, {role: 'hauler'})
    }
    if (!getCreepCount(room, 'upgrader') || (getCreepCount(room, 'upgrader') < 5 && room.level === room.controller.level)) {
        queueCreep(room, 4 + getCreepCount(room, 'upgrader'), {role: 'upgrader'})
    }
    if ((room.memory.spawnDefenders || room.memory.defenseCooldown > Game.time) && !getCreepCount(room, 'defender')) {
        queueCreep(room, PRIORITIES.defender, {role: 'defender'})
    }
    if (Memory.maxLevel < 8 && getCreepCount(room, 'explorer') < 2) {
        queueCreep(room, 9, {role: 'explorer'})
    }
};

//Essential creeps
let essentialTick = {};
module.exports.essentialCreepQueue = function (room) {
    if (essentialTick[room.name] + 5 > Game.time) return;
    essentialTick[room.name] = Game.time;
    //Static room info
    let level = getLevel(room);
    //Harvesters
    if (getCreepCount(room, 'stationaryHarvester') < room.sources.length || (getCreepTTL(room.name, 'stationaryHarvester') < 100 && getCreepCount(room, 'stationaryHarvester') === room.sources.length)) {
        queueCreep(room, PRIORITIES.stationaryHarvester, {
            role: 'stationaryHarvester',
            other: {
                noBump: true,
                reboot: !getCreepCount(room, 'stationaryHarvester')
            }
        });
    }
    //Haulers
    if (getCreepCount(room, 'stationaryHarvester')) {
        let amount = 1;
        if (room.memory.spawnDefenders) amount = 2;
        let priority = PRIORITIES.hauler;
        let reboot;
        if (!getCreepCount(room, 'hauler') || room.friendlyCreeps.length < 5) {
            priority = 1;
            reboot = true;
        }
        if (getCreepCount(room, 'hauler') < amount || (getCreepTTL(room.name, 'hauler') < 250 && getCreepCount(room, 'hauler') === amount)) {
            queueCreep(room, priority, {
                role: 'hauler',
                other: {reboot: reboot}
            });
        }
        // Spawn shuttles for harvesters with no link
        if (!room.memory.hubLink && room.storage) {
            let noLink = _.filter(room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && c.memory.onContainer && !c.memory.linkID).length;
            if (getCreepCount(room, 'shuttle') < noLink) {
                queueCreep(room, PRIORITIES.hauler, {
                    role: 'shuttle'
                });
            }
        }
    }
    // Local Responder
    if (room.memory.spawnDefenders || room.memory.defenseCooldown > Game.time) {
        if (getCreepCount(room, 'defender') < 2 || (getCreepTTL(room.name, 'defender') < 100 && getCreepCount(room, 'defender') === 2)) {
            queueCreep(room, PRIORITIES.defender, {
                role: 'defender',
                destination: room.name,
                military: true
            })
        }
    }
    // Upgrader
    // Determine amount
    // 1 If there's an empty container or special conditions
    // Else if there's a container it's the space around -1
    // No container it's 6
    let number = 1;
    let reboot = room.controller.ticksToDowngrade <= CONTROLLER_DOWNGRADE[level] * 0.9 || room.controller.progress > room.controller.progressTotal || Memory.roomCache[room.name].threatLevel >= 3 || room.memory.spawnDefenders;
    if (room.controller.level < 8 && room.level === room.controller.level && !_.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_ROAD).length) {
        let container = Game.getObjectById(room.memory.controllerContainer);
        if (container) {
            if (container.store[RESOURCE_ENERGY] < 500) number = 1;
            else {
                let space = container.pos.countOpenTerrainAround(false) - 1 || 1;
                number = 1 + ((container.store[RESOURCE_ENERGY] - 500) / 250);
                if (number > space) number = space;
            }
        } else number = 6;
    }
    if (getCreepCount(room, 'upgrader') < number) {
        //If room is about to downgrade get a creep out asap
        let priority = PRIORITIES.upgrader + getCreepCount(room, 'upgrader');
        if (reboot) priority = 2;
        queueCreep(room, priority, {
            role: 'upgrader',
            other: {noBump: true, reboot: reboot}
        })
    }
};

//Non essential creeps
let miscTick = {};
module.exports.miscCreepQueue = function (room) {
    if (miscTick[room.name] + 10 > Game.time) return;
    miscTick[room.name] = Game.time;
    let level = getLevel(room);
    //Drones
    if (!getCreepCount(room, 'drone')) {
        let number = 1;
        if (Memory.roomCache[room.name].threatLevel) number = 2;
        else if (room.constructionSites.length && _.find(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD)) number = 12 - room.controller.level;
        if (getCreepCount(room, 'drone') < number) {
            queueCreep(room, PRIORITIES.drone + getCreepCount(room, 'drone'), {
                role: 'drone',
                other: {reboot: room.friendlyCreeps.length <= 3}
            })
        }
    }
    // If no conflict detected
    if (!room.nukes.length && !Memory.roomCache[room.name].threatLevel) {
        // Score delivery
        /** Season 1
         if (Game.shard.name === 'shardSeason' && room.store(RESOURCE_SCORE)) {
            let number = 2;
            let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => r.seasonCollector === 1 && !r.hostile && !_.includes(Memory.nonCombatRooms, r.name)), 'closestRange');
            if (scoreRoom && scoreRoom.name && Game.rooms[scoreRoom.name]) {
                if (Game.rooms[scoreRoom.name].findClosestOwnedRoom(false, 6) === room.name) number = 8;
                if (getCreepCount(room, 'scoreHauler') < number) queueCreep(room, PRIORITIES.miscHauler + getCreepCount(room, 'scoreHauler'), {
                    role: 'scoreHauler',
                    misc: true
                })
            }
        }**/
        /**
        let decoderAvailable;
        if (Game.shard.name === 'shardSeason' && Memory.ownedSymbols.length && (!room.memory.defenseCooldown || room.memory.defenseCooldown < Game.time)) {
            room.memory.defenseCooldown = undefined;
            shuffle(Memory.ownedSymbols).forEach(function (s) {
                if (room.store(s)) decoderAvailable = s;
            })
            if (decoderAvailable && getCreepCount(room, 'symbolHauler') < 2) {
                queueCreep(room, PRIORITIES.miscHauler + getCreepCount(room, 'symbolHauler'), {
                    role: 'symbolHauler',
                    other: {resourceType: decoderAvailable}
                })
            }
        }**/
        if (Game.shard.name === "shardSeason") {
            let scoreRoom = _.min(_.filter(Memory.roomCache, (r) => r.seasonReactor && r.seasonReactorOwner === MY_USERNAME && !_.includes(Memory.nonCombatRooms, r.name)), 'closestRange');
            let thorium = _.find(room.structures, (s) => s && s.store && s.store[RESOURCE_THORIUM]);
            if (scoreRoom && scoreRoom.name && thorium) {
                if (getCreepCount(room, 'scoreHauler') < 5) queueCreep(room, PRIORITIES.priority + getCreepCount(room, 'scoreHauler'), {
                    role: 'scoreHauler',
                    misc: true
                })
            }
        }
        if (room.terminal && level >= 6) {
            //LabTech
            if (!getCreepCount(room, 'labTech')) {
                queueCreep(room, PRIORITIES.miscHauler, {role: 'labTech'})
            }
            //Power
            if (room.energyState && level === 8 && room.store(RESOURCE_POWER)) {
                if (!getCreepCount(room, 'powerManager')) {
                    queueCreep(room, PRIORITIES.miscHauler, {role: 'powerManager'})
                }
            }
        }
        //Mineral Harvester
        if (room.mineral.mineralAmount && !getCreepCount(room, 'mineralHarvester') && room.store(room.mineral.mineralType) < 100000) {
            if (_.find(room.structures, (s) => s.structureType === STRUCTURE_EXTRACTOR)) {
                queueCreep(room, PRIORITIES.mineralHarvester, {
                    role: 'mineralHarvester',
                    other: {noBump: true, assignedMineral: room.mineral.id}
                })
            }
        }
        //Pre observer spawn explorers
        if (Memory.maxLevel < 8 && Game.cpu.bucket === BUCKET_MAX && getCreepCount(room, 'explorer') < 5) {
            queueCreep(room, PRIORITIES.explorer, {role: 'explorer'})
        }
        // Portal explorers
        let localPortal = _.find(Memory.roomCache, (r) => r.portal && Game.map.getRoomLinearDistance(r.name, room.name) <= 5);
        if (localPortal) {
            if (!_.find(Game.creeps, (c) => c.my && c.memory.role === 'explorer' && c.memory.other && c.memory.other.portalForce === localPortal.name)) {
                queueCreep(room, PRIORITIES.explorer, {
                    role: 'explorer',
                    destination: localPortal.name,
                    other: {portalForce: localPortal.name}
                })
            }
        }
        // Assist room
        if (level >= 3) {
            // Defense
            let needsDefense = _.find(Memory.myRooms, (r) => Game.rooms[r].memory.dangerousAttack || Game.rooms[r].memory.defenseCooldown > Game.time);
            if (needsDefense) {
                if (getCreepCount(undefined, 'longbow', needsDefense) < 2) {
                    queueCreep(room, PRIORITIES.priority, {
                        role: 'longbow',
                        destination: needsDefense,
                        operation: 'guard',
                        military: true
                    });
                }
            }
            let safeToSupport = _.filter(Memory.myRooms, (r) => !Memory.roomCache[r] || !Memory.roomCache[r].threatLevel);
            let needDrones = _.sample(_.filter(safeToSupport, ((r) => r !== room.name && Game.rooms[r].memory.buildersNeeded)));
            if (needDrones) {
                let amount = 6;
                if (getCreepCount(undefined, 'drone', needDrones) < amount) {
                    queueCreep(room, PRIORITIES.assistPioneer + getCreepCount(room, 'drone', needDrones), {
                        role: 'drone',
                        destination: needDrones
                    });
                }
            }
        }
        //Border Patrol
        if (room.memory.borderPatrol) {
            if (!getCreepCount(room, 'longbow', undefined, 'borderPatrol')) {
                queueCreep(room, PRIORITIES.responder, {
                    role: 'longbow',
                    operation: 'borderPatrol',
                    military: true,
                    destination: room.memory.borderPatrol
                });
            } else {
                room.memory.borderPatrol = undefined;
            }
        }
    }
};

//Remote creeps
let remoteTick = {};
module.exports.remoteCreepQueue = function (room) {
    if (remoteTick[room.name] + 10 > Game.time) return;
    remoteTick[room.name] = Game.time;
    room.memory.borderPatrol = undefined;
    if (!Memory.roomCache) Memory.roomCache = {};
    if (!remoteHives[room.name] || Math.random() > 0.5) {
        // Clean old Remotes
        remoteHives[room.name] = undefined;
        // Find rooms around you using roomCache with remote possibilities
        let sourceCount = 0;
        let adjacent = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].level && !Memory.roomCache[r].isHighway && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
            (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME || !_.includes(FRIENDLIES, Memory.roomCache[r].user)) &&
            (!Memory.roomCache[r].owner || Memory.roomCache[r].invaderCore) && (!Memory.roomCache[r].sk || room.level >= 7) && _.filter(Memory.roomCache[r].sourceRating, (s) => s <= REMOTE_SOURCE_SCORE).length);
        // Handle highway dead-end
        if (!adjacent.length) {
            let highway = _.filter(Game.map.describeExits(room.name), (r) => Memory.roomCache[r] && !Memory.roomCache[r].owner && Memory.roomCache[r].isHighway);
            if (highway.length) {
                adjacent = _.filter(Game.map.describeExits(highway[0]), (r) => Memory.roomCache[r] && !Memory.roomCache[r].isHighway && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && !Memory.roomCache[r].owner && (!Memory.roomCache[r].roomHeat || Memory.roomCache[r].roomHeat < 2000));
            }
        }
        if (adjacent.length) adjacent.forEach((r) => sourceCount += Memory.roomCache[r].sources || 1);
        // Handle less than desired
        let secondary = [];
        if (sourceCount < REMOTE_SOURCE_TARGET) {
            for (let adjacentRoom of adjacent) {
                let secondaryAdjacent = _.filter(Game.map.describeExits(adjacentRoom), (r) => Memory.roomCache[r] &&
                    Memory.roomCache[r].sources && (!Memory.roomCache[r].user || Memory.roomCache[r].user === MY_USERNAME) && Game.map.getRoomStatus(r).status === Game.map.getRoomStatus(room.name).status &&
                    !Memory.roomCache[r].owner && !Memory.roomCache[r].sk && Memory.roomCache[r].closestRoom === room.name && _.filter(Memory.roomCache[r].sourceRating, (s) => s <= REMOTE_SOURCE_SCORE * 1.5).length);
                if (secondaryAdjacent.length) secondary = secondary.concat(secondaryAdjacent);
            }
            if (secondary.length) adjacent = adjacent.concat(secondary);
        }
        if (adjacent.length) {
            room.memory.remoteSourceCount = sourceCount;
            let remotes = _.uniq(adjacent);
            let remoteSources = [];
            remotes.forEach(function (r) {
                let sourceRating = Memory.roomCache[r].sourceRating;
                if (sourceRating) {
                    for (const [key, value] of Object.entries(sourceRating)) {
                        remoteSources.push({'room': r, 'id': key, 'score': value});
                    }
                }
            })
            remoteHives[room.name] = JSON.stringify(_.sortBy(remoteSources, 'score'));
        }
    }
    //Remotes
    let remotes, skMining;
    if (remoteHives[room.name] && JSON.parse(remoteHives[room.name]).length) {
        remotes = JSON.parse(remoteHives[room.name]);
        // Check if SK mining
        if (room.level >= 7 && _.find(remotes, (r) => Memory.roomCache[r.room].sk && !Memory.roomCache[r.room].invaderCore && !Memory.roomCache[r.room].threatLevel)) skMining = true;
        for (let source of remotes) {
            let remoteName = source.room;
            // If avoid is set continue
            if (Memory.avoidRemotes && _.includes(Memory.avoidRemotes, remoteName)) continue;
            // If owned or a highway continue
            if (Memory.roomCache[remoteName] && (Memory.roomCache[remoteName].level || !Memory.roomCache[remoteName].sources)) continue;
            // If heat is high skip
            if (Memory.roomCache[remoteName].roomHeat > 250) {
                continue;
            }
            // If it's being heavily camped just skip it
            if (Memory.roomCache[remoteName].threatLevel >= 3) continue;
            // Handle invaders
            if ((Memory.roomCache[remoteName].invaderCore || Memory.roomCache[remoteName].threatLevel || (Memory.roomCache[remoteName].user && !_.includes(FRIENDLIES, Memory.roomCache[remoteName].user))) && !Memory.roomCache[remoteName].sk) {
                if (Memory.roomCache[remoteName].invaderTTL && Memory.roomCache[remoteName].invaderTTL < Game.time) {
                    if (!getCreepCount(undefined, 'scout', remoteName)) {
                        queueCreep(room, PRIORITIES.high, {role: 'scout', destination: remoteName})
                    }
                    continue;
                }
                // Handle invader cores with a deconstructor and reserver
                if (Memory.roomCache[remoteName].invaderCore || (Memory.roomCache[remoteName].user && !_.includes(FRIENDLIES, Memory.roomCache[remoteName].user))) {
                    if (!getCreepCount(undefined, 'attacker', remoteName)) {
                        queueCreep(room, PRIORITIES.high, {
                            role: 'attacker',
                            military: true,
                            destination: remoteName
                        })
                    } else if (!getCreepCount(undefined, 'longbow', remoteName)) {
                        queueCreep(room, PRIORITIES.high, {
                            role: 'longbow',
                            military: true,
                            operation: 'guard',
                            destination: remoteName
                        })
                    }
                    if (!getCreepCount(undefined, 'reserver', remoteName)) {
                        queueCreep(room, PRIORITIES.high, {
                            role: 'reserver',
                            destination: remoteName
                        })
                    }
                }
                if (room.energyState) room.memory.borderPatrol = remoteName;
                continue;
            }
            if (Memory.roomCache[remoteName] && Memory.roomCache[remoteName].reservation && Memory.roomCache[remoteName].reservation !== MY_USERNAME) continue;
            // Handle rooms that can't be reached safely
            if (!room.routeSafe(remoteName)) continue;
            // Handle SK
            if (Memory.roomCache[remoteName].sk && room.level >= 7) {
                // If invader core continue
                if (Memory.roomCache[remoteName].invaderCore) continue;
                if (!getCreepCount(undefined, 'SKAttacker', remoteName) || (getCreepTTL(remoteName, 'SKAttacker') < 250 && getCreepCount(undefined, 'SKAttacker', remoteName) === 1)) {
                    queueCreep(room, PRIORITIES.remoteHarvester - 1, {
                        role: 'SKAttacker',
                        military: true,
                        destination: remoteName
                    })
                }
                let harvester = _.filter(Game.creeps, (c) => c.my && c.memory.other && c.memory.other.source === source.id)[0];
                if (getCreepCount(undefined, 'SKAttacker', remoteName) && !harvester) {
                    queueCreep(room, PRIORITIES.remoteHarvester, {
                        role: 'remoteHarvester',
                        destination: remoteName,
                        other: {noBump: true, source: source.id, SK: true}
                    })
                }
                if (getCreepCount(undefined, 'SKAttacker', remoteName) && !getCreepCount(undefined, 'SKMineral', remoteName) && (!Memory.roomCache[remoteName].mineralCooldown || Memory.roomCache[remoteName].mineralCooldown < Game.time)) {
                    queueCreep(room, PRIORITIES.SKWorker, {role: 'SKMineral', destination: remoteName})
                }
            } else if (!Memory.roomCache[remoteName].sk && (Game.cpu.bucket === BUCKET_MAX || !skMining)) {
                let multi = (ENERGY_AMOUNT[room.level || 1] * 2) / room.energy;
                if (!room.storage || multi > 2) multi = 2;
                else if (multi < 0.1) multi = 0.1;
                let score = REMOTE_SOURCE_SCORE * multi;
                if (skMining) score = REMOTE_SOURCE_SCORE * (multi * 0.7);
                if (source.score <= REMOTE_SOURCE_SCORE) {
                    let harvester = _.filter(Game.creeps, (c) => c.my && c.memory.other && c.memory.other.source === source.id)[0];
                    if (!harvester) {
                        queueCreep(room, PRIORITIES.remoteHarvester, {
                            role: 'remoteHarvester',
                            destination: remoteName,
                            other: {noBump: true, source: source.id}
                        })
                    }
                }
                if (room.level >= 4 && (!Memory.roomCache[remoteName].reservationExpires || Game.time > Memory.roomCache[remoteName].reservationExpires) && Memory.roomCache[remoteName].sources < 3) {
                    let amount = Memory.roomCache[remoteName].reserverCap || 1;
                    if (Memory.roomCache[remoteName].reservation && amount > 2) amount = 2;
                    if (getCreepCount(undefined, 'reserver', remoteName) < amount) {
                        queueCreep(room, PRIORITIES.reserver + getCreepCount(room, 'reserver', remoteName), {
                            role: 'reserver',
                            destination: remoteName
                        })
                    }
                }
                // Handle middle room case with mineral
                if (room.energyState && Memory.roomCache[remoteName] && Memory.roomCache[remoteName].sources >= 3) {
                    if (!getCreepCount(undefined, 'SKMineral', remoteName) && (!Memory.roomCache[remoteName].mineralCooldown || Memory.roomCache[remoteName].mineralCooldown < Game.time)) {
                        queueCreep(room, PRIORITIES.SKWorker, {role: 'SKMineral', destination: remoteName})
                    }
                }
                // Obstructions
                if (Memory.roomCache[remoteName] && Memory.roomCache[remoteName].obstructions) {
                    if (!getCreepCount(undefined, 'deconstructor', remoteName)) {
                        queueCreep(room, PRIORITIES.secondary, {role: 'deconstructor', destination: remoteName})
                    }
                }
            }
        }
        // Haulers
        if (getCreepCount(room, 'remoteHarvester')) {
            // Remote Hauler (determined based on range)
            let unassignedHauler = _.find(Game.creeps, (c) => c.my && c.memory.overlord === room.name && !c.memory.misc && c.memory.role === 'remoteHauler');
            if (!unassignedHauler) {
                let harvesters = _.filter(Game.creeps, (c) => c.my && c.memory.overlord === room.name && c.memory.role === 'remoteHarvester' && c.memory.carryAmountNeeded && !Memory.roomCache[c.memory.destination].threatLevel);
                for (let creep of harvesters) {
                    let assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.misc === creep.id);
                    let current = 0;
                    if (assignedHaulers.length) {
                        if (Game.cpu.bucket !== BUCKET_MAX) continue;
                        assignedHaulers.forEach((c) => current += c.store.getCapacity())
                        if (current >= creep.memory.carryAmountNeeded || assignedHaulers.length >= REMOTE_HAULER_CAP || creep.memory.carryAmountNeeded - current < 300) continue;
                    }
                    queueCreep(room, PRIORITIES.remoteHauler + (assignedHaulers.length * 2) + getCreepCount(room, 'remoteHauler'), {
                        role: 'remoteHauler',
                        misc: creep.id
                    })
                    break;
                }
            }
            // Remote Road Builder
            if (getCreepCount(room, 'roadBuilder') < 2) {
                queueCreep(room, PRIORITIES.roadBuilder, {
                    role: 'roadBuilder',
                    misc: _.pluck(JSON.parse(remoteHives[room.name]), 'room')
                })
            }
        }
        // Mineral mining center rooms
        // TODO: Move to an operation
        /**
         if (room.storage) {
            if (!centerRoom[room.name]) {
                let center = _.find(Memory.roomCache, (r) => !r.sk && r.sources >= 3 && Game.map.getRoomLinearDistance(room.name, r.name) <= 4);
                if (center) {
                    centerRoom[room.name] = center.name;
                }
            } else {
                if (!getCreepCount(undefined, 'SKMineral', centerRoom[room.name]) && (!Memory.roomCache[centerRoom[room.name]] || (!Memory.roomCache[centerRoom[room.name]].mineralCooldown || Memory.roomCache[centerRoom[room.name]].mineralCooldown < Game.time))) {
                    queueCreep(room, PRIORITIES.medium, {role: 'SKMineral', destination: centerRoom[room.name]})
                }
            }
        }**/
    }
};

//Military creeps
let lastGlobalTick = 0;
module.exports.globalCreepQueue = function () {
    if (lastGlobalTick + 15 > Game.time) return;
    lastGlobalTick = Game.time;
    let operations = Object.assign({}, Memory.targetRooms, Memory.auxiliaryTargets);
    // Targets
    if (!_.size(operations)) return;
    for (let key in shuffle(operations)) {
        // Clear bogus rooms
        if (!operations[key] || !Game.map.describeExits(key)) {
            Memory.targetRooms[key] = undefined;
            Memory.auxiliaryTargets[key] = undefined;
            continue;
        }
        let opLevel = operations[key].level;
        let priority = operations[key].priority || 4;
        //Observers
        if (opLevel === 0 && !operations[key].observerCheck) {
            if (!getCreepCount(undefined, 'scout', key)) {
                queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: key, military: true})
            }
            continue;
        }
        // Set priority
        switch (priority) {
            case 4:
                priority = PRIORITIES.secondary;
                break;
            case 3:
                priority = PRIORITIES.medium;
                break;
            case 2:
                priority = PRIORITIES.high;
                break;
            case 1:
                priority = PRIORITIES.urgent;
                break;
            case 99:
                priority = PRIORITIES.priority;
                break;
        }
        // Guard requests
        if (operations[key].guard && (!getCreepCount(undefined, 'longbow', key) || (getCreepTTL(key, 'longbow') < 500 && getCreepCount(undefined, 'longbow', key) === 1))) {
            queueGlobalCreep(priority, {role: 'longbow', destination: key, military: true});
        }
        switch (operations[key].type) {
            // Testing
            case 'test':
                if (getCreepCount(undefined, 'tester', key) < 4) {
                    queueGlobalCreep(priority, {role: 'tester', destination: key, military: true});
                }
                break;
            // Rebuilding allies
            case 'rebuild':
                if (getCreepCount(undefined, 'drone', key) < 5) {
                    queueGlobalCreep(priority, {
                        role: 'drone',
                        destination: key,
                        military: true
                    });
                }
                break;
            // Scoring
            case 'score':
                if (!getCreepCount(undefined, 'symbolHauler', key)) {
                    queueGlobalCreep(priority + getCreepCount(undefined, 'symbolHauler', key), {
                        role: 'symbolHauler',
                        destination: key,
                        military: true
                    });
                }
                break;
            case 'scoreCleaner': // Score Cleaning
                if (!getCreepCount(undefined, 'deconstructor', key) || (getCreepTTL(key, 'deconstructor') < 100 && getCreepCount(undefined, 'deconstructor', key) === 1)) {
                    queueGlobalCreep(PRIORITIES.high, {role: 'deconstructor', destination: key, military: true})
                }
                break;
            // Claiming
            case 'claim':
                if (!getCreepCount(undefined, 'claimer', key)) {
                    queueGlobalCreep(PRIORITIES.claimer, {role: 'claimer', destination: key, military: true});
                }
                break;
            // Scout ops
            case 'attack':
            case 'scout':
                if (!getCreepCount(undefined, 'scout', key)) {
                    queueGlobalCreep(PRIORITIES.priority, {role: 'scout', destination: key, military: true})
                }
                break;
            case 'commodity': // Commodity Mining
                let commoditySpace = operations[key].space || 2;
                if (getCreepCount(undefined, 'commodityMiner', key) < commoditySpace) {
                    queueGlobalCreep(priority, {role: 'commodityMiner', destination: key, military: true})
                }
                break;
            case 'robbery': // Robbery
                if (getCreepCount(undefined, 'robber', key) < 2) {
                    queueGlobalCreep(priority, {role: 'robber', destination: key, military: true})
                }
                break;
            case 'power': // Power Mining
                let powerSpace = operations[key].space || 2;
                let powerHealer = getCreepCount(undefined, 'powerHealer', key);
                let powerAttacker = getCreepCount(undefined, 'powerAttacker', key);
                let powerHealerTTL, powerAttackerTTL;
                if (creepTTL[key]) {
                    powerHealerTTL = creepTTL[key]['powerHealer'] || undefined;
                    powerAttackerTTL = creepTTL[key]['powerAttacker'] || undefined;
                }
                if (!operations[key].complete && (powerHealer < powerAttacker + 1 || (powerHealerTTL && powerHealerTTL < 450 && powerHealer < (powerAttacker + 1) + 1))) {
                    queueGlobalCreep(priority, {role: 'powerHealer', destination: key, military: true})
                }
                if (!operations[key].complete && (powerAttacker < powerSpace || (powerAttackerTTL && powerAttackerTTL < 450 && powerAttacker < powerSpace + 1))) {
                    queueGlobalCreep(priority - 1, {role: 'powerAttacker', destination: key, military: true})
                }
                if (operations[key].hauler && getCreepCount(undefined, 'powerHauler', key) < operations[key].hauler) {
                    queueGlobalCreep(priority - 1, {role: 'powerHauler', destination: key, military: true})
                }
                break;
            case 'harass': // Harass Room
                let remotes = _.filter(_.map(Game.map.describeExits(key)), (r) => !Memory.roomCache[r] || !Memory.roomCache[r].owner);
                let harassers = _.filter(Game.creeps, (c) => c.my && c.memory.other && c.memory.other.target === key);
                // Camp remotes unless an ally controls them or they're owned
                if (harassers.length < remotes.length * 1.25) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: _.sample(remotes),
                        operation: 'harass',
                        military: true,
                        other: {target: key}
                    })
                }
                break;
            case 'hold': // Hold Room
                if (getCreepCount(undefined, 'longbow', key) < opLevel) {
                    queueGlobalCreep(priority + getCreepCount(undefined, 'longbow', key), {
                        role: 'longbow',
                        destination: key,
                        operation: 'hold',
                        military: true
                    })
                }
                if (operations[key].claimAttacker) {
                    if (!getCreepCount(undefined, 'claimAttacker', key)) {
                        queueGlobalCreep(priority + 1, {
                            role: 'claimAttacker',
                            destination: key,
                            operation: 'hold',
                            military: true
                        })
                    }
                }
                if (operations[key].cleaner) {
                    if (getCreepCount(undefined, 'deconstructor', key) < 2) {
                        queueGlobalCreep(priority + 1, {
                            role: 'deconstructor',
                            destination: key,
                            operation: 'hold',
                            military: true
                        })
                    }
                }
                break;
            case 'siegeGroup': //Siege Group
                if (getCreepCount(undefined, 'longbow', key) < 2) {
                    queueGlobalCreep(priority - getCreepCount(undefined, 'longbow', key), {
                        role: 'longbow',
                        destination: key,
                        operation: 'siegeGroup',
                        military: true
                    })
                }
                if (operations[key].cleaner) {
                    if (getCreepCount(undefined, 'deconstructor', key) < 2) {
                        queueGlobalCreep(priority, {
                            role: 'deconstructor',
                            destination: key,
                            operation: 'siegeGroup',
                            military: true
                        })
                    }
                }
                break;
            case 'claimClear': //Claim Clearing
                if (!getCreepCount(undefined, 'claimer', key)) {
                    queueGlobalCreep(priority, {
                        role: 'claimer',
                        destination: key,
                        operation: 'claimClear',
                        military: true
                    })
                }
                break;
            case 'drain': // Drain
                if (getCreepCount(undefined, 'drainer', key) < 2) {
                    queueGlobalCreep(priority, {
                        role: 'drainer',
                        destination: key,
                        operation: 'drain',
                        military: true
                    })
                }
                break;
            case 'guard': // Room Guard
                if (getCreepCount(undefined, 'longbow', key) < opLevel || (getCreepTTL(key, 'longbow') < 750 && getCreepCount(undefined, 'longbow', key) === opLevel)) {
                    queueGlobalCreep(priority, {
                        role: 'longbow',
                        destination: key,
                        operation: 'guard',
                        military: true
                    })
                }
                if (operations[key].claimer) {
                    if (!getCreepCount(undefined, 'reactorClaimer', key)) {
                        queueGlobalCreep(priority - 1 || 1, {
                            role: 'reactorClaimer',
                            destination: key,
                            military: true
                        })
                    }
                }
                break;
            case 'swarm': // Swarm
                if (getCreepCount(undefined, 'poke', key)) {
                    queueGlobalCreep(priority, {
                        role: 'poke',
                        destination: key,
                        operation: 'swarm',
                        military: true,
                        other: {waitFor: 75}
                    })
                }
                break;
        }
    }
};

/**
 *
 * @param room - Room object for room creeps
 * @param priority - Spawn Priority
 * @param options - Creep spawn options object
 * @param military - If military creep
 * @returns {*|number}
 */
function queueCreep(room, priority, options = {}, military = false) {
    let cache;
    if (!military) {
        cache = roomQueue[room.name] || {};
        if (cache[options.role] && cache[options.role].priority <= priority && (!options.other || !options.other.reboot)) return;
    } else {
        cache = globalQueue || {};
        if (cache[options.role] && cache[options.role].priority <= priority) return;
    }
    _.defaults(options, {
        role: undefined,
        assignedSource: undefined,
        destination: undefined,
        other: {},
        military: undefined,
        operation: undefined,
        misc: undefined
    });
    if (room) {
        let key = options.role;
        if (cache[key]) delete cache[key];
        cache[key] = {
            cached: Game.time,
            room: room.name,
            priority: priority,
            role: options.role,
            assignedSource: options.assignedSource,
            destination: options.destination,
            other: options.other,
            military: options.military,
            operation: options.operation,
            misc: options.misc
        };
        if (!military) {
            roomQueue[room.name] = cache;
        } else {
            console.log(JSON.stringify(cache))
            globalQueue = cache;
        }
    }
}

function queueGlobalCreep(priority, options = {}) {
    let cache;
    cache = globalQueue || {};
    if (cache[options.role] && cache[options.role].priority <= priority) return;
    _.defaults(options, {
        role: undefined,
        assignedSource: undefined,
        destination: undefined,
        military: undefined,
        other: {},
        operation: undefined,
        misc: undefined
    });
    let key = options.role;
    if (!key) return;
    cache[key] = {
        cached: Game.time,
        priority: priority,
        role: options.role,
        assignedSource: options.assignedSource,
        destination: options.destination,
        military: options.military,
        other: options.other,
        operation: options.operation,
        misc: options.misc
    };
    globalQueue = cache;
}

function determineEnergyOrder(room) {
    storedLevel[room.name] = getLevel(room);
    if (!room.memory.bunkerHub) return;
    if (!energyOrder[room.name] || orderStored[room.name] + 750 < Game.time) {
        let harvester = _.filter(room.creeps, (c) => c.my && c.memory.role === 'stationaryHarvester' && c.memory.onContainer);
        let hub = new RoomPosition(room.memory.bunkerHub.x, room.memory.bunkerHub.y, room.name);
        let energyStructures = _.filter(room.structures, (s) => s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION);
        let rangeArray = [];
        let usedIdArray = [];
        for (let x = 0; x < energyStructures.length; x++) {
            let nextClosest;
            let harvesterExtensions = _.filter(room.structures, (s) => !_.includes(usedIdArray, s.id) && (s.structureType === STRUCTURE_SPAWN || s.structureType === STRUCTURE_EXTENSION) && s.pos.findFirstInRange(harvester, 1));
            if (harvesterExtensions.length) {
                nextClosest = harvesterExtensions[0];
            } else {
                nextClosest = hub.findClosestByRange(energyStructures, {filter: (s) => !_.includes(usedIdArray, s.id)});
            }
            if (!nextClosest) break;
            usedIdArray.push(nextClosest.id);
            rangeArray.push(nextClosest);
        }
        energyOrder[room.name] = JSON.stringify(rangeArray);
        orderStored[room.name] = Game.time;
    }
}

function displayQueue(roomName) {
    let queue;
    let room = Game.rooms[roomName];
    if (!room) return;
    // Global queue, if far away or lacking energy it's low priority
    let combatQueue = {};
    if (room.level === room.controller.level && !room.controller.safemode && room.level >= 4 && _.size(globalQueue) && !Memory.roomCache[room.name].threatLevel) {
        Object.keys(globalQueue).forEach(function (q) {
            // If you're the closest room, bump up priority
            if (Memory.roomCache[globalQueue[q].destination] && Memory.roomCache[globalQueue[q].destination].closestRoom === room.name) {
                combatQueue[globalQueue.role] = globalQueue[q];
                combatQueue[globalQueue.role].priority *= 0.75;
            } else if (globalQueue[q].destination) {
                let distance = Game.map.getRoomLinearDistance(globalQueue[q].destination, room.name);
                if (distance > ROOM_INFLUENCE_RANGE) return; else if (distance > ROOM_INFLUENCE_RANGE * 0.25) {
                    combatQueue[globalQueue.role] = globalQueue[q];
                    combatQueue[globalQueue.role].priority = PRIORITIES.secondary;
                }
            }
        })
        queue = _.sortBy(Object.assign({}, combatQueue, roomQueue[room.name]), 'priority');
    } else if (_.size(roomQueue[room.name])) {
        queue = _.sortBy(Object.assign({}, roomQueue[room.name]), 'priority');
    }
    let roles = _.pluck(queue, 'role');
    let tickQueued = _.pluck(queue, 'cached');
    let military = _.pluck(queue, 'military');
    let activeSpawns = _.filter(room.structures, (s) => s.my && s.structureType === STRUCTURE_SPAWN && s.spawning);
    let lower = _.size(queue) + activeSpawns.length + 2;
    if (lower > 9) lower = 9;
    room.visual.rect(34, 0, 49, lower, {
        fill: '#ffffff',
        opacity: '0.55',
        stroke: 'black'
    });
    displayText(room, 35, 1, 'Creep Build Queue');
    if (_.size(queue) + activeSpawns.length === 0) return;
    let i = 0;
    if (_.size(queue)) {
        for (i = 0; i < 5; i++) {
            if (!roles[i]) break;
            let mil = '';
            if (military[i]) mil = '*';
            let cost = global.UNIT_COST(generator.bodyGenerator(room.level, roles[i], room, queue[i]));
            displayText(room, 35, 2 + i, _.capitalize(roles[i]) + mil + ': Cost - ' + room.energyAvailable + '/' + cost + ' Age - ' + (Game.time - tickQueued[i]));
        }
    }
    // Display spawning
    for (let spawn of activeSpawns) {
        let spawningCreep = Game.creeps[spawn.spawning.name];
        displayText(room, 35, 2 + i, 'Spawning - ' + _.capitalize(spawningCreep.name.split("_")[0]) + ' - Ticks: ' + spawn.spawning.remainingTime);
        i++;
    }
    return queue;
}

function cacheCounts() {
    if (!creepCount || creepCount.tick !== Game.time) {
        creepCount = {};
        let creeps = _.filter(Game.creeps, (r) => r.my && r.memory.role);
        for (let creep of creeps) {
            // Set role object
            if (!creepCount[creep.memory.role]) creepCount[creep.memory.role] = {};
            // Overlord Counts
            if (!creepCount[creep.memory.role][creep.memory.overlord]) creepCount[creep.memory.role][creep.memory.overlord] = 0;
            creepCount[creep.memory.role][creep.memory.overlord]++;
            // Handle destination
            if (creep.memory.destination) {
                let destination = creep.memory.destination;
                if (!creepCount[creep.memory.role][destination]) creepCount[creep.memory.role][destination] = 0;
                creepCount[creep.memory.role][destination]++;
            }
            // Handle operation
            if (creep.memory.operation) {
                if (!creepCount[creep.memory.role][creep.memory.operation]) {
                    creepCount[creep.memory.role][creep.memory.operation] = {};
                    creepCount[creep.memory.role][creep.memory.operation].total = 0;
                }
                creepCount[creep.memory.role][creep.memory.operation].total++;
                if (!creepCount[creep.memory.role][creep.memory.operation][creep.memory.overlord]) creepCount[creep.memory.role][creep.memory.operation][creep.memory.overlord] = 0;
                creepCount[creep.memory.role][creep.memory.operation][creep.memory.overlord]++;
                if (creep.memory.destination) {
                    let destination = creep.memory.destination;
                    if (!creepCount[creep.memory.role][creep.memory.operation][destination]) creepCount[creep.memory.role][creep.memory.operation][destination] = 0;
                    creepCount[creep.memory.role][creep.memory.operation][destination]++;
                }
            }
        }
        creepCount.tick = Game.time;
        return creepCount;
    } else {
        return creepCount;
    }
}

/**
 *
 * @param {object} room - Room object for room creeps
 * @param {string} role - Role
 * @param {string} destination - If filtering by destination room name
 * @param {string} operation - If filtering by operation type
 * @returns {*|number}
 */
function getCreepCount(room = undefined, role, destination, operation = undefined) {
    let creepData = cacheCounts();
    if (!creepData[role]) return 0;
    if (!destination && !operation && room) return creepData[role][room.name] || 0;
    else if (room && operation) {
        if (!creepData[role][operation]) return 0;
        return creepData[role][operation][room.name] || 0;
    } else if (destination && !operation) return creepData[role][destination] || 0;
    else if (!destination && operation) {
        if (!creepData[role][operation]) return 0;
        return creepData[role][operation].total || 0;
    } else if (destination && operation) return creepData[role][operation][destination] || 0;
}

/**
 *
 * @param {object} room - Room object for room creeps
 * @param {string} role - Role
 * @returns {*|number}
 */
function getCreepTTL(room, role) {
    let creeps = _.filter(Game.creeps, (r) => r.my && r.memory.role === role && (r.room.name === room || r.memory.destination === room));
    if (creeps.length) return _.min(creeps, '.ticksToLive').ticksToLive; else return 0;
}