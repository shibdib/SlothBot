/**
 * Created by rober on 7/5/2017.
 */
'use strict';

Room.prototype.getConstructionSites = function () {
    if (!this.constructionSites) {
        this.constructionSites = JSON.parse(JSON.stringify(this.find(FIND_CONSTRUCTION_SITES)));
    }
    return this.constructionSites;
};

Room.prototype.getDroppedResources = function () {
    if (!this.droppedResources) {
        this.droppedResources = this.find(FIND_DROPPED_RESOURCES);
    }
    return this.droppedResources;
};

Room.prototype.getExtensionCount = function () {
    let level = this.controller.level;
    if (level === 1) {
        return RCL_1_EXTENSIONS;
    } else if (level === 2) {
        return RCL_2_EXTENSIONS
    } else if (level === 3) {
        return RCL_3_EXTENSIONS
    } else if (level === 4) {
        return RCL_4_EXTENSIONS
    } else if (level === 5) {
        return RCL_5_EXTENSIONS
    } else if (level === 6) {
        return RCL_6_EXTENSIONS
    } else if (level === 7) {
        return RCL_7_EXTENSIONS
    } else if (level === 8) {
        return RCL_8_EXTENSIONS
    }
};

Room.prototype.processBuildQueue = function () {
    for (let name in Game.spawns) {
        let spawn = Game.spawns[name];
        let level = getLevel(spawn);
        if (!spawn.spawning) {
            if (spawn.room.memory.creepBuildQueue) {
                let topPriority = _.min(spawn.room.memory.creepBuildQueue, 'importance');
                let role = topPriority.role;
                let body = _.get(SPAWN[level], role);
                if (topPriority && typeof topPriority === 'object') {
                    _.defaults(topPriority, {
                        role: undefined,
                        assignedRoom: undefined,
                        assignedSource: undefined,
                        destination: undefined,
                        assignedMineral: undefined,
                        responseTarget: undefined,
                        attackTarget: undefined,
                        attackType: undefined,
                        siegePoint: undefined,
                        staging: undefined,
                        waitForHealers: undefined,
                        waitForAttackers: undefined,
                        waitForRanged: undefined,
                        waitForDeconstructor: undefined
                    });
                    if (spawn.createCreep(body, role + Game.time, {
                            born: Game.time,
                            role: topPriority.role,
                            assignedRoom: topPriority.assignedRoom,
                            assignedSource: topPriority.assignedSource,
                            destination: topPriority.destination,
                            assignedMineral: topPriority.assignedMineral,
                            responseTarget: topPriority.responseTarget,
                            attackTarget: topPriority.attackTarget,
                            attackType: topPriority.attackType,
                            siegePoint: topPriority.siegePoint,
                            staging: topPriority.staging,
                            waitForHealers: topPriority.waitForHealers,
                            waitForAttackers: topPriority.waitForAttackers,
                            waitForRanged: topPriority.waitForRanged,
                            waitForDeconstructor: topPriority.waitForDeconstructor
                        }) === role + Game.time) {
                        console.log(spawn.room.name + ' Spawning a ' + role);
                        delete spawn.room.memory.creepBuildQueue[topPriority.role];
                        return;
                    } else {
                        let chance = _.min(spawn.pos.findInRange(FIND_MY_CREEPS, 1), 'ticksToLive');
                        if (chance && chance.ticksToLive < 1000) spawn.renewCreep(chance);
                        spawn.room.visual.text('Queued - ' +
                            _.capitalize(topPriority.role),
                            spawn.pos.x + 1,
                            spawn.pos.y,
                            {align: 'left', opacity: 0.8}
                        );
                    }
                }
            }
        } else {
            let spawningCreep = Game.creeps[spawn.spawning.name];
            spawn.room.visual.text(
                spawningCreep.memory.role,
                spawn.pos.x + 1,
                spawn.pos.y,
                {align: 'left', opacity: 0.8}
            );
        }
    }
};

function getLevel(spawn) {
    let energy = spawn.room.energyCapacityAvailable;
    if (energy >= RCL_1_ENERGY && energy < RCL_2_ENERGY) {
        return 1;
    } else if (energy >= RCL_2_ENERGY && energy < RCL_3_ENERGY) {
        return 2
    } else if (energy >= RCL_3_ENERGY && energy < RCL_4_ENERGY) {
        return 3
    } else if (energy >= RCL_4_ENERGY && energy < RCL_5_ENERGY) {
        return 4
    } else if (energy >= RCL_5_ENERGY && energy < RCL_6_ENERGY) {
        return 5
    } else if (energy >= RCL_6_ENERGY && energy < RCL_7_ENERGY) {
        return 6
    } else if (energy >= RCL_7_ENERGY && energy < RCL_8_ENERGY) {
        return 7
    } else if (energy >= RCL_8_ENERGY) {
        return 8
    }
}
//Room Cache
///////////////////////////////////////////////////
//STRUCTURE CACHE
///////////////////////////////////////////////////
Room.prototype.cacheRoomStructures = function (id) {
    let structure = Game.getObjectById(id);
    if (structure) {
        let room = structure.room;
        let cache = room.memory.structureCache || {};
        let key = room.name + '.' + structure.pos.x + '.' + structure.pos.y;
        cache[key] = {
            id: structure.id,
            type: structure.structureType
        };
        room.memory.structureCache = cache;
    }
};