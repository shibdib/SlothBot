let borderChecks = require('module.borderChecks');
let creepTools = require('module.creepFunctions');
let pathing = require('module.pathFinder');


module.exports.buildWalls = function (spawn) {
    if (Game.constructionSites.length > 75) {
        return null;
    }
    let pos = new RoomPosition(39, 14, spawn.room.name);
    let path = spawn.room.findPath(spawn.pos, pos, {
        costCallback: function (roomName, costMatrix) {
            const nonRampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType !== STRUCTURE_RAMPART || r.structureType !== STRUCTURE_WALL});
            for (let i = 0; i < nonRampart.length; i++) {
                costMatrix.set(nonRampart[i].pos.x, nonRampart[i].pos.y, 0);
            }
            const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
            for (let i = 0; i < rampart.length; i++) {
                costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
            }
            const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART || r.structureType === STRUCTURE_WALL});
            for (let i = 0; i < construction.length; i++) {
                costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
            }
        },
        maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
    });
    if (path[4] !== undefined) {
        let build = new RoomPosition(path[4].x, path[4].y, spawn.room.name);
        let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
        const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
        const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
        const roadCheck = build.lookFor(LOOK_STRUCTURES);
        const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
        if (roadCheck[0]) {
            if (roadCheck[0].structureType === STRUCTURE_WALL) {
                spawn.memory.wallCheck = false;
            }
        } else if (constructionCheck.length > 0) {
            spawn.memory.wallCheck = false;
        } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
            build.createConstructionSite(STRUCTURE_RAMPART);
            spawn.memory.wallCheck = false;
        } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
            build.createConstructionSite(STRUCTURE_WALL);
            spawn.memory.wallCheck = false;
        } else {
            build.createConstructionSite(STRUCTURE_RAMPART);
            spawn.memory.wallCheck = false;
        }
    } else {
        let path = spawn.room.findPath(spawn.room.controller.pos, pos, {
            costCallback: function (roomName, costMatrix) {
                const nonRampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType !== STRUCTURE_RAMPART});
                for (let i = 0; i < nonRampart.length; i++) {
                    costMatrix.set(nonRampart[i].pos.x, nonRampart[i].pos.y, 0);
                }
                const rampart = spawn.room.find(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                for (let i = 0; i < rampart.length; i++) {
                    costMatrix.set(rampart[i].pos.x, rampart[i].pos.y, 255);
                }
                const construction = spawn.room.find(FIND_CONSTRUCTION_SITES, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
                for (let i = 0; i < construction.length; i++) {
                    costMatrix.set(construction[i].pos.x, construction[i].pos.y, 255);
                }
            },
            maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 1, ignoreRoads: true
        });
        if (path[2] !== undefined) {
            let build = new RoomPosition(path[2].x, path[2].y, spawn.room.name);
            let nearbyRamps = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
            let nearbyWalls = build.findInRange(FIND_STRUCTURES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
            const buildRamps = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_RAMPART});
            const buildWalls = build.findInRange(FIND_CONSTRUCTION_SITES, 1, {filter: (r) => r.structureType === STRUCTURE_WALL});
            const roadCheck = build.lookFor(LOOK_STRUCTURES);
            const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
            if (roadCheck[0]) {
                if (roadCheck[0].structureType === STRUCTURE_WALL) {
                    spawn.memory.wallCheck = false;
                }
            } else if (constructionCheck.length > 0) {
                spawn.memory.wallCheck = false;
            } else if (roadCheck.length > 0 && (roadCheck[0].structureType !== STRUCTURE_WALL || roadCheck[0].structureType !== STRUCTURE_RAMPART)) {
                build.createConstructionSite(STRUCTURE_RAMPART);
                spawn.memory.wallCheck = false;
            } else if (nearbyRamps.length + buildRamps.length > 0 && nearbyWalls.length + buildWalls.length === 0) {
                build.createConstructionSite(STRUCTURE_WALL);
                spawn.memory.wallCheck = false;
            } else {
                build.createConstructionSite(STRUCTURE_RAMPART);
                spawn.memory.wallCheck = false;
            }
        } else {
            spawn.memory.wallCheck = true;
        }
    }
};

module.exports.roadNetwork = function (spawn) {
    for (let i = 0; i < 10; i++) {
        let remote = 'remote' + i;
        if (Game.flags[remote]) {
            let pos = Game.flags[remote].pos;
            let path = spawn.room.findPath(spawn.pos, pos, {
                maxOps: 10000, serialize: false, ignoreCreeps: true, maxRooms: 16, ignoreRoads: false
            });
            for (let i = 0; i < path.length; i++) {
                if (path[i] !== undefined) {
                    let build = new RoomPosition(path[i].x, path[i].y, path[i].roomName);
                    const roadCheck = build.lookFor(LOOK_STRUCTURES);
                    const constructionCheck = build.lookFor(LOOK_CONSTRUCTION_SITES);
                    if (constructionCheck.length > 0 || roadCheck.length > 0) {
                    } else {
                        build.createConstructionSite(STRUCTURE_ROAD);
                    }
                }
            }
        }
    }
};

module.exports.findDefensivePosition = function (creep) {
    let closestEnemy = creep.pos.findClosestByPath(FIND_HOSTILE_CREEPS);
    if (closestEnemy) {
        let bestRampart = closestEnemy.pos.findClosestByPath(FIND_STRUCTURES, {filter: (r) => r.structureType === STRUCTURE_RAMPART && r.pos.getRangeTo(creep.memory.assignedSpawn) <= 4 && !r.pos.lookFor(LOOK_CREEPS)});
        pathing.Move(creep, bestRampart, 1, true);
    }
};

module.exports.activateDefense = function (spawn, scout) {
    if (scout.memory !== undefined) {
        if (spawn.room.findPath(spawn.pos, scout.memory.enemyPos).length < 125) {
            spawn.memory.defenseMode = true;
            spawn.memory.defenseModeTicker = 0;
            spawn.memory.enemyCount = scout.memory.enemyCount;
            enemyCount = scout.memory.enemyCount;
        }
    } else {
        let HostileCreeps = spawn.room.find(FIND_HOSTILE_CREEPS);
        if (HostileCreeps.length > 0) {
            for (i = 0; i < HostileCreeps.length; i++) {
                let attackParts = HostileCreeps[i].getActiveBodyparts(ATTACK);
                let RangedAttackParts = HostileCreeps[i].getActiveBodyparts(RANGED_ATTACK);
                let healParts = HostileCreeps[i].getActiveBodyparts(HEAL);
                if (attackParts.length > 0 || RangedAttackParts.length > 0 || healParts.length > 0) {
                    spawn.memory.defenseMode = true;
                    var enemyCount = HostileCreeps.length;
                }
            }
        }
    }
    if (spawn.memory.defenseMode === true) {
        spawnDefenders(spawn, enemyCount);
    }
};

function spawnDefenders(spawn, count) { //SENTRY RESPAWNS
    let sentry = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === spawn.name && creep.memory.role === 'sentry');
    if (sentry.length < count * 2 && Game.spawns[spawnName].canCreateCreep([RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE], generatedNumber + 'sentry') === OK) {
        Game.spawns[spawnName].createCreep([RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, RANGED_ATTACK, MOVE, MOVE], generatedNumber + 'sentry', {
            role: 'sentry',
            assignedSpawn: spawn.name
        });
        console.log('Spawning a sentry');
        return;
    }
    let defender = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === spawn.name && creep.memory.role === 'defender');
    if (defender.length < count * 2 && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'defender') === OK) {
        Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, ATTACK, ATTACK, ATTACK, ATTACK, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'defender', {
            role: 'defender',
            assignedSpawn: spawn.name
        });
        console.log('Spawning a defender');
        return;
    }
    let healer = _.filter(Game.creeps, (creep) => creep.memory.assignedSpawn === spawn.name && creep.memory.role === 'healer');
    if (healer.length < count && Game.spawns[spawnName].canCreateCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, HEAL, HEAL, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'healer') === OK) {
        Game.spawns[spawnName].createCreep([TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, HEAL, HEAL, MOVE, MOVE, MOVE, MOVE, MOVE], generatedNumber + 'healer', {
            role: 'healer',
            assignedSpawn: spawn.name
        });
        console.log('Spawning a healer');
    }
}