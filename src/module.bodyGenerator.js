module.exports.bodyGenerator = function (level, role, room = undefined) {
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal;
    switch (role) {
        // Explorer/Scout
        case 'explorer':
            move = 1;
            break;
        case 'scout':
            move = 1;
            break;
        case 'claimScout':
            move = 1;
            break;
        case 'observer':
            move = 1;
            break;
        case 'messenger':
            move = 1;
            break;
        case 'proximityScout':
            move = 1;
            break;
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
        case 'drone':
            work = level;
            carry = _.random(1, level);
            move = work + carry;
            break;
        case 'worker':
            work = level;
            carry = level;
            move = work + carry;
            break;
        case 'repairer':
            work = 2;
            carry = 1;
            move = work + carry;
            break;
        case 'waller':
            work = level;
            carry = level;
            if (level === 8) {
                work = 15;
                carry = 10;
            }
            if (room.memory.state < 2 && room.memory.state !== -1) {
                work = 2;
                carry = 2;
            }
            move = work + carry;
            break;
        case 'upgrader':
            if (level === 8) {
                work = 15;
                carry = 1;
                move = 5;
                break;
            } else if (!room.memory.controllerContainer || level < 4) {
                work = level + 1;
                carry = 1;
                move = work + carry;
                break;
            } else {
                let multi = 1.25;
                if (room.memory.state > 1 && level > 5) multi = 2.5;
                if (room.memory.state > 2 && level > 5) multi = 3;
                work = _.round((multi * level) + 1);
                carry = 1;
                move = 2;
                break;
            }
        case 'hauler':
            if (level < 5) {
                carry = level;
                move = carry;
                break
            } else {
                carry = _.random(2 * level, 3 * level);
                move = _.round((carry / 2));
                break;
            }
        case 'courier':
            if (level < 5) {
                carry = 2;
                move = 2;
                break
            } else {
                carry = 6;
                move = 3;
                break;
            }
        case 'filler':
            if (level < 5) {
                carry = level;
                move = carry;
                break
            } else {
                carry = _.random(2 * level, 3 * level);
                move = _.round((carry / 2));
                break;
            }
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
                work = 5;
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
                rangedAttack = 12;
                heal = 8;
                move = 20;
            } else {
                rangedAttack = 1;
                tough = 1;
                move = 2;
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
            if (level < 3) break;
            claim = 1;
            move = 1;
            break;
        case 'reserver':
            claim = 2;
            move = claim;
            break;
        case 'pioneer':
            work = _.round((1 * level) / 2);
            carry = _.round((1 * level) / 3) || 1;
            move = work + carry;
            break;
        case 'fuelTruck':
            carry = 20;
            move = 20;
            break;
        case 'remoteUpgrader':
            if (level < 6) return;
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
            if (level < 3) {
                work = 1;
                carry = 1;
                move = 2;
                break;
            } else {
                work = _.round(0.5 * level);
                carry = 1;
                move = 2;
                break;
            }
        case 'remoteHauler':
            if (level < 5) {
                carry = level;
                move = carry;
                break
            } else {
                carry = _.random(1.25 * level, 3 * level);
                move = _.round((carry / 2) + 0.5);
                break;
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
            if (level < 7) break;
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