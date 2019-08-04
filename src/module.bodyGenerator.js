module.exports.bodyGenerator = function (level, role, room = undefined) {
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal;
    let importantBuilds = _.filter(room.constructionSites, (s) => s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_CONTAINER).length;
    switch (role) {
        // Explorer/Scout
        case 'explorer':
        case 'scout':
        case 'claimScout':
        case 'observer':
        case 'messenger':
        case 'proximityScout':
        case 'herald':
            move = 1;
            break;
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
        case 'pioneer':
        case 'drone':
            work = _.random(level, level * 2);
            carry = _.random(2, level);
            move = work + carry;
            if (room.memory.roadsBuilt) move = ((work + carry) / 2) + 0.5;
            break;
        case 'worker':
            work = level;
            carry = level;
            move = work + carry;
            break;
        case 'remoteRoad':
        case 'repairer':
            work = 2;
            carry = 1;
            move = work + carry;
            break;
        case 'waller':
            work = _.random(level, level * 2);
            carry = _.random(2, level);
            if (level === 8) {
                work = 15;
                carry = 10;
            }
            if (room.memory.state < 2 && room.memory.state !== -1) {
                work = _.random(level, level * 4);
                carry = _.random(2, level);
            }
            move = work + carry;
            if (room.memory.roadsBuilt) move = ((work + carry) / 2) + 0.5;
            break;
        case 'upgrader':
            if (level === 8) {
                if (room.memory.state > 2) {
                    work = 15;
                    carry = 1;
                    move = 5;
                    break;
                } else {
                    work = 1;
                    carry = 1;
                    move = work + carry;
                    break;
                }
            } else if (importantBuilds) {
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
                work = 14;
                carry = 1;
                move = 5;
                break;
            }
        case 'hauler':
            if (level < 4 || !room.memory.roadsBuilt) {
                carry = level;
                move = carry;
                break
            } else {
                if (!room.memory.hubLink) {
                    carry = _.random(1.75 * level, 2 * level);
                    move = _.round((carry / 2) + 0.5);
                    break;
                } else {
                    carry = 3 + (room.controller.level / 2);
                    move = (carry / 2) + 0.25;
                    break;
                }
            }
        case 'filler':
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
            carry = 6;
            move = 3;
            break;
        case 'labTech':
            carry = _.round(1.7 * level);
            move = _.round(carry / 2);
            break;
        case 'stationaryHarvester':
            if (level < 5) {
                work = 4;
                carry = 1;
                move = 2;
                break;
            } else {
                work = 6;
                carry = 1;
                move = 2;
                break;
            }
        case 'mineralHarvester':
            let multi = 1.25;
            if (room.memory.state > 1 && level > 5) multi = 2.5;
            if (room.memory.state > 2 && level > 5) multi = 3;
            work = _.round((multi * level) + 1);
            move = 2;
            break;
        // Military
        case 'responder':
            attack = 1 * level;
            if (level < 7 && level > 3) {
                attack = 3 * level;
            }
            move = _.round(attack / 2);
            if (level >= 7) {
                tough = 3;
                attack = 30;
                move = 17;
            }
            break;
        case 'remoteResponse':
            if (level < 5) {
                tough = _.round(0.5 * level);
                rangedAttack = _.round((0.25 * level));
                attack = _.round((0.5 * level) + 1);
                heal = 0;
            } else {
                tough = _.round(0.5 * level);
                rangedAttack = _.round((0.5 * level) + 1);
                attack = _.round((0.5 * level) + 1);
                heal = 0;
            }
            move = tough + rangedAttack + heal + attack;
            break;
        case 'remoteMedic':
            heal = 1;
            move = heal;
            break;
        case 'remoteGuard':
            tough = _.round(0.5 * level);
            rangedAttack = _.round((0.25 * level));
            attack = _.random(2, _.round((0.5 * level) + 1));
            heal = _.random(0, 1);
            move = tough + rangedAttack + heal + attack + 1;
            break;
        case 'attacker':
            tough = _.round(0.5 * level);
            attack = _.round(0.5 * level);
            heal = 0;
            if (level > 3) {
                attack = level + 1;
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
                rangedAttack = 4;
                heal = 2;
                move = 6;
            } else if (level === 6) {
                rangedAttack = 5;
                heal = 3;
                move = 8;
            } else if (level === 7) {
                rangedAttack = 6;
                heal = 5;
                move = 11;
            } else if (level === 8) {
                rangedAttack = 17;
                heal = 8;
                move = 25;
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
        case 'swarm':
            if (_.random(0, 1) === 1) {
                rangedAttack = 1
            } else {
                attack = 1
            }
            move = 1;
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
        case 'unClaimer':
            if (level < 4) break;
            claim = _.round(0.5 * level);
            move = claim;
            break;
        // Remote
        case 'claimer':
            claim = 1;
            move = 1;
            break;
        case 'reserver':
            claim = 2;
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
        case 'remoteUtility':
            work = 1 * level;
            carry = _.round((1 * level) / 2) || 1;
            move = work + carry;
            break;
        case 'remoteHarvester':
            if (room.memory.roadsBuilt) {
                work = 6;
                carry = 1;
                move = 3;
                break;
            } else {
                work = 3;
                carry = 1;
                move = 3;
                break;
            }
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
            if (level < 7) {
                work = 0;
                if (importantBuilds) {
                    carry = level;
                } else {
                    carry = level * 2;
                }
                if (room.memory.roadsBuilt) {
                    work = _.random(0, 1, false);
                    move = _.round(((carry + work) / 2) + 0.5);
                } else {
                    move = work + carry;
                }
                break
            } else {
                if (importantBuilds || room.memory.state < 3) {
                    carry = level * 2;
                    work = _.random(0, 1, false);
                    move = _.round(((carry + work) / 2) + 0.5);
                    break
                } else {
                    carry = 30;
                    work = 1;
                    move = 16;
                    break;
                }
            }
        case 'SKattacker':
            attack = 16;
            tough = 4;
            heal = 5;
            move = attack + heal + tough;
            break;
        case 'SKsupport':
            tough = 5;
            heal = 10;
            move = heal + tough;
            break;
        case 'SKworker':
            work = 6;
            carry = 1;
            move = 6;
            break;
        case 'SKmineral':
            work = 15;
            carry = 10;
            move = work + carry;
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
    for (let i = 0; i < attack; i++) body.push(ATTACK)
    for (let i = 0; i < rangedAttack; i++) body.push(RANGED_ATTACK)
    let moveArray = [];
    for (let i = 0; i < move; i++) moveArray.push(MOVE)
    let healArray = [];
    for (let i = 0; i < heal; i++) healArray.push(HEAL)
    let toughArray = [];
    for (let i = 0; i < tough; i++) toughArray.push(TOUGH)
    return toughArray.concat(shuffle(body), moveArray, healArray);
};