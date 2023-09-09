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
    let work, claim, carry, move, tough, attack, rangedAttack, heal, energyScaling;
    let energyAmount = room.energyCapacityAvailable;
    if (creepInfo.other.reboot || room.creeps.length <= 2) {
        energyAmount = room.energyAvailable;
        if (energyAmount < 300) energyAmount = 300;
    }
    switch (role) {
        // Explorer/Scout
        case 'explorer':
        case 'tester':
        case 'scout':
            move = 1;
            break;
        // General Creeps
        case 'drone':
        case 'waller':
        case 'roadBuilder':
            energyScaling = true;
            work = _.floor((energyAmount * 0.4) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((energyAmount * 0.1) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'upgrader':
            energyScaling = true;
            if (room.nukes.length || room.level < room.controller.level) {
                work = 1;
                carry = 1;
                move = work + carry;
                break;
            } else if (room.memory.controllerContainer) {
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
        case 'hauler':
        case 'labTech':
            carry = _.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            if (carry > level * 2) carry = level * 2;
            if (!room.memory.roadsBuilt) move = carry; else move = _.ceil(carry / 2);
            break;
        case 'shuttle':
            carry = _.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            let sources = _.filter(room.sources, (s) => !s.memory.link && s.memory.distanceToHub);
            let farthestSourceDistance = 40;
            if (sources.length) {
                farthestSourceDistance = _.max(sources, 'memory.distanceToHub').memory.distanceToHub * 2;
            }
            let energyHarvestedPerTrip = (HARVEST_POWER * 6) * farthestSourceDistance;
            if (carry > energyHarvestedPerTrip / CARRY_CAPACITY) carry = energyHarvestedPerTrip / CARRY_CAPACITY;
            if (!room.memory.roadsBuilt) move = carry; else move = _.ceil(carry / 2);
            break;
        case 'stationaryHarvester':
            // Goal is to have enough WORK parts to empty a source in half of its lifetime
            work = _.floor((energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;
            let powerCreep = _.find(Game.powerCreeps, (c) => c.my && c.memory.destinationRoom === room.name && c.powers[PWR_REGEN_SOURCE]);
            if (powerCreep) {
                work = (SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME);
            } else if (work > SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) work = SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME);
            carry = _.ceil(EXTENSION_ENERGY_CAPACITY[room.controller.level] / CARRY_CAPACITY);
            move = 1;
            break;
        case 'mineralHarvester':
            energyScaling = true;
            work = _.floor((energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;
            if (work > 30) work = 30;
            move = 1;
            break;
        // Military
        case 'attacker':
            tough = _.floor((energyAmount * 0.02) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 3) tough = 3;
            attack = _.floor((energyAmount * 0.48) / BODYPART_COST[ATTACK]) || 1;
            if (attack > 20) attack = 20;
            move = tough + attack;
            break;
        case 'defender':
            rangedAttack = 0;
            attack = 0;
            if (room.level < 3) {
                attack = 1;
                move = 1;
            } else {
                if (Math.random() > 0.25 || level < 5) attack = _.floor((energyAmount * 0.45) / BODYPART_COST[ATTACK]) || 1; else rangedAttack = _.floor((energyAmount * 0.45) / BODYPART_COST[RANGED_ATTACK]) || 1;
                if (attack > 32) attack = 32; else if (rangedAttack > 32) rangedAttack = 32;
                move = (attack + rangedAttack) * 0.5;
            }
            break;
        case 'longbow':
            rangedAttack = _.floor((energyAmount * 0.7) / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) || 1;
            if (rangedAttack > 17) rangedAttack = 17;
            heal = _.floor((energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
            if (heal > 8) heal = 8;
            // Handle scaling down military creeps
            if (creepInfo.other && creepInfo.other.power) {
                if ((rangedAttack * RANGED_ATTACK_POWER) + (heal * HEAL_POWER) > creepInfo.other.power) {
                    let ratio = creepInfo.other.power / ((rangedAttack * RANGED_ATTACK_POWER) + (heal * HEAL_POWER));
                    rangedAttack = _.ceil(rangedAttack * ratio);
                    heal = _.ceil(heal * ratio);
                }
            }
            move = heal + rangedAttack;
            break;
        case 'poke':
            if (Math.random() > 0.5) rangedAttack = 1; else attack = 1;
            move = 1;
            break;
        case 'cleaner':
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
        case 'claimer':
            claim = 1;
            move = _.floor(energyAmount - BODYPART_COST[CLAIM]) || 1;
            if (move > 5) move = 5;
            break;
        case 'reserver':
            energyScaling = true;
            claim = _.floor(energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
            if (claim > 20) claim = 20;
            if (level >= 6) {
                claim = _.floor(energyAmount / (BODYPART_COST[CLAIM] + (BODYPART_COST[MOVE] * 0.5))) || 1;
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
            else if (INTEL[creepInfo.destination] && INTEL[creepInfo.destination].reservation === MY_USERNAME && work > (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1) work = (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
            // Neutral
            else if ((!INTEL[creepInfo.destination] || INTEL[creepInfo.destination].reservation !== MY_USERNAME) && work > (SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1) work = (SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
            carry = 1;
            if (INTEL[creepInfo.destination] && INTEL[creepInfo.destination].roadsBuilt) move = _.ceil(work / 2); else move = work;
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
            if (INTEL[creepInfo.destination] && INTEL[creepInfo.destination].roadsBuilt) move = _.ceil((carry + work) / 2); else {
                if (carry > 24) carry = 24;
                move = carry + work;
            }
            break;
        case 'SKMineral':
        case 'commodityMiner':
            energyScaling = true;
            work = _.floor((energyAmount * 0.35) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((energyAmount * 0.15) / BODYPART_COST[CARRY]) || 1;
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
    }
    let energyMulti = 1;
    if (energyScaling && room.storage && room.energyState < 3) energyMulti = (room.energy || 100) / (ENERGY_AMOUNT[room.level] * 3);
    if (energyMulti > 1) energyMulti = 1;
    for (let i = 0; i < _.ceil(work * energyMulti); i++) body.push(WORK)
    for (let i = 0; i < _.ceil(carry * energyMulti); i++) body.push(CARRY)
    for (let i = 0; i < _.ceil(claim * energyMulti); i++) body.push(CLAIM)
    for (let i = 0; i < _.ceil(rangedAttack * energyMulti); i++) body.push(RANGED_ATTACK)
    for (let i = 0; i < _.ceil(attack * energyMulti); i++) body.push(ATTACK)
    let moveArray = [];
    for (let i = 0; i < _.ceil(move * energyMulti); i++) moveArray.push(MOVE)
    let healArray = [];
    for (let i = 0; i < _.ceil(heal * energyMulti); i++) healArray.push(HEAL)
    let toughArray = [];
    for (let i = 0; i < _.ceil(tough * energyMulti); i++) toughArray.push(TOUGH)
    if (role === 'SKAttacker' || role === 'powerAttacker' || role === 'claimer') return toughArray.concat(moveArray, shuffle(body), healArray);
    else return toughArray.concat(shuffle(body), moveArray, healArray);
};