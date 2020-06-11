/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.bodyGenerator = function (level, role, room = undefined, misc = undefined) {
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal, deficitExemption;
    let deficit = room.energy / (ENERGY_AMOUNT * 1.5);
    if (deficit > 1 || !room.storage) deficit = 1;
    else if (deficit < 0.25) deficit = 0.25;
    let importantBuilds = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
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
        case 'commodityMiner':
            work = _.floor(((room.energyCapacityAvailable * _.random(0.2, 0.5)) * ROOM_ENERGY_ALLOTMENT['work']) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((room.energyCapacityAvailable * _.random(0.2, 0.5)) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'waller':
            if (room.nukes.length) deficitExemption = true;
            work = _.floor(((room.energyCapacityAvailable * _.random(0.2, 0.5)) * ROOM_ENERGY_ALLOTMENT['walls']) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((room.energyCapacityAvailable * _.random(0.1, 0.3)) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'praiseUpgrader':
            deficitExemption = true;
            work = _.floor(((room.energyCapacityAvailable * 0.70) - 100) / BODYPART_COST[WORK]) || 1;
            if (work > 10) work = 10;
            carry = 1;
            move = 1;
            break;
        case 'upgrader':
            if ((importantBuilds && !room.energyState) || room.nukes.length) {
                work = 1;
                carry = 1;
                move = work + carry;
                break;
            } else if (level < 4) {
                work = _.random(level + 1, level * 2);
                carry = 1;
                move = work + carry;
                break;
            } else {
                work = _.ceil((ROOM_ENERGY_PER_TICK[room.name] * ROOM_ENERGY_ALLOTMENT['upgrade']) / UPGRADE_CONTROLLER_POWER) || 1;
                if (work > 25) work = 25;
                if (level === 8 && room.energyState) work = 15; else if (level === 8) work = 1;
                work *= deficit;
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
            carry = _.floor((room.energyCapacityAvailable * 0.25) / BODYPART_COST[CARRY]) || 1;
            if (carry > 14) carry = 14;
            move = _.ceil(carry / 2);
            if (!room.memory.roadsBuilt) move = carry;
            break;
        case 'stationaryHarvester':
            deficitExemption = true;
            work = _.floor((room.energyCapacityAvailable - 250) / BODYPART_COST[WORK]) || 1;
            // 7 Is the cap
            if (work > 7) work = 6;
            carry = 1;
            if (misc) move = 1;
            break;
        case 'mineralHarvester':
            work = _.floor((room.energyCapacityAvailable * 0.75) / BODYPART_COST[WORK]) || 1;
            // 50 Is the cap
            if (work > 50) work = 50;
            break;
        // Military
        case 'attacker':
            tough = _.floor((room.energyCapacityAvailable * 0.15) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 7) tough = 7;
            attack = _.floor((room.energyCapacityAvailable * 0.35) / BODYPART_COST[ATTACK]) || 1;
            if (attack > 17) attack = 17;
            move = tough + attack;
            break;
        case 'siegeHealer':
        case 'healer':
        case 'drainer':
            deficitExemption = true;
            tough = _.floor((room.energyCapacityAvailable * 0.15) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 7) tough = 7;
            heal = _.floor((room.energyCapacityAvailable * 0.35) / BODYPART_COST[HEAL]) || 1;
            if (heal > 17) heal = 17;
            if (role === 'drainer') work = 1; else work = 0;
            move = tough + heal + work;
            break;
        case 'defender':
            if (Math.random() > 0.49) attack = _.floor((room.energyCapacityAvailable * 0.7) / BODYPART_COST[ATTACK]) || 1; else rangedAttack = _.floor((room.energyCapacityAvailable * 0.7) / BODYPART_COST[RANGED_ATTACK]) || 1;
            if (attack > 45) attack = 45; else if (rangedAttack > 45) rangedAttack = 45;
            move = 5;
            break;
        case 'longbow':
            deficitExemption = true;
            rangedAttack = _.floor((room.energyCapacityAvailable * 0.40) / BODYPART_COST[RANGED_ATTACK]) || 1;
            if (rangedAttack > 20) rangedAttack = 20;
            heal = _.floor((room.energyCapacityAvailable * 0.10) / BODYPART_COST[HEAL]);
            if (heal > 5) heal = 5;
            move = heal + rangedAttack;
            break;
        case 'deconstructor':
            work = _.floor((room.energyCapacityAvailable * 0.50) / BODYPART_COST[WORK]) || 1;
            if (work > 25) work = 25;
            move = work;
            break;
        case 'siegeEngine':
            tough = _.floor((room.energyCapacityAvailable * 0.15) / BODYPART_COST[TOUGH]) || 1;
            if (tough > 7) tough = 7;
            attack = _.floor((room.energyCapacityAvailable * 0.30) / BODYPART_COST[ATTACK]) || 1;
            if (attack > 15) attack = 15;
            rangedAttack = _.floor((room.energyCapacityAvailable * 0.05) / BODYPART_COST[RANGED_ATTACK]);
            if (rangedAttack > 2) rangedAttack = 2;
            move = tough + attack + rangedAttack;
            break;
        case 'claimAttacker':
            claim = _.floor((room.energyCapacityAvailable * 0.40) / BODYPART_COST[CLAIM]) || 1;
            if (claim > 25) claim = 25;
            move = claim;
            break;
        // Remote
        case 'claimer':
            claim = 1;
            move = 1;
            break;
        case 'reserver':
            claim = _.floor((room.energyCapacityAvailable * 0.20) / BODYPART_COST[CLAIM]) || 1;
            if (claim > 25) claim = 25;
            move = claim;
            break;
        case 'fuelTruck':
            carry = 20;
            move = 20;
            break;
        case 'SKHarvester':
        case 'remoteHarvester':
            deficitExemption = true;
            work = _.floor((room.energyCapacityAvailable * 0.15) / BODYPART_COST[WORK]) || 1;
            if (work > 5) work = 5;
            carry = 1;
            if ((room.memory.roadsBuilt || level >= 6) && role !== 'SKHarvester') move = work / 2; else move = work;
            break;
        case 'remoteHauler':
            deficitExemption = true;
            carry = _.floor((room.energyCapacityAvailable * 0.25) / BODYPART_COST[CARRY]) || 1;
            if (carry > 25) carry = 25;
            if (Math.random() > 0.7) work = 1; else work = 0;
            move = _.ceil((carry + work) / 2);
            if (misc) move = carry + work;
            break;
        case 'roadBuilder':
            work = _.floor(((room.energyCapacityAvailable * _.random(0.2, 0.5))) / BODYPART_COST[WORK]) || 1;
            if (work > 15) work = 15;
            carry = _.floor((room.energyCapacityAvailable * _.random(0.2, 0.5)) / BODYPART_COST[CARRY]) || 1;
            if (carry > 10) carry = 10;
            move = work + carry;
            break;
        case 'SKAttacker':
            deficitExemption = true;
            attack = 16;
            tough = 4;
            heal = 5;
            move = attack + heal + tough;
            break;
        case 'SKMineral':
            work = 14;
            carry = 10;
            move = 12;
            break;
        case 'powerAttacker':
            attack = 22;
            move = 22;
            break;
        case 'powerHealer':
            heal = 25;
            move = 25;
            break;
        case 'powerHauler':
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
        move = (move * deficit) + 0.5 || 1;
        if (move === (work + attack + rangedAttack + tough + claim + carry + heal) - 1) move += 1;
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