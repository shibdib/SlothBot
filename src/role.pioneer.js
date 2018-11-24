/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.repairRoad();
    //Invader detection
    if (creep.fleeHome()) return;
    if (creep.pos.roomName !== creep.memory.destination) creep.memory.destinationReached = false;
    if (creep.pos.roomName === creep.memory.destination) creep.memory.destinationReached = true;
    // Check for border wall blocking path
    if (creep.memory.destinationReached && (creep.pos.x === 1 || creep.pos.x === 48 || creep.pos.y === 1 || creep.pos.y === 48) && creep.pos.findInRange(creep.room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART})[0]) {
        if (creep.memory.lastPos === creep.pos.x + ':' + creep.pos.y) {
            return creep.dismantle(creep.pos.findInRange(creep.room.structures, 1, {filter: (s) => s.structureType === STRUCTURE_WALL || s.structureType === STRUCTURE_RAMPART})[0]);
        } else {
            creep.memory.lastPos = creep.pos.x + ':' + creep.pos.y;
        }
    }
    if (creep.memory.destinationReached && _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN && s.my)[0]) {
        if (creep.memory.initialBuilder && creep.room.controller.level >= 3) {
            let supportRoom = _.filter(Game.rooms, (r) => r.memory && r.memory.assistingRoom === creep.room.name || r.memory.claimTarget === creep.room.name);
            log.a(creep.room.name + ' is now an active room and no longer needs support.');
            for (let key in supportRoom) {
                delete supportRoom[key].memory.activeClaim;
                delete supportRoom[key].memory.assistingRoom;
                delete supportRoom[key].memory.claimTarget;
            }
        }
        creep.memory.role = 'worker';
        creep.memory.overlord = creep.room.name;
        creep.memory.assignedSpawn = creep.pos.findClosestByRange(creep.room.structures, {filter: (s) => s.structureType === STRUCTURE_SPAWN}).id;
        return;
    }
    if (creep.carry.energy === 0) {
        creep.memory.constructionSite = undefined;
        creep.memory.task = undefined;
        creep.memory.hauling = false;
    }
    if (_.sum(creep.carry) >= creep.carryCapacity * 0.8) creep.memory.hauling = true;
    if (creep.memory.destinationReached) {
        let pioneers = _.filter(creep.room.creeps, (s) => s.my && s.memory.role === 'pioneer');
        let stationaryHarvesters = _.filter(creep.room.creeps, (s) => s.my && s.memory.role === 'stationaryHarvester');
        if (pioneers.length > 4 && stationaryHarvesters.length < 1) {
            creep.memory.role = 'stationaryHarvester';
            creep.memory.overlord = creep.room.name;
            return;
        }
        if (creep.memory.hauling === false) {
            if (creep.memory.energyDestination) {
                creep.withdrawEnergy();
            } else if (!creep.findEnergy()) {
                let source = creep.pos.getClosestSource();
                if (creep.harvest(source) === ERR_NOT_IN_RANGE) creep.shibMove(source)
            }
        } else {
            if (creep.memory.task === 'build' && creep.memory.constructionSite) {
                let construction = Game.getObjectById(creep.memory.constructionSite);
                if (!construction) {
                    creep.memory.constructionSite = undefined;
                    creep.memory.task = undefined;
                    return;
                }
                switch (creep.build(construction)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(construction, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                    case ERR_INVALID_TARGET:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                }
            } else if (creep.memory.task === 'repair' && creep.memory.constructionSite) {
                let repairNeeded = Game.getObjectById(creep.memory.constructionSite);
                if (!repairNeeded || repairNeeded.hits === repairNeeded.hitsMax) {
                    creep.memory.constructionSite = undefined;
                    creep.memory.task = undefined;
                    return;
                }
                switch (creep.repair(repairNeeded)) {
                    case OK:
                        return null;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(repairNeeded, {range: 3});
                        break;
                    case ERR_RCL_NOT_ENOUGH:
                        delete creep.memory.constructionSite;
                        break;
                    case ERR_INVALID_TARGET:
                        creep.memory.constructionSite = undefined;
                        creep.memory.task = undefined;
                        break;
                }
            } else if (creep.room.controller && creep.room.controller.my && creep.room.controller.level < 3) {
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) creep.shibMove(creep.room.controller, {range: 3});
            } else if (creep.memory.upgrade || (creep.room.controller && creep.room.controller.my && creep.room.controller.ticksToDowngrade < 3000)) {
                creep.memory.upgrade = true;
                if (creep.room.controller.ticksToDowngrade >= 4000) delete creep.memory.upgrade;
                if (creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
                    creep.shibMove(creep.room.controller);
                }
            } else if (_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.5).length) {
                let tower = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.energy < s.energyCapacity * 0.5)[0];
                switch (creep.transfer(tower, RESOURCE_ENERGY)) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(tower);
                        break;
                    case ERR_FULL:
                        break;
                }
            } else if (_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 25000).length) {
                switch (creep.repair(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 25000)[0])) {
                    case OK:
                        break;
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(_.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_RAMPART && s.hits < 25000)[0], {range: 3});
                        break;
                }
            } else if (!creep.findConstruction()) {
                if (!creep.findRepair(1)) creep.idleFor(25);
            }
        }
    } else {
        creep.shibMove(new RoomPosition(25, 25, creep.memory.destination), {range: 24});
    }
};