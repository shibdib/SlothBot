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
 * @param {string} reboot - If we need the body with whatever energy available.
 */
module.exports.bodyGenerator = function (level, role, room = undefined, reboot = undefined) {
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal, deficitExemption;
    let deficit = room.energy / (ENERGY_AMOUNT * 1.5);
    if (deficit > 1 || !room.storage) deficit = 1;
    else if (deficit < 0.25) deficit = 0.25;
    let energyAmount = room.energyCapacityAvailable;
    if (reboot) energyAmount = room.energyAvailable;
    switch (role) {
        // Explorer/Scout
        case 'explorer':
        case 'food':
        case 'scout':
            deficitExemption = true;
            move = 1;
            break;
        // General Creeps
        case 'remoteUpgrader':
        case 'praiseMineral':
        case 'drone':
        case 'waller':
        case 'maintenance':
            if (room.nukes.length) deficitExemption = true;
            work = _.floor((energyAmount * 0.3) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((energyAmount * 0.2) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'praiseUpgrader':
            deficitExemption = true;
            work = _.floor(((energyAmount * 0.70) - 100) / BODYPART_COST[WORK]) || 1;
            if (work > 10) work = 10;
            carry = 1;
            move = 1;
            break;
        case 'upgrader':
            if (level !== room.controller.level || room.nukes.length) {
                work = 1;
                carry = 1;
                move = work + carry;
                break;
            } else if (!room.memory.controllerContainer) {
                work = _.floor((energyAmount * _.random(0.3, 0.5)) / BODYPART_COST[WORK]) || 1;
                carry = 1;
                move = work + carry;
                break;
            } else {
                work = _.floor((energyAmount * _.random(0.5, 0.7)) / BODYPART_COST[WORK]) || 1;
                if (work > 48) work = 48;
                if (level === 8 && room.energyState) work = 15; else if (level === 8) work = 1;
                //work *= deficit;
                move = 1;
                carry = 1;
                break;
            }
        case 'courier':
        case 'powerManager':
        case 'foreman':
        case 'labTech':
        case 'filler':
        case 'hauler':
        case 'expediter':
            deficitExemption = true;
            carry = _.floor((energyAmount * 0.25) / BODYPART_COST[CARRY]) || 1;
            if (carry > 20) carry = 20;
            move = _.ceil(carry / 2);
            if (!room.memory.roadsBuilt) move = carry;
            break;
        case 'stationaryHarvester':
            deficitExemption = true;
            work = _.floor((energyAmount * 0.50) / BODYPART_COST[WORK]) || 1;
            // 6 Is the cap
            if (work > 6) work = 6;
            carry = 1;
            break;
        case 'mineralHarvester':
            work = _.floor((energyAmount * 0.75) / BODYPART_COST[WORK]) || 1;
            // 50 Is the cap
            if (work > 50) work = 50;
            break;
        // Military
        case 'attacker':
            deficitExemption = true;
            tough = _.floor((energyAmount * 0.15) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 7) tough = 7;
            attack = _.floor((energyAmount * 0.35) / BODYPART_COST[ATTACK]) || 1;
            if (attack > 17) attack = 17;
            move = tough + attack;
            break;
        case 'healer':
        case 'drainer':
            deficitExemption = true;
            tough = _.floor((energyAmount * 0.1) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 4) tough = 4;
            heal = _.floor((energyAmount * 0.4) / BODYPART_COST[HEAL]) || 1;
            if (heal > 20) heal = 20;
            if (role === 'drainer') work = 1; else work = 0;
            move = tough + heal + work;
            break;
        case 'defender':
            deficitExemption = true;
            if (Math.random() > 0.49 || level < 5) attack = _.floor((energyAmount * 0.75) / BODYPART_COST[ATTACK]) || 1; else rangedAttack = _.floor((energyAmount * 0.75) / BODYPART_COST[RANGED_ATTACK]) || 1;
            if (attack > 45) attack = 45; else if (rangedAttack > 45) rangedAttack = 45;
            move = _.floor((energyAmount * 0.2) / BODYPART_COST[MOVE]) || 1;
            if (move > 5) move = 5;
            break;
        case 'longbow':
            deficitExemption = true;
            rangedAttack = _.ceil((energyAmount * 0.25) / BODYPART_COST[RANGED_ATTACK]) || 1;
            if (rangedAttack > 19) rangedAttack = 19;
            heal = _.ceil((energyAmount * 0.2) / BODYPART_COST[HEAL]);
            if (heal > 6) heal = 6;
            move = heal + rangedAttack;
            break;
        case 'poke':
            deficitExemption = true;
            if (Math.random() > 0.5) rangedAttack = 1; else attack = 1;
            move = 1;
            break;
        case 'deconstructor':
            work = _.floor((energyAmount * 0.5) / BODYPART_COST[WORK]) || 1;
            if (work > 25) work = 25;
            move = work;
            break;
        case 'siegeEngine':
            tough = _.floor((energyAmount * 0.15) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 7) tough = 7;
            attack = _.floor((energyAmount * 0.30) / BODYPART_COST[ATTACK]) || 1;
            if (attack > 15) attack = 15;
            rangedAttack = _.floor((energyAmount * 0.05) / BODYPART_COST[RANGED_ATTACK]);
            if (rangedAttack > 2) rangedAttack = 2;
            move = tough + attack + rangedAttack;
            break;
        case 'claimAttacker':
            claim = _.floor((energyAmount * 0.40) / BODYPART_COST[CLAIM]) || 1;
            if (claim > 25) claim = 25;
            move = claim;
            break;
        // Remote
        case 'claimer':
            claim = 1;
            move = 2;
            break;
        case 'reserver':
            deficitExemption = true;
            claim = _.floor((energyAmount * 0.50) / BODYPART_COST[CLAIM]) || 1;
            if (claim > 25) claim = 25;
            if (level >= 7) move = claim * 0.5; else move = claim;
            break;
        case 'fuelTruck':
            carry = 20;
            move = 20;
            break;
        case 'remoteHarvester':
            deficitExemption = true;
            work = _.floor((energyAmount * 0.4) / BODYPART_COST[WORK]) || 1;
            if (work > 10) work = 10;
            if (room.energyState && work > 5) work = 5;
            carry = 1;
            if (room.memory.roadsBuilt || level >= 6) move = work / 2; else move = work;
            break;
        case 'remoteHauler':
            deficitExemption = true;
            carry = _.floor((energyAmount * 0.40) / BODYPART_COST[CARRY]) || 1;
            if (level <= 6 && carry > 24) carry = 24; else if (level > 6 && carry > 30) carry = 30;
            if (room.energyState && carry > 12) carry = 12;
            if (Math.random() > 0.7) work = 1; else work = 0;
            if (level < 6) move = carry + work; else move = _.ceil((carry + work) / 2);
            break;
        case 'roadBuilder':
            work = _.floor((energyAmount * _.random(0.2, 0.5)) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((energyAmount * _.random(0.2, 0.5)) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'commodityMiner':
            work = _.floor((energyAmount * _.random(0.2, 0.5)) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((energyAmount * _.random(0.2, 0.5)) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'SKAttacker':
            deficitExemption = true;
            attack = 16;
            rangedAttack = 1;
            heal = 8;
            move = attack + heal + rangedAttack;
            break;
        case 'SKMineral':
            work = 14;
            carry = 10;
            move = 12;
            break;
        case 'powerAttacker':
            deficitExemption = true;
            attack = 25;
            move = 25;
            break;
        case 'powerHealer':
            deficitExemption = true;
            heal = 16;
            move = 16;
            break;
        case 'powerHauler':
            deficitExemption = true;
            carry = 25;
            move = 25;
    }
    if (!deficitExemption) {
        work *= deficit;
        attack *= deficit;
        rangedAttack *= deficit;
        tough *= deficit;
        claim *= deficit;
        carry *= deficit;
        heal *= deficit;
        move *= deficit;
        let total = work + attack + rangedAttack + tough + claim + carry + heal + move;
        if (level >= 7 && (work + attack + rangedAttack + tough + claim + carry + heal) - 1 === move && total < 50) move += 1;
    }
    for (let i = 0; i < work; i++) body.push(WORK)
    for (let i = 0; i < carry; i++) body.push(CARRY)
    for (let i = 0; i < claim; i++) body.push(CLAIM)
    let attackArray = [];
    for (let i = 0; i < rangedAttack; i++) attackArray.push(RANGED_ATTACK)
    for (let i = 0; i < attack; i++) attackArray.push(ATTACK)
    let moveArray = [];
    for (let i = 0; i < move; i++) moveArray.push(MOVE)
    let healArray = [];
    for (let i = 0; i < heal; i++) healArray.push(HEAL)
    let toughArray = [];
    for (let i = 0; i < tough; i++) toughArray.push(TOUGH)
    return toughArray.concat(shuffle(body), moveArray, attackArray, healArray);
};