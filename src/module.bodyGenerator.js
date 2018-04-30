module.exports.bodyGenerator = function (level, role) {
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
        case 'observer':
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
            move = work + carry;
            break;
        case 'upgrader':
            if (level < 4) {
                work = level + 1;
                carry = 1;
                move = work + carry;
                break;
            } else {
                work = (2 * level) - 1;
                carry = _.round((1 * level) / 3) || 1;
                move = work / 2;
                break;
            }
        case 'hauler':
            if (level < 4) {
                carry = level;
                move = carry;
                break
            } else {
                carry = _.random(level, 3 * level);
                work = _.random(0, 1);
                move = _.round((carry / 2)) + work;
                break;
            }
        case 'labTech':
            carry = _.round(1.7 * level);
            move = _.round(carry / 2);
            break;
        case 'stationaryHarvester':
            if (level < 3) {
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
            work = 10;
            carry = 10;
            move = 10;
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
            tough = _.round(0.5 * level);
            rangedAttack = _.round((0.5 * level) + 1);
            attack = _.round((0.5 * level) + 1);
            heal = 0;
            if (level > 4) heal = 1;
            move = tough + rangedAttack + heal + attack;
            break;
        case 'attacker':
            tough = _.round(0.5 * level);
            attack = _.round(0.5 * level);
            heal = 0;
            if (level > 3) {
                attack = level + 1;
                heal = _.round((1 * level) / 2);
            }
            move = tough + heal + attack;
            break;
        case 'healer':
            tough = 2;
            heal = level - 1;
            if (level >= 5) heal = level;
            if (level >= 7) heal = 15;
            move = tough + heal;
            break;
        case 'longbow':
            if (level === 4) {
                rangedAttack = 2;
                heal = 2;
                tough = 3;
                move = 7;
            } else if (level === 5) {
                rangedAttack = 3;
                heal = 3;
                tough = 3;
                move = 9;
            } else if (level === 6) {
                rangedAttack = 4;
                heal = 4;
                tough = 4;
                move = 12;
            } else if (level >= 7) {
                rangedAttack = 10;
                heal = 10;
                tough = 5;
                move = 25;
            }
            break;
        case 'raider':
            if (level < 6) break;
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
        case 'deconstructor':
            if (level < 6) break;
            work = 1 * level;
            move = work;
            break;
        case 'siegeEngine':
            if (level < 7) break;
            tough = 10;
            attack = 10;
            rangedAttack = 5;
            move = tough + attack + rangedAttack;
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
            claim = _.round(0.3 * level);
            move = claim;
            break;
        case 'pioneer':
            work = _.round((1 * level) / 2);
            carry = _.round((1 * level) / 3) || 1;
            move = work + carry;
            break;
        case 'remoteUtility':
            work = 1 * level;
            carry = _.round((1 * level) / 2) || 1;
            move = work + carry;
            break;
        case 'remoteHarvester':
            work = _.round(0.5 * level);
            carry = 1;
            move = _.round(work / 2);
            break;
        case 'remoteHauler':
            carry = _.random(level, 2 * level);
            work = _.random(0, 1);
            move = _.round((carry / 2)) + work;
            break;
        case 'SKattacker':
            attack = 20;
            heal = 5;
            move = attack + heal;
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
}