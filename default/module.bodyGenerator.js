/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("./tools.profiler");


let bodyCache = {};

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
    }

    // Method to ensure the energy amount is correct based on conditions
    setEnergyAmount() {
        if (this.creepInfo.other.reboot || this.room.myCreeps.length <= 2) {
            this.energyAmount = Math.max(this.room.energyAvailable, 300); // Ensure a minimum of 300 energy
        }
    }

    // Method to check for important construction sites in the room
    hasImportantConstruction() {
        return _.filter(this.room.constructionSites, (s) =>
            s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_WALL && s.structureType !== STRUCTURE_RAMPART
        ).length > 0; // Returns true if any important build sites are found
    }

    // Method to check if the body is cached for a specific combination
    getCacheKey() {
        return `${this.energyAmount}.${this.role}.${JSON.stringify(this.creepInfo)}`;
    }

    // Main method to generate the body
    generateBody() {
        // Set energy amount based on conditions
        this.setEnergyAmount();

        // Generate cache key and check if it's already cached
        const cacheKey = this.getCacheKey();
        if (bodyCache[cacheKey]) {
            // If cached, return the cached body
            return bodyCache[cacheKey];
        }

        let bodyArray = [];
        let work, claim, carry, move, tough, attack, rangedAttack, heal, energyScaling, halfMove;

        // Generate body parts based on role
        switch (this.role) {
            case 'explorer':
            case 'tester':
            case 'scout':
                move = 1;
                break;

            case 'drone':
            case 'roadBuilder':
                energyScaling = true;

                // Scale work based on available energy, and limit it to 15 parts max
                work = Math.floor((this.energyAmount * 0.4) / BODYPART_COST[WORK]) || 1;
                work = Math.min(work, 15); // Max work to 15

                // Scale carry based on available energy, and limit it to 10 parts max
                carry = Math.floor((this.energyAmount * 0.1) / BODYPART_COST[CARRY]) || 1;
                carry = Math.min(carry, 10); // Max carry to 10

                break;

            case 'upgrader':
                energyScaling = true;

                if (this.room.level < this.room.controller.level) {
                    work = 1;
                    carry = 1;
                }
                // If we have a controller container
                else if (this.room.memory.controllerContainer) {
                    work = Math.floor((this.energyAmount - (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) / BODYPART_COST[WORK]) || 1;
                    work = Math.min(work, 49); // Max work to 49
                    if (this.level === 8) work = 15; // Special case for level 8
                    carry = 1;  // Always have 1 carry part
                    move = 0;
                }
                else {
                    work = Math.floor(this.energyAmount * 0.4 / BODYPART_COST[WORK]) || 1;
                    work = Math.min(work, 5); // Max work to 5
                    carry = Math.floor(this.energyAmount * 0.1 / BODYPART_COST[CARRY]) || 1;
                    carry = Math.min(carry, 3); // Max carry to 3

                    // Half-move if the roads are built, to improve efficiency
                    if (INTEL[this.room.name].roadsBuilt) halfMove = true;
                }
                break;

            case 'labTech':
                // Scale carry based on available energy and limit it by level
                carry = Math.floor((this.energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
                carry = Math.min(carry, 6);

                // Check if roads are built and adjust movement accordingly
                if (INTEL[this.room.name].roadsBuilt) halfMove = true;

                break;

            case 'hauler':
            case 'shuttle':
                // Scale carry based on available energy and limit it by level
                carry = Math.floor((this.energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
                carry = Math.min(carry, LINK_CAPACITY / CARRY_CAPACITY);  // Max carry to fit a links capacity

                // Check if roads are built and adjust movement accordingly
                if (INTEL[this.room.name].roadsBuilt) halfMove = true;

                break;

            case 'stationaryHarvester':
                // Goal is to have enough WORK parts to empty a source in half of its lifetime
                work = Math.floor((this.energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;

                // If there's a power creep with PWR_REGEN_SOURCE, adjust the work calculation
                let powerCreep = _.find(Game.powerCreeps, c => c.my && c.memory.destinationRoom === this.room.name && c.powers[PWR_REGEN_SOURCE]);
                if (powerCreep) {
                    // Include the additional energy regeneration from PWR_REGEN_SOURCE
                    work = (SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME);
                } else {
                    // Without power creep, base the work on the source energy capacity and harvest power
                    work = Math.min(work, (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1);
                }

                // Ensure a minimum of 1 carry part to allow harvesting
                carry = 1;

                if (this.room.storage) move = 0; else move = 1;

                break;


            case 'mineralHarvester':
                energyScaling = true;
                work = Math.floor((this.energyAmount - (BODYPART_COST[MOVE] + BODYPART_COST[CARRY])) / BODYPART_COST[WORK]) || 1;
                work = Math.min(work, 50);  // Max work to 50
                move = 0;
                break;

            // Military
            case 'attacker':
                tough = Math.floor((this.energyAmount * 0.02) / BODYPART_COST[TOUGH]) || 1;
                tough = Math.min(tough, 3);  // Max tough to 3
                attack = Math.floor((this.energyAmount * 0.48) / BODYPART_COST[ATTACK]) || 1;
                attack = Math.min(attack, 20);  // Max attack to 20
                break;

            case 'defender':
                rangedAttack = 0;
                attack = 0;

                // Basic defender logic for lower levels
                if (this.room.level < 3) {
                    attack = 1;
                } else {
                    // For higher-level rooms, balance attack and rangedAttack
                    const energyForAttack = Math.floor((this.energyAmount * 0.45) / BODYPART_COST[ATTACK]);
                    const energyForRangedAttack = Math.floor((this.energyAmount * 0.45) / BODYPART_COST[RANGED_ATTACK]);

                    // Choose to balance between attack and ranged attack based on random chance and room level
                    if (Math.random() > 0.6 || this.level < 5) {
                        attack = energyForAttack || 1;
                    } else {
                        rangedAttack = energyForRangedAttack || 1;
                    }

                    // Cap the attack and rangedAttack to reasonable limits
                    attack = Math.min(attack, 32);  // Max attack to 32
                    rangedAttack = Math.min(rangedAttack, 32);  // Max rangedAttack to 32
                    halfMove = true;
                }

                break;

            case 'longbow':
                // Calculate the number of rangedAttack parts (max 17)
                rangedAttack = Math.floor((this.energyAmount * 0.7) / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) || 1;
                rangedAttack = Math.min(rangedAttack, 17);  // Cap rangedAttack to 17

                // Calculate the number of heal parts (max 8)
                heal = Math.floor((this.energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
                heal = Math.min(heal, 8);  // Cap heal to 8

                // Handle scaling down military creeps based on power
                if (this.creepInfo.other && this.creepInfo.other.power) {
                    let totalPower = (rangedAttack * RANGED_ATTACK_POWER) + (heal * HEAL_POWER);

                    // Check if the total power exceeds available power
                    if (totalPower > this.creepInfo.other.power) {
                        let ratio = this.creepInfo.other.power / totalPower;

                        // Scale down both rangedAttack and heal to fit within available power
                        rangedAttack = Math.ceil(rangedAttack * ratio);
                        heal = Math.ceil(heal * ratio);
                    }
                }

                break;

            case 'cleaner':
                work = Math.floor(this.energyAmount / (BODYPART_COST[WORK] + BODYPART_COST[MOVE])) || 1;
                work = Math.min(work, 25);  // Max work to 25
                break;

            case 'claimAttacker':
                claim = Math.floor((this.energyAmount * 0.50) / BODYPART_COST[CLAIM]) || 1;
                claim = Math.min(claim, 25);  // Max claim to 25
                break;

            case 'claimer':
                claim = 1;
                move = Math.floor(this.energyAmount - BODYPART_COST[CLAIM]) || 1;
                move = Math.min(move, 5);  // Max move to 5
                break;

            case 'reserver':
                energyScaling = true;

                // Calculate claim based on energy and the cost of CLAIM and MOVE parts
                claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
                claim = Math.min(claim, 20);  // Cap claim to 20 parts

                // If there are roads built in both the current room and the destination room
                if (INTEL[this.creepInfo.destination] && INTEL[this.creepInfo.destination].roadsBuilt && INTEL[this.room.name].roadsBuilt) {
                    // Reduce the cost of MOVE parts by 50% if roads are built
                    claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + (BODYPART_COST[MOVE] * 0.5))) || 1;
                    claim = Math.min(claim, 20);  // Cap claim to 20 parts
                    halfMove = true;  // Indicate that half of the normal move cost is being used
                }
                break;

            case 'remoteHarvester':
                // Base work calculation
                const workRatio = INTEL[this.creepInfo.destination].roadsBuilt ? 0.85 : 0.5;
                work = Math.floor((this.energyAmount * workRatio) / BODYPART_COST[WORK]) || 1;

                // Set source energy capacity for a reserved room, double it at level 8
                // DISABLED FOR NOW
                const SOURCE_CAPACITY = this.room.controller.level === 9 ? SOURCE_ENERGY_CAPACITY * 2 : SOURCE_ENERGY_CAPACITY;

                // SK-specific work adjustment
                if (INTEL[this.creepInfo.destination].sk && work > SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) {
                    work = Math.floor(SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 4;
                }
                // Reserved source work adjustment
                else if (INTEL[this.creepInfo.destination].reservation === MY_USERNAME &&
                    work > SOURCE_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME) + 1) {
                    work = Math.floor(SOURCE_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
                }
                // Neutral source work adjustment
                else if ((!INTEL[this.creepInfo.destination] || INTEL[this.creepInfo.destination].reservation !== MY_USERNAME) &&
                    work > SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME) + 1) {
                    work = Math.floor(SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + 1;
                }

                carry = 1;

                // Check for roads and halfMove setting
                if (INTEL[this.creepInfo.destination].roadsBuilt && INTEL[this.room.name].roadsBuilt) {
                    halfMove = true;
                }
                break;

            case 'remoteHauler':
                const assignedHarvester = Game.getObjectById(this.creepInfo.other.harvester);
                // Determine carry amount based off the harvesters work count and range
                const harvestAmount = assignedHarvester.getActiveBodyparts(WORK) * HARVEST_POWER;
                const range = JSON.parse(this.room.memory.remoteSources)[assignedHarvester.memory.other.source].score || 10;
                const expectedHarvestAmount = harvestAmount * (range * 2);
                const desiredCarry = Math.ceil(expectedHarvestAmount / CARRY_CAPACITY) || 1;
                let workCost = this.room.level < 4 ? 0 : BODYPART_COST[WORK];
                carry = Math.floor(((this.energyAmount - workCost) * 0.49) / BODYPART_COST[CARRY]) || 1;

                // Try to use the carry amount needed by the harvester
                carry = Math.min(carry, desiredCarry);

                // Work parts after level 3
                work = this.room.level >= 4 ? 1 : 0;

                // Set move if the assigned harvesters intel checks out
                if (INTEL[assignedHarvester.room.name].roadsBuilt && INTEL[this.room.name].roadsBuilt) {
                    halfMove = true;
                }

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
                carry = Math.floor((this.energyAmount * 0.5) / BODYPART_COST[CARRY]) || 1;
                carry = Math.min(carry, 25);
                break;
        }

        // Calculate energy multiplier
        let energyMulti = energyScaling && this.room.storage && this.room.totalEnergyState < 2 ? Math.max(0.05, this.room.totalEnergyState / 3) : 1;

        // Utility function to add body parts
        const addBodyParts = (count, part, array) => {
            let numParts = Math.ceil(count * energyMulti);
            if (part === MOVE) numParts = count; // Ensure move parts are added correctly
            if (numParts > 0) array.push(...Array(numParts).fill(part));
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
        return generatedBody;
    }

    // Utility function to calculate body cost
    bodyCost(body) {
        return body.reduce((cost, part) => cost + BODYPART_COST[part], 0);
    }
}

profiler.registerClass(ModuleBodyGenerator, 'BodyGenerator');
module.exports = ModuleBodyGenerator;
