/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Generates Creep Bodies.
 * @constructor
 * @param {int} level - Room energy level.
 * @param {string} role - The creeps role.
 * @param {object} room - The spawning room.
 * @param {object} creepInfo - Overall queue object.
 */

let bodyCache = {};

module.exports.bodyGenerator = function (level, role, room = undefined, creepInfo = undefined) {
    // Generate body
    let body = [];
    let work, claim, carry, move, tough, attack, rangedAttack, heal, energyScaling, halfMove;
    let energyAmount = room.energyCapacityAvailable;

    // Ensure energyAmount is correct based on conditions
    if (creepInfo.other.reboot || room.myCreeps.length <= 2) {
        energyAmount = Math.max(room.energyAvailable, 300);  // Ensure a minimum of 300 energy
    }

    // Determine if there are important construction sites in the room
    let importantBuild = _.filter(room.constructionSites, (s) =>
        s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
    ).length > 0;  // Returns true if any important build sites are found

    // Check if body is cached for this specific combination
    let cacheKey = `${energyAmount}.${role}.${JSON.stringify(creepInfo)}`;
    if (bodyCache[cacheKey]) {
        return bodyCache[cacheKey];  // Return cached body if it exists
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
        case 'roadBuilder':
            energyScaling = true;
            work = Math.floor((energyAmount * 0.4) / BODYPART_COST[WORK]) || 1;
            work = Math.min(work, 15);  // Max work to 15
            carry = Math.floor((energyAmount * 0.1) / BODYPART_COST[CARRY]) || 1;
            carry = Math.min(carry, 10);  // Max carry to 10
            break;

        case 'upgrader':
            energyScaling = true;

            if (room.level < room.controller.level) {
                // In case the room level is lower than the controller level, use minimal parts
                work = 1;
                carry = 1;
            } else if (room.memory.controllerContainer) {
                // If there's a controller container, prioritize work and carry parts for upgrader
                work = Math.floor((energyAmount - (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) / BODYPART_COST[WORK]) || 1;
                work = Math.min(work, 48);  // Max work to 48
                if (level === 8) work = 15;  // Special case for level 8
                carry = 1;
                move = 1;
            } else {
                // Default upgrader setup
                work = Math.floor((energyAmount * 0.4) / BODYPART_COST[WORK]) || 1;
                work = Math.min(work, 5);  // Max work to 5
                carry = Math.floor((energyAmount * 0.1) / BODYPART_COST[CARRY]) || 1;
                carry = Math.min(carry, 3);  // Max carry to 3
                if (INTEL[room.name].roadsBuilt) halfMove = true;
            }
            break;

        case 'powerManager':
        case 'hauler':
        case 'labTech':
            carry = Math.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            carry = Math.min(carry, level * 2);  // Max carry to level * 2
            if (INTEL[room.name].roadsBuilt) halfMove = true;
            break;

        case 'shuttle':
            carry = Math.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            let sources = _.filter(room.sources, s => !s.memory.link && s.memory.distanceToHub);
            let farthestSourceDistance = sources.length ? _.max(sources, 'memory.distanceToHub').memory.distanceToHub * 2 : 40;
            let energyHarvestedPerTrip = (HARVEST_POWER * 6) * farthestSourceDistance;
            carry = Math.min(carry, energyHarvestedPerTrip / CARRY_CAPACITY);
            if (INTEL[room.name].roadsBuilt) halfMove = true;
            break;

        case 'stationaryHarvester':
            // Goal is to have enough WORK parts to empty a source in half of its lifetime
            work = Math.floor((energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;

            let powerCreep = _.find(Game.powerCreeps, c => c.my && c.memory.destinationRoom === room.name && c.powers[PWR_REGEN_SOURCE]);
            if (powerCreep) {
                work = (SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME);
            } else {
                work = Math.min(work, (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1);
            }

            carry = 1;
            move = 1;
            break;

        case 'mineralHarvester':
            energyScaling = true;
            work = Math.floor((energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;
            work = Math.min(work, 30);  // Max work to 30
            move = 1;
            break;

        // Military
        case 'attacker':
            tough = Math.floor((energyAmount * 0.02) / BODYPART_COST[TOUGH]) || 1;
            tough = Math.min(tough, 3);  // Max tough to 3
            attack = Math.floor((energyAmount * 0.48) / BODYPART_COST[ATTACK]) || 1;
            attack = Math.min(attack, 20);  // Max attack to 20
            break;

        case 'defender':
            rangedAttack = 0;
            attack = 0;

            if (room.level < 3) {
                attack = 1;
            } else {
                if (Math.random() > 0.25 || level < 5) {
                    attack = Math.floor((energyAmount * 0.45) / BODYPART_COST[ATTACK]) || 1;
                } else {
                    rangedAttack = Math.floor((energyAmount * 0.45) / BODYPART_COST[RANGED_ATTACK]) || 1;
                }
                attack = Math.min(attack, 32);  // Max attack to 32
                rangedAttack = Math.min(rangedAttack, 32);  // Max rangedAttack to 32
                move = Math.floor((attack + rangedAttack) * 0.5);  // Set move based on attack and rangedAttack
            }
            break;


        case 'longbow':
            rangedAttack = Math.floor((energyAmount * 0.7) / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) || 1;
            rangedAttack = Math.min(rangedAttack, 17);  // Max rangedAttack to 17

            heal = Math.floor((energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
            heal = Math.min(heal, 8);  // Max heal to 8

            // Handle scaling down military creeps based on power
            if (creepInfo.other && creepInfo.other.power) {
                let totalPower = (rangedAttack * RANGED_ATTACK_POWER) + (heal * HEAL_POWER);
                if (totalPower > creepInfo.other.power) {
                    let ratio = creepInfo.other.power / totalPower;
                    rangedAttack = Math.ceil(rangedAttack * ratio);
                    heal = Math.ceil(heal * ratio);
                }
            }
            break;

        case 'poke':
            // Randomly assign either rangedAttack or attack
            if (Math.random() > 0.5) {
                rangedAttack = 1;
            } else {
                attack = 1;
            }
            break;

        case 'cleaner':
            work = Math.floor(energyAmount / (BODYPART_COST[WORK] + BODYPART_COST[MOVE])) || 1;
            work = Math.min(work, 25);  // Max work to 25
            break;

        case 'claimAttacker':
            claim = Math.floor((energyAmount * 0.50) / BODYPART_COST[CLAIM]) || 1;
            claim = Math.min(claim, 25);  // Max claim to 25
            break;

// Remote
        case 'claimer':
            claim = 1;
            move = Math.floor(energyAmount - BODYPART_COST[CLAIM]) || 1;
            move = Math.min(move, 5);  // Max move to 5
            break;

        case 'reserver':
            energyScaling = true;
            claim = Math.floor(energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
            claim = Math.min(claim, 20);  // Max claim to 20

            if (importantBuild) {
                claim = 1;  // Override claim if it's an important build
            }

            if (INTEL[creepInfo.destination] && INTEL[creepInfo.destination].roadsBuilt && INTEL[room.name].roadsBuilt) {
                claim = Math.floor(energyAmount / (BODYPART_COST[CLAIM] + (BODYPART_COST[MOVE] * 0.5))) || 1;
                claim = Math.min(claim, 20);  // Max claim to 20
                halfMove = true;
            }
            break;

        case 'remoteHarvester':
            // Base work calculation
            const workRatio = room.level >= 5 ? 0.65 : 0.5;
            work = Math.floor((energyAmount * workRatio) / BODYPART_COST[WORK]) || 1;

            // SK-specific work adjustment
            if (creepInfo.other.SK && work > SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) {
                work = Math.floor(SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 4;
            }
            // Reserved source work adjustment
            else if (INTEL[creepInfo.destination].reservation === MY_USERNAME &&
                work > SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME) + 1) {
                work = Math.floor(SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
            }
            // Neutral source work adjustment
            else if ((!INTEL[creepInfo.destination] || INTEL[creepInfo.destination].reservation !== MY_USERNAME) &&
                work > SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME) + 1) {
                work = Math.floor(SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
            }

            carry = 1;

            // Check for roads and halfMove setting
            if (INTEL[creepInfo.destination].roadsBuilt && INTEL[room.name].roadsBuilt) {
                halfMove = true;
            }
            break;

        case 'remoteHauler':
            let workCost = room.level < 4 ? 0 : BODYPART_COST[WORK];
            carry = Math.floor(((energyAmount - workCost) * 0.49) / BODYPART_COST[CARRY]) || 1;

            // Max 20 at level 7+, else 12, always have at least 1
            carry = Math.min(carry, room.level >= 7 ? 20 : 12);
            carry = Math.max(carry, 1);

            // Work parts after level 3
            work = room.level >= 4 ? 1 : 0;

            // Set move for level 7+
            halfMove = room.level >= 7;

            // Adjust carry if it exceeds limit for room levels below 7
            if (room.level < 7 && carry > 24) carry = 24;
            break;

        case 'SKMineral':
        case 'commodityMiner':
            energyScaling = true;
            work = Math.floor((energyAmount * 0.35) / BODYPART_COST[WORK]) || 1;
            work = Math.min(work, 15);

            carry = Math.floor((energyAmount * 0.15) / BODYPART_COST[CARRY]) || 1;
            carry = Math.min(carry, 10);
            break;

        case 'SKAttacker':
            attack = 19;
            heal = 6;
            break;

        case 'powerAttacker':
            attack = 25;
            break;

        case 'powerHealer':
            heal = 16;
            break;

        case 'fuelTruck':
        case 'robber':
        case 'powerHauler':
            carry = Math.floor((energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
            carry = Math.min(carry, 25);
            break;

    }
    // Calculate energy multiplier
    let energyMulti = energyScaling && room.storage && room.energyState < 3 ? Math.max(0.05, room.energyState / 4) : 1;

    // Utility function to add body parts
    const addBodyParts = (count, part, array) => {
        const numParts = Math.ceil(count * energyMulti);
        if (numParts > 0) array.push(...Array(numParts).fill(part));
    };

    // Generate main body parts
    addBodyParts(work, WORK, body);
    addBodyParts(carry, CARRY, body);
    addBodyParts(claim, CLAIM, body);
    addBodyParts(rangedAttack, RANGED_ATTACK, body);
    addBodyParts(attack, ATTACK, body);

    // Generate special body parts
    const healArray = [];
    const toughArray = [];
    addBodyParts(heal, HEAL, healArray);
    addBodyParts(tough, TOUGH, toughArray);

    // Generate MOVE parts
    let moveArray = [];
    const totalParts = body.length + healArray.length + toughArray.length;
    if (move && move > 0) {
        addBodyParts(move, MOVE, moveArray);
    } else {
        const moveParts = halfMove
            ? Math.ceil((totalParts * 0.5) * energyMulti)
            : totalParts;
        addBodyParts(moveParts, MOVE, moveArray);
    }

    // Validate and adjust body composition
    let i = 0;
    while (bodyCost([...toughArray, ...moveArray, ..._.shuffle(body), ...healArray]) > energyAmount && i < body.length) {
        i++;
        body = _.uniq(body);
    }

    // Assemble the final body
    let generatedBody;
    if (['SKAttacker', 'powerAttacker', 'claimer'].includes(role)) {
        generatedBody = [...toughArray, ...moveArray, ..._.shuffle(body), ...healArray];
    } else {
        generatedBody = [...toughArray, ..._.shuffle(body), ...moveArray, ...healArray];
    }

    // Cache the generated body
    bodyCache[cacheKey] = generatedBody;

};

const bodyCost = (body) => body.reduce((cost, part) => cost + BODYPART_COST[part], 0);
