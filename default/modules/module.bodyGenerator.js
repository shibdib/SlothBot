/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");


let bodyCache = {};
let _haulerCacheTick = -1;
let _haulersBySource = {};
const toughMulti = {"GO": 0.75, "GHO2": 0.55, "XGHO2": 0.35}

function getHaulersBySource() {
    if (_haulerCacheTick === Game.time) return _haulersBySource;
    _haulerCacheTick = Game.time;
    _haulersBySource = {};
    for (const name in Game.creeps) {
        const c = Game.creeps[name];
        if (c.my && c.memory.role === 'remoteHauler' && c.memory.other && c.memory.other.source) {
            const sid = c.memory.other.source;
            if (!_haulersBySource[sid]) _haulersBySource[sid] = [];
            _haulersBySource[sid].push(c);
        }
    }
    return _haulersBySource;
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
        const ei = this.room.memory.energyInfo;
        this.spareIncome = (ei && ei.spareIncome) || 0;
        // Per-tick slope of colony spareIncome. Negative means we're trending toward
        // net-negative — bodies pre-emptively shrink instead of reacting after the fact.
        this.trend = (ei && ei.trend) || 0;
        // Upgrader-only: actual upgrade-energy / theoretical WORK output, [0..1].
        // < 1 means body is oversized for the link feed; anti-waste shrink in the upgrader case.
        this.upgraderDuty = (ei && typeof ei.upgraderDuty === 'number') ? ei.upgraderDuty : 1.0;
    }

    flowScale(minScale = 0.3, budget = 15) {
        const projected = this.spareIncome + this.trend * 50;
        const effective = Math.min(this.spareIncome, projected);
        return Math.max(minScale, Math.min(1.0, effective / budget));
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
        // Round trend/duty so small jitter doesn't invalidate the cache every tick.
        const trendBucket = Math.round(this.trend);
        const dutyBucket = Math.round(this.upgraderDuty * 10);
        return `${this.energyAmount}.${this.role}.${this.spareIncome}.${trendBucket}.${dutyBucket}.${JSON.stringify(this.creepInfo)}`;
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
        let work, claim, carry, move, tough, attack, rangedAttack, heal, halfMove, toughData;

        // Generate body parts based on role
        switch (this.role) {
            case 'explorer':
            case 'scout':
            case 'test':
                move = 1;
                break;

            case 'roadBuilder':
            case 'drone':
            case 'waller': {
                halfMove = !this.creepInfo.destination
                    && !['roadBuilder', 'waller'].includes(this.role)
                    && INTEL[this.room.name].roadsBuilt;

                if (halfMove) {
                    work = Math.min(Math.floor(this.energyAmount * 0.51 / BODYPART_COST[WORK]) || 1, 20);
                    carry = Math.min(Math.floor(this.energyAmount * 0.23 / BODYPART_COST[CARRY]) || 1, 12);
                } else {
                    work = Math.min(Math.floor(this.energyAmount * 0.35 / BODYPART_COST[WORK]) || 1, 15);
                    carry = Math.min(Math.floor(this.energyAmount * 0.15 / BODYPART_COST[CARRY]) || 1, 10);
                }
                if (!this.room.energyState) {
                    work *= 0.15;
                    carry *= 0.05;
                } else if (this.role === 'roadBuilder' && this.room.energyState < 3) {
                    work *= 0.4;
                    carry *= 0.3;
                } else if (this.room.energyState < 3 ||
                    (this.room.energyState === 3 && ['drone', 'waller'].includes(this.role))) {
                    const scale = this.flowScale(0.3, 15);
                    work *= scale;
                    carry *= scale;
                }
                if (work < 1) work = 1;
                if (carry < 1) carry = 1;
                break;
            }

            case 'upgrader': {
                const hasLink = !!this.room.memory.controllerLink;
                const hasContainer = !!this.room.memory.controllerContainer;

                if (this.room.controller.level === 8 && this.room.energyState < 2) {
                    work = 1;
                } else if (hasLink || hasContainer) {
                    // Stationary — sits on a container or beside the controller link, no moves.
                    carry = hasLink ? 4 : 1;
                    const affordableWork = Math.floor((this.energyAmount - (BODYPART_COST[CARRY] * carry)) / BODYPART_COST[WORK]) || 1;
                    work = affordableWork;

                    if (hasLink && this.level >= 5) {
                        const controllerLink = Game.getObjectById(this.room.memory.controllerLink);
                        const sourceLinks = controllerLink ? this.room.links
                                .filter(s => s.id !== this.room.memory.controllerLink &&
                                    (this.room.energyState >= 2 || s.id !== this.room.memory.hubLink))
                                .sort((a, b) => a.pos.getRangeTo(controllerLink) - b.pos.getRangeTo(controllerLink))
                            : [];

                        if (sourceLinks.length > 0) {
                            const sourceRate = SOURCE_ENERGY_CAPACITY / ENERGY_REGEN_TIME; // 10/tick per source
                            work = Math.floor(sourceRate * sourceLinks.length * (1 - LINK_LOSS_RATIO)) + 1;
                        }
                        if (!this.room.energyState) {
                            work *= 0.15;
                        } else if (this.room.energyState < 3) {
                            work *= this.flowScale(0.75, 12);
                        }
                        if (this.room.energyState < 3 && this.upgraderDuty < 0.7) {
                            const dutyScale = Math.max(0.5, this.upgraderDuty + 0.15);
                            work *= dutyScale;
                        }
                        work = this.room.level === 8 ? Math.min(work, 15) : Math.min(affordableWork, work);
                    }

                    work = Math.max(Math.min(work, 49), 1);
                    move = 0;
                } else {
                    // Mobile upgrader — no infrastructure yet, walks to and from the controller.
                    work = Math.min(Math.floor(this.energyAmount * 0.4 / BODYPART_COST[WORK]) || 1, 15);
                    carry = Math.min(Math.floor(this.energyAmount * 0.1 / BODYPART_COST[CARRY]) || 1, 10);
                    if (INTEL[this.room.name].roadsBuilt) halfMove = true;
                }

                if (work < 1) work = 1;
                if (carry < 1) carry = 1;
                break;
            }

            case 'labTech':
                carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
                carry = Math.min(carry, 20);

                if (INTEL[this.room.name].roadsBuilt) halfMove = true;
                break;

            case 'hauler': {
                const roadsBuilt = INTEL[this.room.name].roadsBuilt && !this.room.memory.dynamicLayout;
                carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + (roadsBuilt ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE]))) || 1;
                carry = Math.min(carry, this.room.level >= 6 ? this.room.level * 2 : this.room.level * 4); // Scale with room level, halved at RCL6+ for dual hauler coverage
                if (!this.room.energyState) {
                    carry = Math.max(1, Math.floor(carry * 0.25));
                } else if (this.room.energyState < 3 || this.trend < 0) {
                    carry = Math.max(1, Math.floor(carry * this.flowScale(0.5, 10)));
                }

                if (roadsBuilt) halfMove = true;
                break;
            }

            case 'shuttle': {
                const roadsBuilt = INTEL[this.room.name].roadsBuilt && !this.room.memory.dynamicLayout;
                const moveCostPerCarry = roadsBuilt ? BODYPART_COST[MOVE] * 0.5 : BODYPART_COST[MOVE];
                const distToHub = this.creepInfo && this.creepInfo.other && this.creepInfo.other.distanceToHub;
                if (distToHub) {
                    // Size to match source throughput: 10e/tick × round-trip ticks / 50e per CARRY
                    carry = Math.max(4, Math.ceil(10 * 2 * (distToHub + 1) / BODYPART_COST[CARRY]));
                    // Cap to what the room can actually afford
                    carry = Math.min(carry, Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)));
                } else {
                    carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)) || 1;
                    carry = Math.min(carry, Math.max(10, this.room.level * 4));
                }
                if (!this.room.energyState) {
                    carry = Math.max(1, Math.floor(carry * 0.25));
                } else if (this.room.energyState < 3 || this.trend < 0) {
                    carry = Math.max(1, Math.floor(carry * this.flowScale(0.5, 10)));
                }
                if (roadsBuilt) halfMove = true;
                break;
            }

            case 'stationaryHarvester':
                if (this.room.level >= 2) {
                    work = Math.floor((this.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]) || 1;
                    const additionalWork = this.room.controller.level >= 7 ? 9 : 0;
                    // Handle power creep stuff
                    let powerCreep = _.find(Game.powerCreeps, c => c.my && c.memory.destinationRoom === this.room.name && c.powers[PWR_REGEN_SOURCE]);
                    if (powerCreep) {
                        work = Math.floor((SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME)) + additionalWork;
                    } else {
                        work = Math.ceil(Math.min(work, (SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)))) + additionalWork;
                    }
                    move = 0;
                } else {
                    work = 1;
                }
                carry = 1;
                break;


            case 'mineralHarvester':
                work = Math.floor(this.energyAmount / BODYPART_COST[WORK]) || 1;
                work = Math.min(work, 50);  // Max work to 50
                if (!this.room.energyState) {
                    work *= 0.15;
                } else if (this.room.energyState === 1) {
                    work *= 0.3;
                }
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
                    if (this.creepInfo.misc && this.creepInfo.misc.boosts && this.creepInfo.misc.boosts.includes(TOUGH)) {
                        tough = this.checkForNeededTough(waitFor);
                        tough = toughData.count;
                    }
                    const toughModifier = toughData && toughData.boost ? toughMulti[toughData.boost] : 1;
                    heal = this.checkForNeededHeal(waitFor, toughModifier, true);
                    if (!heal) return false;
                } else {
                    heal = Math.floor((this.energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
                    heal = Math.min(heal, 6);
                }
                const toughEnergy = (tough || 0) * (BODYPART_COST[TOUGH] + BODYPART_COST[MOVE]);
                const remainingEnergy = this.energyAmount - ((heal * BODYPART_COST[HEAL]) + heal * BODYPART_COST[MOVE]) - toughEnergy;
                rangedAttack = Math.floor(remainingEnergy / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) || 1;
                rangedAttack = Math.min(rangedAttack, 25 - heal - (tough || 0));

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

            case 'siegeDuo': {
                // Balance the queue by counting unpaired creeps on BOTH sides
                // for this destination, then spawn whichever role is short.
                // A "find unpaired healer → spawn attacker" approach races
                // against the stale-partner clear window: role.siegeDuo
                // housekeeping clears dead-partner refs, but it runs in
                // militaryCreepManager (after colonyManager's spawn pass), so
                // consecutive bodyGenerator calls would otherwise see the
                // same orphaned creep and double-spawn its counterpart.
                // Counting both sides keeps in-flight creeps accounted for
                // regardless of stale refs.
                const dest = this.creepInfo.destination;
                let unpairedHealers = 0;
                let unpairedAttackers = 0;
                for (const name in Game.creeps) {
                    const c = Game.creeps[name];
                    if (!c.my || c.memory.role !== 'siegeDuo' || c.memory.destination !== dest) continue;
                    if (c.memory.partner && Game.getObjectById(c.memory.partner)) continue;
                    if (c.hasActiveBodyparts(ATTACK)) unpairedAttackers++;
                    else if (c.hasActiveBodyparts(HEAL)) unpairedHealers++;
                }

                if (unpairedHealers > unpairedAttackers) {
                    // Healer surplus — spawn the attacker that will pair with one.
                    if (this.creepInfo.misc && this.creepInfo.misc.boosts && this.creepInfo.misc.boosts.includes(TOUGH)) {
                        toughData = this.checkForNeededTough(2);
                        tough = toughData.count;
                    }
                    attack = Math.floor(this.energyAmount / (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) || 1;
                    attack = Math.min(attack, 25);
                    attack -= tough || 0;
                } else {
                    // No surplus healer (or attacker surplus) — spawn a healer.
                    if (Memory.targetRooms[this.creepInfo.destination] && Memory.targetRooms[this.creepInfo.destination].boosts) {
                        if (this.creepInfo.misc && this.creepInfo.misc.boosts && this.creepInfo.misc.boosts.includes(TOUGH)) {
                            toughData = this.checkForNeededTough(2);
                            tough = toughData.count;
                        }
                        const toughModifier = toughData && toughData.boost ? toughMulti[toughData.boost] : 1;
                        heal = Math.ceil(this.checkForNeededHeal(1, toughModifier));
                        if (this.room.name === 'E43S22') console.log(`SiegeDuo ${this.creepInfo.name} checking for heal, got ${heal} with modifier ${toughModifier} and tough ${tough}`);
                        if (!heal) return false;
                    } else {
                        heal = Math.floor((this.energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
                        heal = Math.min(heal, 6);
                    }
                }
                break;
            }

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
                claim = Math.min(claim, 2 * (this.room.energyState || 1));

                // Half-move only if every room on the route has roads — intermediate rooms count too.
            {
                const route = Game.map.findRoute(this.room.name, this.creepInfo.destination);
                const fullRouteHasRoads = Array.isArray(route) &&
                    INTEL[this.room.name] && INTEL[this.room.name].roadsBuilt &&
                    route.every(step => INTEL[step.room] && INTEL[step.room].roadsBuilt);
                if (fullRouteHasRoads) {
                    claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + (BODYPART_COST[MOVE] * 0.5))) || 1;
                    claim = Math.min(claim, 5 * (this.room.energyState || 1));
                    halfMove = true;
                }
                }

                if (claim > CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][this.room.level] * 3) claim = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][this.room.level] * 3;
                if (this.room.memory.remotePenalty) claim = Math.min(claim, 1);
                if (this.room.energyState < 3 || this.trend < 0) {
                    claim = Math.max(1, Math.floor(claim * this.flowScale(0.5, 10)));
                }
                break;

            case 'remoteHarvester':
                // Set source energy capacity for a reserved room, double it at level 7 for CPU
                const SOURCE_CAPACITY = this.room.controller.level >= 7 ? SOURCE_ENERGY_CAPACITY : SOURCE_ENERGY_CAPACITY;
                const additionalWork = this.room.controller.level >= 7 ? 9 : 1;
                if (INTEL[this.creepInfo.destination] && INTEL[this.creepInfo.destination].sk) {
                    work = Math.ceil(SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + additionalWork;
                } else if (INTEL[this.creepInfo.destination] && INTEL[this.creepInfo.destination].reservation === MY_USERNAME) {
                    work = Math.ceil(SOURCE_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + additionalWork;
                } else {
                    work = Math.ceil(SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME)) + additionalWork;
                }
                carry = 1;
                if (this.room.energyState < 3 || this.trend < 0) {
                    work = Math.max(1, Math.floor(work * this.flowScale(0.5, 10)));
                }

                // Half-move only if every room on the route has roads — intermediate rooms count too.
            {
                const route = Game.map.findRoute(this.room.name, this.creepInfo.destination);
                const fullRouteHasRoads = Array.isArray(route) &&
                    INTEL[this.room.name] && INTEL[this.room.name].roadsBuilt &&
                    route.every(step => INTEL[step.room] && INTEL[step.room].roadsBuilt);
                if (fullRouteHasRoads) halfMove = true;
            }
                break;

            case 'remoteHauler':
                const remoteRoomName = this.creepInfo.other.remoteRoom;
                if (!remoteRoomName) return false;
                const otherAssignedHaulers = getHaulersBySource()[this.creepInfo.other.source] || [];
                const currentHaulingCapacity = _.sum(otherAssignedHaulers, c => c.getActiveBodyparts(CARRY) * 50);
                const harvestRate = this.creepInfo.other.harvestAmount - currentHaulingCapacity;
                const desiredCarry = Math.ceil(harvestRate / CARRY_CAPACITY) || 1;

                // Work parts after level 7
                work = this.room.level >= 7 ? 1 : 0;

                // Half-move only if every room on the route (including intermediate rooms) has roads.
                // Checking just home+destination misses rooms in between that the hauler must cross.
                const route = Game.map.findRoute(this.room.name, remoteRoomName);
                const fullRouteHasRoads = Array.isArray(route) &&
                    INTEL[this.room.name].roadsBuilt &&
                    route.every(step => INTEL[step.room] && INTEL[step.room].roadsBuilt);
                if (fullRouteHasRoads) {
                    carry = Math.floor((this.energyAmount - (work * BODYPART_COST[WORK])) / (BODYPART_COST[CARRY] + (BODYPART_COST[MOVE] * 0.5))) || 1;
                    halfMove = true;
                } else {
                    carry = Math.floor((this.energyAmount - (work * BODYPART_COST[WORK])) / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
                }

                // Limit carry to what is actually needed
                carry = Math.min(carry, desiredCarry);

                if (this.room.energyState < 3 || this.trend < 0) {
                    carry = Math.max(1, Math.floor(carry * this.flowScale(0.5, 10)));
                }

                // Pre-RCL7 rooms have 1 spawn — cap hauler size so it doesn't block the queue.
                // Smaller haulers spawn faster and multiple will be queued to cover the deficit.
                const maxCarry = this.room.level < 7 ? this.room.level * 2 : 33;
                if (halfMove) {
                    if (carry + work > maxCarry) carry = maxCarry - work;
                } else if (carry + work > Math.min(maxCarry, 25)) {
                    carry = Math.min(maxCarry, 25) - work;
                }

                break;

            case 'SKMineral':
            case 'commodityMiner':
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

    checkForNeededHeal(multiplier = 1, toughModifier = 1, rangedParts = false) {
        const destination = this.creepInfo.destination;
        const towerData = INTEL[destination] && INTEL[destination].towerData;
        const targetMemory = Memory.targetRooms[destination];
        if (!towerData || !towerData.average) {
            if (targetMemory) targetMemory.boostTier = undefined;
            return false;
        }

        const damageToTank = Math.round(towerData.average);
        const tiers = determineNeededHeals(damageToTank);
        const squadSize = Math.max(1, Math.round(1 / multiplier));
        const MAX_HEAL_PARTS = rangedParts ? 20 : 25;
        const MIN_RANGED_PARTS = rangedParts ? 5 : 0;
        const reservedEnergy = MIN_RANGED_PARTS * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]);
        const energyPerHealPair = BODYPART_COST[HEAL] + BODYPART_COST[MOVE];

        const tierKeys = Object.keys(tiers);
        let chosen;
        let chosenHeals = 0;
        for (const key of tierKeys) {
            const tier = tiers[key];
            const perCreepHeals = Math.ceil(Math.ceil(tier.amount * multiplier) * toughModifier);
            if (perCreepHeals > MAX_HEAL_PARTS) continue;
            if (perCreepHeals * energyPerHealPair + reservedEnergy > this.energyAmount) continue;
            if (this.room.store(tier.boost) < 30 * perCreepHeals * squadSize) continue;
            chosen = tier;
            chosenHeals = perCreepHeals;
            break;
        }

        if (!chosen) {
            if (targetMemory) targetMemory.boostTier = undefined;
            return false;
        }

        targetMemory.boostTier = chosen.tier;
        this.creepInfo.neededBoosts = {
            boostPart: HEAL,
            boost: chosen.boost,
            boostTier: chosen.tier,
            amount: chosenHeals
        };
        return chosenHeals;
    }

    // Sizes a TOUGH buffer for siege creeps. Returns part count to add to the
    // body, scaled by tower damage; 0 when damage is low enough that heal-only
    // is more efficient, or when no tough boost is available in storage. The
    // boost itself is picked at runtime by tryToBoost (via misc.boosts) — we
    // only verify here that *some* tier is in stock so we don't allocate parts
    // that'll go unboosted and just bloat the body.
    checkForNeededTough(squadSize = 1) {
        const destination = this.creepInfo.destination;
        const towerData = INTEL[destination] && INTEL[destination].towerData;
        if (!towerData || !towerData.average) return {boost: undefined, count: 0};
        // Below this threshold heal alone tanks efficiently; tough body slots
        // are better spent on ranged_attack.
        if (towerData.average < 300) return {boost: undefined, count: 0};

        // Buffer scales modestly with damage. Capped so tough never crowds out
        // ranged_attack — 8 tough + ~13 heal still leaves room for ~25 ranged
        // in a 50-part body with boosted MOVE.
        const partCount = towerData.average >= 1000 ? 8 : (towerData.average >= 600 ? 6 : 4);

        // Require at least one tier of TOUGH boost in stock for the whole squad.
        // tryToBoost will pick whichever tier is available at apply-time.
        for (const boost of BOOST_USE[TOUGH]) {
            if (this.room.store(boost) >= 30 * partCount * squadSize) {
                return {boost: boost, count: partCount};
            }
        }
        return 0;
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
