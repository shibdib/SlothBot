/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Generates Creep Bodies.
 * @constructor
 * @param {int} level - Room energy level.
 * @param {string} role - The creeps role.
 * @param {object} room - The spawning room.
 * @param {object} creepInfo - Overall queue object.
 */
module.exports.bodyGenerator = function (level, role, room = undefined, creepInfo = undefined) {
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal;
    let energyAmount = room.energyCapacityAvailable;
    if (creepInfo.other.reboot || room.creeps.length < 4) energyAmount = room.energyAvailable;
    switch (role) {
        // Explorer/Scout
        case 'explorer':
        case 'tester':
        case 'scout':
            move = 1;
            break;
        // General Creeps
        case 'remoteUpgrader':
        case 'drone':
        case 'waller':
        case 'roadBuilder':
            work = _.floor((energyAmount * 0.25) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((energyAmount * 0.25) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'upgrader':
            if (room.nukes.length || room.level < room.controller.level) {
                work = 1;
                carry = 1;
                move = work + carry;
                break;
            } else if (room.memory.controllerContainer && creepInfo.other && creepInfo.other.stationary) {
                work = _.floor((energyAmount - (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) / BODYPART_COST[WORK]) || 1;
                if (work > 50) work = 48;
                if (level === 8) work = 15;
                carry = 1;
                move = 1;
                break;
            } else {
                work = _.floor((energyAmount * 0.4) / BODYPART_COST[WORK]) || 1;
                carry = _.floor((energyAmount * 0.1) / BODYPART_COST[CARRY]) || 1;
                if (!room.memory.roadsBuilt) move = carry + work; else move = _.ceil(carry + work / 2);
                break;
            }
        case 'powerManager':
        case 'labTech':
        case 'hauler':
        case 'shuttle':
            carry = _.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            if (carry > level * 2) carry = level * 2.25;
            if (!room.memory.roadsBuilt) move = carry; else move = _.ceil(carry / 2);
            break;
        case 'stationaryHarvester':
            work = _.floor((energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;
            let powerCreep = _.find(Game.powerCreeps, (c) => c.my && c.memory.destinationRoom === room.name && c.powers[PWR_REGEN_SOURCE]);
            if (powerCreep) {
                work = (SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME);
            } else if (work > 6) work = 6;
            carry = _.ceil(EXTENSION_ENERGY_CAPACITY[room.controller.level] / CARRY_CAPACITY);
            move = 1;
            break;
        case 'mineralHarvester':
            work = _.floor((energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;
            if (work > 30) work = 30;
            move = 1;
            break;
        // Military
        case 'attacker':
            tough = _.floor((energyAmount * 0.02) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 3) tough = 3;
            attack = _.floor((energyAmount * 0.40) / BODYPART_COST[ATTACK]) || 1;
            if (attack > 20) attack = 20;
            heal = _.floor((energyAmount * 0.08) / BODYPART_COST[ATTACK]) || 1;
            if (heal > 2) heal = 2;
            move = tough + attack + heal;
            break;
        case 'healer':
            heal = _.floor(energyAmount / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
            if (heal > 25) heal = 25;
            move = heal;
            break;
        case 'medic':
            heal = _.floor(energyAmount / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
            if (heal > 4) heal = 4;
            move = heal;
            break;
        case 'drainer':
            tough = _.floor((energyAmount * 0.1) / (BODYPART_COST[TOUGH] + BODYPART_COST[MOVE])) || 1;
            if (tough > 4) tough = 4;
            heal = _.floor((energyAmount * 0.9) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE])) || 1;
            if (heal > 20) heal = 20;
            work = 1;
            move = tough + heal + work;
            break;
        case 'defender':
            rangedAttack = 0;
            attack = 0;
            if (room.level < 3) {
                attack = 1;
                move = 1;
            } else {
                if (Math.random() > 0.49 || level < 5) attack = _.floor((energyAmount * 0.45) / BODYPART_COST[ATTACK]) || 1; else rangedAttack = _.floor((energyAmount * 0.45) / BODYPART_COST[RANGED_ATTACK]) || 1;
                if (attack > 32) attack = 32; else if (rangedAttack > 32) rangedAttack = 32;
                move = (attack + rangedAttack) * 0.5;
            }
            break;
        case 'longbow':
            rangedAttack = _.floor((energyAmount * 0.7) / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) || 1;
            if (rangedAttack > 17) rangedAttack = 17;
            heal = _.floor((energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
            if (heal > 8) heal = 8;
            move = heal + rangedAttack;
            break;
        case 'poke':
            if (Math.random() > 0.5) rangedAttack = 1; else attack = 1;
            move = 1;
            break;
        case 'siegeEngine':
            if (level < 7) return;
            if (level === 7) {
                heal = 16;
                rangedAttack = 4;
                move = 20;
            } else {
                heal = 20;
                rangedAttack = 5;
                move = 25;
            }
            break;
        case 'deconstructor':
            work = _.floor(energyAmount / (BODYPART_COST[WORK] + BODYPART_COST[MOVE])) || 1;
            if (work > 25) work = 25;
            move = work;
            break;
        case 'claimAttacker':
            claim = _.floor((energyAmount * 0.50) / BODYPART_COST[CLAIM]) || 1;
            if (claim > 25) claim = 25;
            move = claim;
            break;
        // Remote
        case 'reactorClaimer':
        case 'claimer':
            claim = 1;
            tough = 1;
            move = 2;
            break;
        case 'reserver':
            claim = _.floor(energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
            if (claim > 20) claim = 20;
            if (level >= 6) {
                claim = _.floor(energyAmount / (BODYPART_COST[CLAIM] + (BODYPART_COST[MOVE] * 0.2))) || 1;
                if (claim > 20) claim = 20;
                move = claim * 0.5;
            } else move = claim;
            break;
        case 'remoteHarvester':
            work = _.floor((energyAmount * 0.5) / BODYPART_COST[WORK]) || 1;
            if (room.level >= 5) work = _.floor((energyAmount * 0.65) / BODYPART_COST[WORK]) || 1;
            // SK
            if (creepInfo.other && creepInfo.other.SK && work > SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) work = (SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 4;
            // Reserved
            else if (Memory.roomCache[creepInfo.destination] && Memory.roomCache[creepInfo.destination].reservation === MY_USERNAME && work > (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1) work = (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
            // Neutral
            else if (work > (SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1) work = (SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
            carry = 1;
            if (Memory.roomCache[creepInfo.destination].roadsBuilt) move = work / 2; else move = work;
            break;
        case 'remoteHauler':
            let workCost = BODYPART_COST[WORK];
            if (room.level < 4) workCost = 0;
            carry = _.floor(((energyAmount - workCost) * 0.49) / BODYPART_COST[CARRY]) || 1;
            if (Game.getObjectById(creepInfo.misc)) {
                let energyOutput = creepInfo.misc;
                let assignedHaulers = _.filter(Game.creeps, (c) => c.my && c.memory.destination === creepInfo.destination);
                let current = 0;
                if (assignedHaulers.length) assignedHaulers.forEach((c) => current += c.store.getCapacity())
                if ((carry * CARRY_CAPACITY) > energyOutput - current) carry = _.ceil((energyOutput - current) / CARRY_CAPACITY) || 1
            }
            // Max 32 at 7+, else 15, always have 1
            if (room.level >= 7 && carry > 32) carry = 32; else if (carry > 15) carry = 15; else if (carry < 1) carry = 1;
            // Work parts after level 3
            if (room.level >= 4) work = 1; else work = 0;
            // Set move
            if (Memory.roomCache[creepInfo.destination].roadsBuilt) move = carry + work / 2; else move = carry + work;
            break;
        case 'SKMineral':
        case 'commodityMiner':
            work = _.floor((energyAmount * _.random(0.2, 0.5)) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((energyAmount * _.random(0.2, 0.5)) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'SKAttacker':
            attack = 19;
            heal = 6;
            move = attack + heal;
            break;
        case 'powerAttacker':
            attack = 25;
            move = 25;
            break;
        case 'powerHealer':
            heal = 16;
            move = 16;
            break;
        case 'fuelTruck':
        case 'robber':
        case 'powerHauler':
            carry = _.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            if (carry > 25) carry = 25;
            move = carry;
            break;
        case 'scoreHauler':
            carry = 3;
            claim = 1;
            move = 6;
            break;
        /**case 'scoreHauler':
         deficitExemption = true;
         let neededCarry = _.ceil(room.store[RESOURCE_SCORE] / 50);
         carry = _.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
         if (carry > neededCarry && room.store[RESOURCE_SCORE]) carry = neededCarry;
         if (carry > 10) carry = 10;
         move = carry;
         break;**/
        case 'symbolHauler':
            carry = _.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            if (carry > 16) carry = 16;
            move = carry;
            break;
    }
    for (let i = 0; i < work; i++) body.push(WORK)
    for (let i = 0; i < carry; i++) body.push(CARRY)
    for (let i = 0; i < claim; i++) body.push(CLAIM)
    for (let i = 0; i < rangedAttack; i++) body.push(RANGED_ATTACK)
    for (let i = 0; i < attack; i++) body.push(ATTACK)
    let moveArray = [];
    for (let i = 0; i < move; i++) moveArray.push(MOVE)
    let healArray = [];
    for (let i = 0; i < heal; i++) healArray.push(HEAL)
    let toughArray = [];
    for (let i = 0; i < tough; i++) toughArray.push(TOUGH)
    if (role === 'SKAttacker' || role === 'powerAttacker' || role === 'claimer') return toughArray.concat(moveArray, shuffle(body), healArray);
    else return toughArray.concat(shuffle(body), moveArray, healArray);
};

abilityPower = function (body) {
    let meleePower = 0;
    let rangedPower = 0;
    let healPower = 0;
    for (let part of body) {
        if (!part.hits) continue;
        if (part.boost) {
            if (part.type === ATTACK) {
                meleePower += ATTACK_POWER * BOOSTS[part.type][part.boost]['attack'];
            } else if (part.type === RANGED_ATTACK) {
                rangedPower += RANGED_ATTACK_POWER * BOOSTS[part.type][part.boost]['rangedAttack'];
            } else if (part.type === HEAL) {
                healPower += HEAL_POWER * BOOSTS[part.type][part.boost]['heal'];
            } else if (part.type === TOUGH) {
                healPower += HEAL_POWER * (1 - BOOSTS[part.type][part.boost]['damage']);
            }
        } else {
            if (part.type === ATTACK) {
                meleePower += ATTACK_POWER;
            } else if (part.type === RANGED_ATTACK) {
                rangedPower += RANGED_ATTACK_POWER;
            } else if (part.type === HEAL) {
                healPower += HEAL_POWER;
            }
        }
    }
    return {
        attack: meleePower + rangedPower,
        meleeAttack: meleePower,
        rangedAttack: rangedPower,
        defense: healPower,
        melee: meleePower,
        ranged: rangedPower
    };
};