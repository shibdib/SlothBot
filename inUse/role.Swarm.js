// noinspection Annotator
/**
 * Created by Bob on 7/19/2017.
 */

let _ = require('lodash');
// noinspection Annotator
const profiler = require('screeps-profiler');

function role(creep) {
    creep.cacheRoomIntel();
    if (creep.memory.boostAttempt !== true) {
        let desiredReactions = [
            RESOURCE_GHODIUM_OXIDE,
            RESOURCE_KEANIUM_OXIDE
        ];
        let count = 1;
        for (let i = 0; i < desiredReactions.length; i++) {
            let lab = creep.pos.findClosestByRange(FIND_STRUCTURES, {filter: (s) => s.structureType === STRUCTURE_LAB && s.mineralType === desiredReactions[i] && s.mineralAmount >= 30 && s.energy >= 20});
            if (lab) {
                count++;
                switch (lab.boostCreep(creep)) {
                    case ERR_NOT_IN_RANGE:
                        creep.shibMove(lab);
                        break;
                    case ERR_NOT_FOUND:
                        count--;
                        break;
                }
            }
        }
        if (count === 1) {
            creep.memory.boostAttempt = true;
        }
        return null;
    }
    let swarmLeader = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.swarmLeader === true);
    if (swarmLeader.length === 0) creep.memory.swarmLeader = true;
    if (creep.memory.attackType === 'raid') {
        if (Game.time % 15 === 0 && Memory.warControl[creep.memory.attackTarget]) {
            let hostiles = creep.room.find(FIND_CREEPS, {filter: (c) => _.includes(RawMemory.segments[2], c.owner['username']) === false});
            let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            let healers = _.filter(hostiles, (e) => (e.getActiveBodyparts(HEAL) >= 3) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
            if ((armedHostile.length > 3 && healers.length > 1) || armedHostile.length > 4 && healers.length > 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 2;
            }
            else if ((armedHostile.length > 0 && healers.length > 0) || armedHostile.length > 3 && healers.length === 0) {
                Memory.warControl[creep.memory.attackTarget].threat = 1;
            } else {
                Memory.warControl[creep.memory.attackTarget].threat = 0;
            }
        }
    }
    swarmTactic(creep);
}

// noinspection Annotator
module.exports.role = profiler.registerFN(role, '');


function swarmTactic(creep) {
    let swarmLeader;
    if (!creep.memory.assignedSwarmLeader || !Game.getObjectById(creep.memory.assignedSwarmLeader)) {
        let leaders = _.filter(Game.creeps, (h) => h.memory.attackTarget === creep.memory.attackTarget && h.memory.swarmLeader === true);
        if (leaders.length > 0) creep.memory.assignedSwarmLeader = leaders[0].id;
    }
    if (creep.memory.assignedSwarmLeader) {
        swarmLeader = Game.getObjectById(creep.memory.assignedSwarmLeader);
    }
    let creepsInRoom = creep.room.find(FIND_CREEPS);
    let swarmCount = _.filter(Game.creeps, (c) => c.memory && c.memory.role === 'swarm' && c.memory.attackTarget === creep.memory.attackTarget);
    let hostiles = _.filter(creepsInRoom, (c) => c.pos.y < 47 && c.pos.x > 3 && c.pos.x < 47 && c.pos.y > 3 && _.includes(RawMemory.segments[2], c.owner['username']) === false);
    let armedHostile = _.filter(hostiles, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1 || e.getActiveBodyparts(HEAL) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let inRangeCreeps = creep.pos.findInRange(hostiles, 3);
    let inRangeArmed = _.filter(inRangeCreeps, (e) => (e.getActiveBodyparts(ATTACK) >= 1 || e.getActiveBodyparts(RANGED_ATTACK) >= 1) && _.includes(RawMemory.segments[2], e.owner['username']) === false);
    let closestArmed = creep.pos.findClosestByPath(armedHostile);
    let closestHostile = creep.pos.findClosestByPath(hostiles);
    let healers = _.filter(creepsInRoom, (h) => h.memory && h.memory.role === 'healer');
    let closestHealer = creep.pos.findClosestByPath(healers);
    let needsHeals = creep.pos.findInRange(creepsInRoom, 1, {filter: (c) => c.hits < c.hitsMax && _.includes(RawMemory.segments[2], c.owner['username']) === true});

    //Retreat if wounded
    if (creep.getActiveBodyparts(TOUGH) === 0) {
        creep.heal(creep);
        if (closestHealer) {
            creep.shibMove(closestHealer, {allowHostile: false, movingTarget: true});
            if (inRangeArmed[0]) creep.rangedAttack(inRangeArmed[0]);
            return null;
        } else {
            creep.retreat();
            if (inRangeArmed[0]) creep.rangedAttack(inRangeArmed[0]);
            return null;
        }
    }
    if (creep.hits < creep.hitsMax) {
        creep.heal(creep);
    } else if (needsHeals.length > 0 && inRangeArmed.length === 0) {
        creep.heal(needsHeals[0]);
        if (inRangeArmed[0]) creep.rangedAttack(inRangeArmed[0]);
        creep.shibMove(needsHeals[0]);
        return;
    }
    //Check if safe mode
    if (creep.room.controller && creep.room.controller.owner && _.includes(RawMemory.segments[2], creep.room.controller.owner['username']) === false && creep.room.controller.safeMode) {
        creep.memory.attackStarted = 'safe';
        Memory.warControl[creep.memory.attackTarget] = undefined;
        Memory.militaryNeeds[creep.memory.attackTarget] = undefined;
        creep.shibMove(new RoomPosition(25, 25, creep.memory.assignedRoom), {range: 14});
    }
    if (creep.memory.swarmLeader !== true && creep.pos.getRangeTo(swarmLeader) > 4 && (!closestArmed || creep.pos.getRangeTo(swarmLeader) < creep.pos.getRangeTo(closestArmed))) {
        creep.shibMove(swarmLeader, {repathChance: 0.5});
        if (inRangeArmed[0]) creep.rangedAttack(inRangeArmed[0]);
    } else if (closestArmed || closestHostile) {
        creep.memory.inCombat = true;
        creep.borderCheck();
        if (closestArmed) {
            creep.memory.rangedTarget = closestArmed.id;
            creep.fightRanged(closestArmed);
        } else if (closestHostile) {
            creep.memory.rangedTarget = closestHostile.id;
            creep.fightRanged(closestHostile);
        }
    } else if (swarmCount.length > 3 && creep.memory.swarmLeader) {
        creep.memory.attackStarted = true;
        creep.memory.inCombat = undefined;
        creep.shibMove(new RoomPosition(25, 25, creep.memory.attackTarget), {range: 8});
    } else if (!swarmLeader.memory.attackStarted){
        creep.shibMove(new RoomPosition(25, 25, creep.memory.staging), {range: 12})
    }
}
