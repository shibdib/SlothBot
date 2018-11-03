Creep.prototype.scoutRoom = function () {
    let sentence = [MY_USERNAME, 'Scout', 'Drone', 'For', this.memory.targetRoom];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    if (this.room.name !== this.memory.targetRoom) return this.shibMove(new RoomPosition(25, 25, this.memory.targetRoom), {
        range: 23,
        offRoad: true
    });
    this.room.cacheRoomIntel(true);
    // If room is no longer a target
    if (!Memory.targetRooms[this.room.name]) return this.memory.recycle = true;
    // Operation cooldown per room
    if (Memory.roomCache[this.room.name] && !Memory.roomCache[this.room.name].manual && Memory.roomCache[this.room.name].lastOperation && Memory.roomCache[this.room.name].lastOperation + ATTACK_COOLDOWN > Game.time) {
        delete Memory.targetRooms[this.room.name];
        return this.memory.recycle = true;
    }
    Memory.roomCache[this.room.name].lastOperation = Game.time;
    // Get current operations
    let totalCount = 0;
    if (_.size(Memory.targetRooms)) totalCount = _.size(_.filter(Memory.targetRooms, (t) => t.type !== 'attack' && t.type !== 'pending' && t.type !== 'poke' && t.type !== 'guard'));
    // Get available rooms
    let surplusRooms = _.filter(Memory.ownedRooms, (r) => r.memory.energySurplus).length;
    let maxLevel = _.max(Memory.ownedRooms, 'controller.level').controller.level;
    // Get room details
    let towers = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.isActive());
    let countableStructures = _.filter(this.room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_CONTAINER);
    let lootStructures = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_CONTAINER && s.structureType === STRUCTURE_TERMINAL && s.structureType === STRUCTURE_STORAGE && _.sum(s.store) > 0);
    let controller = this.room.controller;
    if (controller && controller.owner && controller.owner.username === MY_USERNAME) return this.memory.recycle = true;
    // Prioritize based on range
    let range = this.room.findClosestOwnedRoom(true);
    let priority = 4;
    if (range === 1) priority = 1; else if (range <= 3) priority = 2; else if (range <= 5) priority = 3; else priority = 4;
    // Plan op based on room comp
    let cache = Memory.targetRooms || {};
    let tick = Game.time;
    let otherCreeps = _.filter(this.room.creeps, (c) => !c.my && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper');
    let armedHostiles = _.filter(otherCreeps, (c) => !c.my && (c.getActiveBodyparts(ATTACK) > 0 || c.getActiveBodyparts(RANGED_ATTACK) > 0) && !_.includes(FRIENDLIES, c.owner.username));
    let ramparts = _.filter(this.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits > 1000);
    if (totalCount < surplusRooms || priority === 1 || Memory.targetRooms[this.room.name].local || !totalCount) {
        delete Memory.targetRooms[this.room.name];
        // If the room has no controller
        if (!controller) {
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
            // If owned room has no towers
            if ((!towers.length || _.max(towers, 'energy').energy < 10)) {
                // Set room to be raided for loot if some is available
                if (lootStructures.length && !otherCreeps.length) {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'robbery',
                        level: 1,
                        priority: priority
                    };
                    // Otherwise try to hold the room
                } else {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'hold',
                        level: 0,
                        priority: 1
                    };
                }
                // If owned room has tower
            } else {
                // If we dont have any level 8 rooms
                if (maxLevel < 8) {
                    // If there's one tower send in the conscripts
                    if (towers.length < 2) {
                        cache[this.room.name] = {
                            tick: tick,
                            type: 'conscripts',
                            level: 1,
                            priority: priority
                        };
                    }
                    // If there's no active guards, no ramparts, and we have enough rooms swarm
                    else if (towers.length <= 2 && !armedHostiles.length && !ramparts.length && Memory.ownedRooms.length >= 2) {
                        cache[this.room.name] = {
                            tick: tick,
                            type: 'swarm',
                            level: towers.length,
                            priority: priority
                        };
                        // Try to drain the towers
                    } else {
                        cache[this.room.name] = {
                            tick: tick,
                            type: 'drain',
                            level: towers.length,
                            priority: priority
                        };
                    }
                    // If we do have level 8 rooms
                } else {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'siege',
                        level: towers.length,
                        priority: priority
                    };
                }
            }
            // If the room is unowned
        } else if (!controller.owner) {
            // If other creeps are present
            if (otherCreeps.length) {
                // If far away set it as a poke
                if (priority >= 4) {
                    cache[this.room.name] = {
                        tick: tick,
                        type: 'poke',
                        level: 1,
                        priority: priority
                    };
                    // Otherwise use old harass
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
    } else {
        delete Memory.targetRooms[this.room.name];
    }
    Memory.targetRooms = cache;
    return this.memory.recycle = true;
};