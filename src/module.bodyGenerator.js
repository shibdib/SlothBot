/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.bodyGenerator = function (level, role, room = undefined, misc = undefined) {
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal;
    let importantBuilds = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
    switch (role) {
        // Explorer/Scout
        case 'explorer':
        case 'scout':
            move = 1;
            break;
        case 'swarm':
        case 'jerk':
            if (_.random(0, 1) === 1) {
                rangedAttack = 1
            } else {
                attack = 1
            }
            move = 1;
            if (level > 2) move = 3;
            break;
        // General Creeps
        case 'drone':
        case 'roadBuilder':
        case 'repairer':
        case 'waller':
            work = _.random(level, level * 2);
            carry = _.random(1, level);
            move = work + carry;
            break;
        case 'upgrader':
            if ((importantBuilds && !room.energyState) || room.memory.nuke) {
                work = 1;
                carry = 1;
                move = work + carry;
                break;
            } else if (level < 5) {
                work = _.random(level + 1, level * 2);
                carry = 1;
                move = work + carry;
                break;
            } else {
                work = _.random(8 + level, 20);
                if (level === 8 && room.energyState) work = 15; else if (level === 8) work = 1;
                carry = 1;
                break;
            }
        case 'filler':
        case 'hauler':
            if (level < 4 || !room.memory.roadsBuilt) {
                carry = level;
                move = carry;
                break
            } else {
                carry = _.random(1.75 * level, 2 * level);
                move = _.round((carry / 2) + 0.5);
                break;
            }
        case 'linkManager':
            move = 3;
            carry = 3;
            break;
        case 'courier':
        case 'powerManager':
        case 'labTech':
            carry = 6;
            move = 3;
            break;
        case 'stationaryHarvester':
            if (level < 5) {
                work = 4;
                carry = 1;
                break;
            } else {
                work = 6;
                carry = 1;
                break;
            }
        case 'mineralHarvester':
            let multi = 1.25;
            if (room.memory.state > 1 && level > 5) multi = 2.5;
            if (room.memory.state > 2 && level > 5) multi = 3;
            work = _.round((multi * level) + 1);
            break;
        // Military
        case 'attacker':
            tough = _.round(0.5 * level);
            attack = _.round(0.5 * level);
            heal = 0;
            if (level > 3) {
                attack = _.random(level + 1, level * 2.5);
                heal = 1;
            }
            move = tough + heal + attack;
            break;
        case 'healer':
            tough = 2;
            heal = level - 1;
            if (level >= 5) heal = level + 1;
            if (level >= 7) heal = 15;
            move = tough + heal;
            break;
        case 'drainer':
            if (level < 5) break;
            tough = 4;
            if (level >= 5) heal = level;
            if (level >= 7) heal = 15;
            work = 1;
            move = tough + heal + work;
            break;
        case 'longbow':
            if (level === 3) {
                rangedAttack = 2;
                heal = 1;
                move = 3;
            } else if (level === 4) {
                rangedAttack = 3;
                heal = 2;
                move = 5;
            } else if (level === 5) {
                rangedAttack = 6;
                heal = 2;
                move = 8;
            } else if (level === 6) {
                rangedAttack = 8;
                heal = 2;
                move = 10;
            } else if (level === 7) {
                rangedAttack = 12;
                heal = 4;
                move = 16;
            } else if (level === 8) {
                rangedAttack = 18;
                heal = 6;
                move = 24;
            } else {
                rangedAttack = 1;
                move = 1;
            }
            break;
        case 'raider':
            if (level < 4) break;
            carry = _.round(1.5 * level);
            move = carry;
            break;
        case 'conscript':
            heal = 2;
            rangedAttack = 1;
            move = 3;
            break;
        case 'deconstructor':
            if (level < 6) break;
            work = 1 * level;
            move = work;
            break;
        case 'siegeEngine':
            if (level >= 7) {
                tough = 10;
                attack = 10;
                rangedAttack = 5;
                move = tough + attack + rangedAttack;
            } else {
                tough = _.round(0.5 * level);
                attack = _.round(0.5 * level);
                if (level > 3) {
                    attack = level + 1;
                    rangedAttack = 1;
                }
                move = tough + attack + rangedAttack;
            }
            break;
        case 'siegeHealer':
            if (level < 8) break;
            tough = 5;
            heal = 20;
            move = tough + heal;
            break;
        case 'claimAttacker':
            if (level < 4) break;
            if (level < 7) {
                claim = _.round(0.5 * level);
            } else if (level === 7) claim = 8; else claim = 15;
            move = claim;
            break;
        // Remote
        case 'claimer':
            claim = 1;
            move = 1;
            break;
        case 'reserver':
            claim = 2;
            if (level >= 6 && room.energyState) claim = 3; else if (level === 3) claim = 1;
            move = claim;
            break;
        case 'fuelTruck':
            carry = 20;
            move = 20;
            break;
        case 'remoteUpgrader':
            work = level * 2;
            carry = 2;
            move = work + carry;
            break;
        case 'remoteHarvester':
            if (level >= 4) {
                work = 4;
            } else {
                work = 2;
            }
            carry = 1;
            if (room.memory.roadsBuilt || level >= 6) move = work / 2; else move = work;
            break;
        case 'remoteAllInOne':
            work = 2;
            if (level < 4) {
                carry = level;
                move = work + carry;
                break;
            } else if (!TEN_CPU && level >= 5) {
                carry = level + 2;
                move = _.round((work + carry) / 2);
                break;
            } else {
                carry = level + 2;
                move = work + carry;
                break;
            }
        case 'remoteHauler':
            if (level >= 7) {
                carry = 30;
                if (misc) carry = 15;
                move = carry * 0.5;
                break;
            } else if (level === 6) {
                carry = 16;
                if (misc) carry = 8;
                move = carry * 0.5;
                break;
            } else {
                if (importantBuilds) {
                    carry = level;
                } else {
                    carry = level * 2;
                }
                if (room.memory.roadsBuilt) {
                    move = _.round(((carry) / 2) + 0.5);
                } else {
                    move = carry;
                }
                break
            }
        case 'commodityMiner':
            if (level >= 7) {
                carry = 14;
                work = 2;
                move = 16;
                break;
            } else {
                carry = 5;
                work = 1;
                move = 6;
                break;
            }
        case 'SKHarvester':
            work = 6;
            move = 6;
            break;
        case 'SKAttacker':
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
            attack = 20;
            move = 20;
            break;
        case 'powerHealer':
            heal = 25;
            move = 25;
            break;
        case 'powerHauler':
            carry = 25;
            move = 25;
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