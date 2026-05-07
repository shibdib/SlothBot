/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");


let bodyCache = {};
let _haulerCacheTick = -1;
let _haulersByHarvester = {};

function getHaulersByHarvester() {
    if (_haulerCacheTick === Game.time) return _haulersByHarvester;
    _haulerCacheTick = Game.time;
    _haulersByHarvester = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.my && c.memory.role === 'remoteHauler' && c.memory.other && c.memory.other.harvester) {
            const hid = c.memory.other.harvester;
            if (!_haulersByHarvester[hid]) _haulersByHarvester[hid] = [];
            _haulersByHarvester[hid].push(c);
        }
    }
    return _haulersByHarvester;
}

/**
 * Generates Creep Bodies.
 * @constructor
 * @param {int} level - Room energy level.
 * @param {string} role - The creeps role.
 * @param {object} room - The spawning room.
 * @param {object} creepInfo - Overall queue object.
 */
class ModuleBodyGenerator {
    constructor(level, role, room = undefined, creepInfo = undefined) {
        this.level = level;
        this.role = role;
        this.room = room;
        this.creepInfo = creepInfo;
        this.energyAmount = room.energyCapacityAvailable;
        this.spareIncome = this.room.memory.energyInfo.spareIncome || 0;
        this.boostsRequired = false;
    }

    // Method to ensure the energy amount is correct based on conditions
    setEnergyAmount() {
        if (this.creepInfo && this.creepInfo.other && this.creepInfo.other.reboot || this.room.myCreeps.length <= 2) {
            this.energyAmount = Math.max(this.room.energyAvailable, 300); // Ensure a minimum of 300 energy
        } else if (!this.creepInfo || !this.creepInfo.military) {
            this.energyAmount = this.room.energyCapacityAvailable;
        }
    }

    // Method to check if the body is cached for a specific combination
    getCacheKey() {
        return `${this.energyAmount}.${this.role}.${this.spareIncome}.${JSON.stringify(this.creepInfo)}`;
    }

    // Main method to generate the body
    generateBody() {
        // Set energy amount based on conditions
        this.setEnergyAmount();

        // Generate cache key and check if it's already cached
        const cacheKey = this.getCacheKey();
        if (bodyCache[cacheKey]) {
            // We cant use cached if we need to generate boosts
            if (this.creepInfo && (!this.creepInfo.destination || !Memory.targetRooms[this.creepInfo.destination]
                || !Memory.targetRooms[this.creepInfo.destination].boosts)) {
                // If cached, return the cached body
                return {body: bodyCache[cacheKey], info: this.creepInfo};
            }
        }

        // Check if body is set in the creep info
        if (this.creepInfo && this.creepInfo.body) {
            return {body: this.creepInfo.body, info: this.creepInfo};
        }

        let bodyArray = [];
        let work, claim, carry, move, tough, attack, rangedAttack, heal, energyScaling, halfMove;

        // Generate body parts based on role
        switch (this.role) {
            case 'explorer':
            case 'scout':
                move = 1;
                break;

            case 'roadBuilder':
            case 'drone':
                if (!this.creepInfo.destination && INTEL[this.room.name].roadsBuilt) halfMove = true;
                if (!halfMove) {
                    work = Math.floor(this.energyAmount * 0.4 / BODYPART_COST[WORK]) || 1;
                    work = Math.min(work, 15);
                    carry = Math.floor((this.energyAmount * 0.2) / BODYPART_COST[CARRY]) || 1;
                    carry = Math.min(carry, 10);
                } else {
                    work = Math.floor(this.energyAmount * 0.51 / BODYPART_COST[WORK]) || 1;
                    work = Math.min(work, 20);
                    carry = Math.floor((this.energyAmount * 0.23) / BODYPART_COST[CARRY]) || 1;
                    carry = Math.min(carry, 12);
                }
                if (!this.room.energyState) {
                    work = 1;
                    carry = Math.floor((this.energyAmount * 0.1) / BODYPART_COST[CARRY]) || 1;
                    carry = Math.max(carry, 3);
                } else if (this.room.energyState === 1) {
                    work = Math.min(work, Math.max(1, Math.floor(this.spareIncome)));
                } else if (this.room.energyState === 2) {
                    work = Math.min(work, Math.max(3, Math.floor(this.spareIncome * 1.5)));
                }
                // state 3+: full capacity body — aggressively build with the surplus
                if (work < 1) return undefined;
                break;

            case 'upgrader':
                if (this.room.memory.controllerLink || this.room.memory.controllerContainer) {
                    work = Math.floor((this.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]) || 1;
                    work = Math.min(work, 49);
                    if (!this.room.energyState) {
                        work = 1;
                    } else if (this.room.energyState === 1) {
                        work = Math.min(work, Math.max(1, Math.floor(this.spareIncome)));
                    } else if (this.room.energyState === 2) {
                        work = Math.min(work, Math.max(3, Math.floor(this.spareIncome * 1.5)));
                    }
                    // state 3+: full capacity body — drain surplus into controller
                    carry = 1;
                    move = 0;
                } else {
                    if (!this.room.energyState) {
                        work = 1;
                    } else {
                        work = Math.floor(this.energyAmount * 0.4 / BODYPART_COST[WORK]) || 1;
                        work = Math.min(work, 15);
                    }
                    carry = Math.floor(this.energyAmount * 0.1 / BODYPART_COST[CARRY]) || 1;
                    carry = Math.min(carry, 10);
                    if (INTEL[this.room.name].roadsBuilt) halfMove = true;
                }
                if (work < 1) work = 1;
                if (this.level === 8) {
                    work = this.room.energyState > 1 ? Math.min(work, 15) : 1;
                }
                break;

            case 'labTech':
                carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
                carry = Math.min(carry, 12);

                if (INTEL[this.room.name].roadsBuilt) halfMove = true;
                break;

            case 'hauler':
                carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + (INTEL[this.room.name].roadsBuilt ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE]))) || 1;
                carry = Math.min(carry, this.room.level * 4); // Scale with room level

                if (INTEL[this.room.name].roadsBuilt) halfMove = true;
                break;

            case 'shuttle': {
                const roadsBuilt = INTEL[this.room.name].roadsBuilt;
                const moveCostPerCarry = roadsBuilt ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE];
                const distToHub = this.creepInfo && this.creepInfo.other && this.creepInfo.other.distanceToHub;
                if (distToHub) {
                    // Size to match source throughput: 10e/tick × round-trip ticks / 50e per CARRY
                    carry = Math.max(4, Math.ceil(10 * 2 * distToHub / BODYPART_COST[CARRY]));
                    // Cap to what the room can actually afford
                    carry = Math.min(carry, Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)));
                } else {
                    carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)) || 1;
                    carry = Math.min(carry, Math.max(10, this.room.level * 4));
                }
                if (roadsBuilt) halfMove = true;
                break;
            }

            case 'stationaryHarvester':
                work = Math.floor((this.energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;
                // Handle power creep stuff
                let powerCreep = _.find(Game.powerCreeps, c => c.my && c.memory.destinationRoom === this.room.name && c.powers[PWR_REGEN_SOURCE]);
                if (powerCreep) {
                    work = (SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME);
                } else {
                    work = Math.min(work, (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1);
                }
                carry = 1;
                if (this.room.level > 2) move = 0;
                break;


            case 'mineralHarvester':
                work = Math.floor(this.energyAmount / BODYPART_COST[WORK]) || 1;
                work = Math.min(work, 50);  // Max work to 50
                move = 0;
                break;

            // Military
            case 'attacker':
                attack = Math.floor(this.energyAmount / (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) || 1;
                attack = Math.min(attack, 25);
                break;

            case 'defender':
                halfMove = this.room.level >= 4;
                const moveRatio = halfMove ? 0.5 : 1;
                // Determine if we need melee or ranged
                const meleeMan = this.room.myCreeps.filter((c) => c.memory.role === 'defender' && c.hasActiveBodyparts(ATTACK));
                if (meleeMan.length && meleeMan.length >= this.room.hostileCreeps.length / 4) {
                    // Ranged Defender (Blinky)
                    heal = Math.max(Math.floor(this.energyAmount * 0.15 / (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio))), 1);
                    heal = Math.min(heal, 6);
                    const remainingEnergy = this.energyAmount - (heal * (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio)));
                    rangedAttack = Math.floor(remainingEnergy / (BODYPART_COST[RANGED_ATTACK] + (BODYPART_COST[MOVE] * moveRatio))) || 1;
                    rangedAttack = Math.min(rangedAttack, 49 - heal);
                } else {
                    // Melee Defender
                    heal = Math.max(Math.floor(this.energyAmount * 0.1 / (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio))), 1);
                    heal = Math.min(heal, 4);
                    const remainingEnergy = this.energyAmount - (heal * (BODYPART_COST[HEAL] + (BODYPART_COST[MOVE] * moveRatio)));
                    attack = Math.floor(remainingEnergy / (BODYPART_COST[ATTACK] + (BODYPART_COST[MOVE] * moveRatio))) || 1;
                    attack = Math.min(attack, 49 - heal);
                }
                break;
            case 'longbow':
            case 'testSquad':
            case 'longbowSquad':
                if (this.creepInfo && this.creepInfo.operation === 'harass') {
                    rangedAttack = 1;
                    break;
                } else if (this.creepInfo && Memory.targetRooms[this.creepInfo.destination] && Memory.targetRooms[this.creepInfo.destination].boosts) {
                    const defaultWaitFor = this.role === 'longbow' ? 1 : 2;
                    const waitFor = this.creepInfo.misc && this.creepInfo.misc.waitFor || defaultWaitFor;
                    heal = this.checkForNeededHeal(this.room, 1 / waitFor);
                    if (!heal) break;
                } else {
                    heal = Math.floor((this.energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
                    heal = Math.min(heal, 6);
                }
                const remainingEnergy = this.energyAmount - ((heal * BODYPART_COST[HEAL]) + heal * BODYPART_COST[MOVE]);
                rangedAttack = Math.floor(remainingEnergy / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) || 1;
                rangedAttack = Math.min(rangedAttack, 25 - heal);

                // Handle scaling down military creeps based on power
                if (this.creepInfo && this.creepInfo.other && this.creepInfo.other.power) {
                    let totalPower = (rangedAttack * RANGED_ATTACK_POWER) + (heal * HEAL_POWER);
                    if (totalPower > this.creepInfo.other.power) {
                        let ratio = (this.creepInfo.other.power) / totalPower;
                        rangedAttack = Math.ceil(rangedAttack * ratio);
                        heal = Math.ceil(heal * ratio);
                    }
                    this.room.memory.additionalPowerNeeded = totalPower < this.creepInfo.other.power ? true : undefined;
                }
                break;

            case 'siegeDuo':
                const healerDuo = _.find(this.room.myCreeps, (c) => c.memory.role === 'siegeDuo' && c.hasActiveBodyparts(HEAL) && !c.memory.partner);
                if (!healerDuo) {
                    if (Memory.targetRooms[this.creepInfo.destination] && Memory.targetRooms[this.creepInfo.destination].boosts) {
                        heal = this.checkForNeededHeal(this.room, 1);
                        if (!heal) break;
                    } else {
                        heal = Math.floor((this.energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
                        heal = Math.min(heal, 6);
                    }
                } else {
                    work = Math.floor(this.energyAmount / (BODYPART_COST[WORK] + BODYPART_COST[MOVE])) || 1;
                    work = Math.min(work, 25);  // Max work to 25
                }
                break;

            case 'cleaner':
                work = Math.floor(this.energyAmount / (BODYPART_COST[WORK] + BODYPART_COST[MOVE])) || 1;
                work = Math.min(work, 25);  // Max work to 25
                break;

            case 'claimAttacker':
                claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
                claim = Math.min(claim, 25);  // Max claim to 25
                break;

            case 'claimer':
                claim = 1;
                move = 2;
                break;

            case 'reserver':
                // Calculate claim based on energy and the cost of CLAIM and MOVE parts.
                claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
                claim = Math.min(claim, 5 * (this.room.energyState || 1));

                // If there are roads built in both the current room and the destination room
                if (INTEL[this.creepInfo.destination] && INTEL[this.creepInfo.destination].roadsBuilt && INTEL[this.room.name].roadsBuilt) {
                    // Reduce the cost of MOVE parts by 50% if roads are built
                    claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + (BODYPART_COST[MOVE] * 0.5))) || 1;
                    claim = Math.min(claim, 5 * (this.room.energyState || 1));
                    halfMove = true;  // Indicate that half of the normal move cost is being used
                }

                if (claim > CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][this.room.level] * 3) claim = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][this.room.level] * 3;
                break;

            case 'remoteHarvester':
                // Base work calculation
                const workRatio = INTEL[this.creepInfo.destination] && INTEL[this.creepInfo.destination].roadsBuilt ? 0.8 : 0.6;
                work = Math.floor((this.energyAmount * workRatio) / BODYPART_COST[WORK]) || 1;

                // Set source energy capacity for a reserved room, double it at level 7 for CPU
                const SOURCE_CAPACITY = this.room.controller.level >= 7 ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_CAPACITY;
                if (INTEL[this.creepInfo.destination] && INTEL[this.creepInfo.destination].sk) {
                    work = Math.ceil(SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
                } else if (INTEL[this.creepInfo.destination] && INTEL[this.creepInfo.destination].reservation === MY_USERNAME) {
                    work = Math.ceil(SOURCE_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
                } else {
                    work = Math.ceil(SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
                }
                carry = 1;

                // Check for roads and halfMove setting
                if (INTEL[this.creepInfo.destination].roadsBuilt) halfMove = true;
                break;

            case 'remoteHauler':
                const workCost = this.room.level < 4 ? 0 : BODYPART_COST[WORK];

                const assignedHarvester = Game.getObjectById(this.creepInfo.other.harvester);
                if (!assignedHarvester) return false;
                const otherAssignedHaulers = getHaulersByHarvester()[this.creepInfo.other.harvester] || [];
                const currentHaulingCapacity = _.sum(otherAssignedHaulers, c => c.getActiveBodyparts(CARRY) * 50);
                const harvestRate = this.creepInfo.other.harvestAmount - currentHaulingCapacity;
                const desiredCarry = Math.ceil(harvestRate / CARRY_CAPACITY) || 1;

                // Work parts after level 3
                work = this.room.level >= 4 ? 1 : 0;

                // Set move if the assigned harvesters intel checks out
                if (INTEL[assignedHarvester.room.name].roadsBuilt && INTEL[this.room.name].roadsBuilt) {
                    carry = Math.floor((this.energyAmount - workCost - work * BODYPART_COST[MOVE] * 0.5) / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE] * 0.5)) || 1;
                    halfMove = true;
                } else {
                    carry = Math.floor((this.energyAmount - workCost - work * BODYPART_COST[MOVE]) / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
                }

                // Limit carry to what is actually needed
                carry = Math.min(carry, desiredCarry);

                // Adjust carry parts to account for halmove setting
                if (halfMove) {
                    if (carry + work > 33) carry = 33 - work;
                } else if (carry + work > 25) {
                    carry = 25 - work;
                }

                break;

            case 'SKMineral':
            case 'commodityMiner':
                energyScaling = true;
                work = Math.floor((this.energyAmount * 0.35) / BODYPART_COST[WORK]) || 1;
                work = Math.min(work, 15);

                carry = Math.floor((this.energyAmount * 0.15) / BODYPART_COST[CARRY]) || 1;
                carry = Math.min(carry, 10);
                break;

            case 'SKAttacker':
                attack = 18;
                rangedAttack = 2;
                heal = 5;
                break;

            case 'powerAttacker':
                attack = 25;
                break;

            case 'powerHealer':
                heal = 16;
                break;

            case 'powerHauler':
                carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
                carry = Math.min(carry, 25);
                break;
        }
        // Utility function to add body parts
        const addBodyParts = (count, part, array) => {
            count = Math.floor(count);
            if (count > 0) array.push(...Array(count).fill(part));
        };

        // Generate body parts
        addBodyParts(work, WORK, bodyArray);
        addBodyParts(carry, CARRY, bodyArray);
        addBodyParts(claim, CLAIM, bodyArray);
        addBodyParts(rangedAttack, RANGED_ATTACK, bodyArray);
        addBodyParts(attack, ATTACK, bodyArray);

        // Additional body part generation logic (e.g., heal, move, tough)
        const healArray = [];
        const toughArray = [];
        addBodyParts(heal, HEAL, healArray);
        addBodyParts(tough, TOUGH, toughArray);

        // Generate MOVE parts
        let moveArray = [];
        const totalParts = bodyArray.length + healArray.length + toughArray.length;
        if (move !== 0) {
            if (move && move > 0) {
                addBodyParts(move, MOVE, moveArray);
            } else {
                const moveParts = halfMove
                    ? Math.ceil(totalParts * 0.5)
                    : totalParts;
                addBodyParts(moveParts, MOVE, moveArray);
            }
        }

        // Validate body composition
        let i = 0;
        while (this.bodyCost([...toughArray, ...moveArray, ..._.shuffle(bodyArray), ...healArray]) > this.energyAmount && i < bodyArray.length) {
            i++;
            bodyArray = _.uniq(bodyArray);
        }

        // Assemble the final body
        let generatedBody;
        if (['SKAttacker', 'powerAttacker', 'claimer'].includes(this.role)) {
            generatedBody = [...toughArray, ...moveArray, ..._.shuffle(bodyArray), ...healArray];
        } else {
            generatedBody = [...toughArray, ..._.shuffle(bodyArray), ...moveArray, ...healArray];
        }

        // Ensure the body is valid, 50 parts max
        if (generatedBody.length > 50) {
            generatedBody = generatedBody.slice(0, 50);
        }

        // Cache the generated body
        bodyCache[cacheKey] = generatedBody;

        // Finally, return the generated body
        return {body: generatedBody, info: this.creepInfo};
    }

    // Utility function to calculate body cost
    bodyCost(body) {
        return body.reduce((cost, part) => cost + BODYPART_COST[part], 0);
    }

    checkForNeededHeal(room, multiplier = 0.51) {
        if (!INTEL[this.creepInfo.destination] || !INTEL[this.creepInfo.destination].towerData) return false;
        const damageToTank = Math.round(INTEL[this.creepInfo.destination].towerData.maxDamage);
        const neededHeals = determineNeededHeals(damageToTank);
        let neededBoost = {};
        let optimalHeal = 0;
        for (const heal in neededHeals) {
            const scaled = Math.ceil(neededHeals[heal].amount * multiplier);
            if (scaled > 20) continue;
            if (this.room.store(neededHeals[heal].boost) >= 30 * scaled) {
                neededBoost.boostPart = HEAL;
                neededBoost.boost = neededHeals[heal].boost;
                neededBoost.boostTier = neededHeals[heal].tier;
                neededBoost.amount = neededHeals[heal].amount;
                optimalHeal = scaled;
                break;
            }
        }
        if (!neededBoost.amount) return false;
        // If we can't support the size, break
        const maxHeals = Math.floor(this.energyAmount / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
        if (maxHeals < optimalHeal) return false;
        Memory.targetRooms[this.creepInfo.destination].boostTier = neededBoost.boostTier;
        this.creepInfo.neededBoosts = neededBoost;
        return optimalHeal;
    }
}

profiler.registerClass(ModuleBodyGenerator, 'BodyGenerator');
module.exports = ModuleBodyGenerator;

function determineNeededHeals(damage) {
    const healTiers = {};
    let tier = 0;
    for (const boost of BOOST_USE[HEAL]) {
        const healPowerPerHeal = HEAL_POWER * BOOSTS[HEAL][boost].heal;
        healTiers[tier] = {};
        healTiers[tier].amount = Math.ceil(damage / healPowerPerHeal);
        healTiers[tier].tier = tier;
        healTiers[tier].boost = boost;
        tier++;
    }
    return healTiers;
}