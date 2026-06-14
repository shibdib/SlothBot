/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {findRoute, routeWithinClaimTTL} = require('pathRoute');


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

function countQueuedHaulersForSource(roomName, sourceId) {
    const queue = CREEP_QUEUES[roomName];
    if (!queue) return 0;
    let n = 0;
    for (const key in queue) {
        const entry = queue[key];
        if (entry.role === 'remoteHauler' && entry.other && entry.other.source === sourceId) n++;
    }
    return n;
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
        // net-negative â€” bodies pre-emptively shrink instead of reacting after the fact.
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
        if (this.creepInfo && this.creepInfo.other && this.creepInfo.other.reboot || this.room.myCreeps.length <= 3) {
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
                const leanColony = this.room.level >= 7 && !this.creepInfo.destination;
                halfMove = !this.creepInfo.destination
                    && !['roadBuilder', 'waller'].includes(this.role)
                    && INTEL[this.room.name].roadsBuilt;

                const workShare = halfMove ? (leanColony ? 0.45 : 0.40) : (leanColony ? 0.32 : 0.28);
                const carryShare = halfMove ? (leanColony ? 0.35 : 0.32) : (leanColony ? 0.25 : 0.22);
                const workCap = leanColony ? 33 : (halfMove ? 25 : 20);
                const carryCap = leanColony ? 25 : (halfMove ? 20 : 16);

                work = Math.min(Math.floor(this.energyAmount * workShare / BODYPART_COST[WORK]) || 1, workCap);
                carry = Math.min(Math.floor(this.energyAmount * carryShare / BODYPART_COST[CARRY]) || 1, carryCap);

                if (!this.room.energyState) {
                    work *= leanColony ? 0.25 : 0.15;
                    carry *= leanColony ? 0.1 : 0.05;
                } else if (this.role === 'roadBuilder' && this.room.energyState < 3) {
                    work *= 0.4;
                    carry *= 0.3;
                } else if (!leanColony && (this.room.energyState < 3 ||
                    (this.room.energyState === 3 && ['drone', 'waller'].includes(this.role)))) {
                    const scale = this.flowScale(0.3, 15);
                    work *= scale;
                    carry *= scale;
                } else if (leanColony && (this.room.energyState < 2 || this.trend < 0)) {
                    const scale = this.flowScale(0.5, 15);
                    work *= scale;
                    carry *= scale;
                }
                if (work < 1) work = 1;
                if (carry < 1) carry = 1;
                break;
            }

            case 'upgrader': {
                const hasLink = !!this.room.memory.controllerLink;
                const hasContainer = !!global.resolveControllerContainer(this.room);

                if (this.room.controller.level === 8 && this.room.energyState < 2) {
                    work = 1;
                    carry = 1;
                    move = 0;
                } else if (hasLink || hasContainer) {
                    // Stationary â€” sits on a container or beside the controller link, no moves.
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
                        } else {
                            work *= this.flowScale(0.5, 10);
                        }
                        if (this.room.energyState < 3 && this.upgraderDuty < 0.7) {
                            const dutyScale = Math.max(0.5, this.upgraderDuty + 0.15);
                            work *= dutyScale;
                        }
                        if (this.room.level === 8 && this.room.energyState >= 2) {
                            const stockpileCap = this.room.energyState >= 3 ? 5 : 10;
                            const spareCap = Math.max(3, Math.floor(this.spareIncome / 3));
                            work = Math.min(work, stockpileCap, spareCap);
                        }
                        work = this.room.level === 8 ? Math.min(work, 15) : Math.min(affordableWork, work);
                    }

                    work = Math.max(Math.min(work, 49), 1);
                    move = 0;
                } else {
                    // Mobile upgrader â€” no infrastructure yet, walks to and from the controller.
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
                const maxHaulerCarry = this.room.level >= 7 ? 25 : (this.room.level >= 6 ? this.room.level * 2 : this.room.level * 4);
                carry = Math.min(carry, maxHaulerCarry);
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
                    // Size to match source throughput: 10e/tick Ã— round-trip ticks / 50e per CARRY
                    carry = Math.max(4, Math.ceil(10 * 2 * (distToHub + 1) / BODYPART_COST[CARRY]));
                    // Cap to what the room can actually afford
                    carry = Math.min(carry, Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)));
                } else {
                    carry = Math.floor(this.energyAmount / (BODYPART_COST[CARRY] + moveCostPerCarry)) || 1;
                    const maxShuttleCarry = this.room.level >= 7 ? 25 : Math.max(10, this.room.level * 4);
                    carry = Math.min(carry, maxShuttleCarry);
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
                    // Oversize (+extra WORK for fast container/rampart repair + ext fill) only when the room
                    // can afford the larger body and the repair spend. This protects energy gain and spawn
                    // reliability in lean/flow-stressed rooms while preserving the CPU-save + self-maintain
                    // benefit when healthy. Saturate sources only when energyCapacity can fund it.
                    const isHealthy = (this.room.energyState >= 2 || this.spareIncome > 3 || this.trend >= 0);
                    const additionalWork = this.room.controller.level >= 7 ? (isHealthy ? 9 : 2) : 0;
                    const baseSaturation = Math.ceil(SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
                    // Handle power creep stuff
                    let powerCreep = _.find(Game.powerCreeps, c => c.my && c.memory.destinationRoom === this.room.name && c.powers[PWR_REGEN_SOURCE]);
                    if (powerCreep) {
                        const boostedSat = Math.floor((SOURCE_ENERGY_CAPACITY + (POWER_INFO[PWR_REGEN_SOURCE].effect[powerCreep.powers[PWR_REGEN_SOURCE].level - 1] * (ENERGY_REGEN_TIME / 15))) / (HARVEST_POWER * ENERGY_REGEN_TIME));
                        work = boostedSat + additionalWork;
                        // ensure at least the computed boosted need
                        work = Math.max(boostedSat, work);
                    } else {
                        work = Math.ceil(Math.min(work, baseSaturation)) + additionalWork;
                    }
                    work = Math.min(Math.max(baseSaturation, work), Math.max(1, Math.floor((this.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK])));
                    move = 0;
                } else {
                    work = Math.floor((this.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]) || 1;
                    move = 0;
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
                    heal = false;
                    if (this.creepInfo.misc && this.creepInfo.misc.boosts && this.creepInfo.misc.boosts.includes(TOUGH)) {
                        const desiredTough = this.checkForNeededTough(waitFor, true);
                        for (let t = desiredTough.count; t >= 0; t -= 2) {
                            toughData = t === desiredTough.count ? desiredTough : {boost: desiredTough.boost, count: t};
                            const toughModifier = toughData.boost ? toughMulti[toughData.boost] : 1;
                            heal = this.checkForNeededHeal(1, toughModifier, true, t);
                            if (heal) {
                                tough = t;
                                break;
                            }
                        }
                    } else {
                        heal = this.checkForNeededHeal(1, 1, true, 0);
                    }
                    if (!heal) return false;
                } else {
                    heal = Math.floor((this.energyAmount * 0.3) / (BODYPART_COST[HEAL] + BODYPART_COST[MOVE]));
                    heal = Math.min(heal, 6);
                }
                const toughEnergy = (tough || 0) * (BODYPART_COST[TOUGH] + BODYPART_COST[MOVE]);
                const remainingEnergy = this.energyAmount - ((heal * BODYPART_COST[HEAL]) + heal * BODYPART_COST[MOVE]) - toughEnergy;
                rangedAttack = Math.floor(remainingEnergy / (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE])) || 1;
                rangedAttack = Math.min(rangedAttack, getMaxSiegeCombatBudget() - heal - (tough || 0));

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
                // A "find unpaired healer â†’ spawn attacker" approach races
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
                    // Healer surplus â€” spawn the attacker that will pair with one.
                    if (this.creepInfo.misc && this.creepInfo.misc.boosts && this.creepInfo.misc.boosts.includes(TOUGH)) {
                        toughData = this.checkForNeededTough(2);
                        tough = toughData.count;
                    }
                    attack = Math.floor(this.energyAmount / (BODYPART_COST[ATTACK] + BODYPART_COST[MOVE])) || 1;
                    attack = Math.min(attack, getMaxSiegeCombatBudget() - (tough || 0));
                } else {
                    // No surplus healer (or attacker surplus) â€” spawn a healer.
                    if (Memory.targetRooms[this.creepInfo.destination] && Memory.targetRooms[this.creepInfo.destination].boosts) {
                        heal = false;
                        if (this.creepInfo.misc && this.creepInfo.misc.boosts && this.creepInfo.misc.boosts.includes(TOUGH)) {
                            const desiredTough = this.checkForNeededTough(2);
                            for (let t = desiredTough.count; t >= 0; t -= 2) {
                                toughData = t === desiredTough.count ? desiredTough : {boost: desiredTough.boost, count: t};
                                const toughModifier = toughData.boost ? toughMulti[toughData.boost] : 1;
                                heal = this.checkForNeededHeal(2, toughModifier, false, t);
                                if (heal) {
                                    tough = t;
                                    break;
                                }
                            }
                        } else {
                            heal = this.checkForNeededHeal(2, 1, false, 0);
                        }

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
                if (this.creepInfo?.destination &&
                    !routeWithinClaimTTL(this.room.name, this.creepInfo.destination, CREEP_CLAIM_LIFE_TIME - 10)) {
                    return false;
                }
                claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
                claim = Math.min(claim, 25);  // Max claim to 25
                break;

            case 'claimer':
                if (this.creepInfo?.destination &&
                    !routeWithinClaimTTL(this.room.name, this.creepInfo.destination, CREEP_CLAIM_LIFE_TIME - 10)) {
                    return false;
                }
                claim = 1;
                move = 2;
                break;

            case 'reserver':
                if (this.creepInfo?.destination &&
                    !routeWithinClaimTTL(this.room.name, this.creepInfo.destination, CREEP_CLAIM_LIFE_TIME - 10)) {
                    return false;
                }
                // Calculate claim based on energy and the cost of CLAIM and MOVE parts.
                claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + BODYPART_COST[MOVE])) || 1;
                claim = Math.min(claim, 2 * (this.room.energyState || 1));

                // Half-move only if every room on the route has roads â€” intermediate rooms count too.
            {
                const route = findRoute(this.room.name, this.creepInfo.destination, {shortest: true});
                const fullRouteHasRoads = route.length &&
                    INTEL[this.room.name] && INTEL[this.room.name].roadsBuilt &&
                    route.every(roomName => INTEL[roomName] && INTEL[roomName].roadsBuilt);
                if (fullRouteHasRoads) {
                    claim = Math.floor(this.energyAmount / (BODYPART_COST[CLAIM] + (BODYPART_COST[MOVE] * 0.5))) || 1;
                    claim = Math.min(claim, 5 * (this.room.energyState || 1));
                    halfMove = true;
                }
                }

                if (claim > CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][this.room.level] * 3) claim = CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][this.room.level] * 3;
                if (this.room.memory.remotePenalty) claim = Math.min(claim, 1);
                if (this.room.energyState < 3 || this.trend < 0) {
                    claim = Math.max(2, Math.floor(claim * this.flowScale(0.5, 10)));
                }
                claim = Math.max(claim, 2);
                break;

            case 'remoteHarvester': {
                const destIntel = INTEL[this.creepInfo.destination];
                let baseSaturation;
                if (destIntel && destIntel.sk) {
                    baseSaturation = Math.ceil(SOURCE_ENERGY_KEEPER_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
                } else if (destIntel && destIntel.reservation === MY_USERNAME) {
                    baseSaturation = Math.ceil(SOURCE_ENERGY_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
                } else {
                    baseSaturation = Math.ceil(SOURCE_ENERGY_NEUTRAL_CAPACITY / (HARVEST_POWER * ENERGY_REGEN_TIME));
                }
                // Extra WORK for container repair only when the colony can afford the spawn cost.
                const isHealthy = (this.room.energyState >= 2 || this.spareIncome > 3 || this.trend >= 0);
                const additionalWork = this.room.level >= 7 ? (isHealthy ? 2 : 0) : 0;
                work = baseSaturation + additionalWork;
                carry = 1;

                const route = Game.map.findRoute(this.room.name, this.creepInfo.destination);
                const fullRouteHasRoads = Array.isArray(route) &&
                    INTEL[this.room.name] && INTEL[this.room.name].roadsBuilt &&
                    route.every(step => INTEL[step.room] && INTEL[step.room].roadsBuilt);
                if (fullRouteHasRoads) halfMove = true;

                if (this.room.energyState < 3 || this.trend < 0) {
                    work = Math.max(1, Math.floor(work * this.flowScale(0.5, 10)));
                }

                const moveRatio = halfMove ? 0.5 : 1;
                const maxWork = Math.max(1, Math.floor((this.energyAmount - BODYPART_COST[CARRY]) / (BODYPART_COST[WORK] + BODYPART_COST[MOVE] * moveRatio)));
                work = Math.min(Math.max(baseSaturation, work), maxWork);
                break;
            }

            case 'remoteHauler': {
                const remoteRoomName = this.creepInfo.other.remoteRoom;
                if (!remoteRoomName) return false;
                const sourceId = this.creepInfo.other.source;
                const otherAssignedHaulers = getHaulersBySource()[sourceId] || [];
                const {haulerCarryCapacity} = require('spawnCounts');
                const currentHaulingCapacity = _.sum(otherAssignedHaulers, haulerCarryCapacity);

                work = this.room.level >= 7 ? 1 : 0;

                const route = Game.map.findRoute(this.room.name, remoteRoomName);
                const fullRouteHasRoads = Array.isArray(route) &&
                    INTEL[this.room.name].roadsBuilt &&
                    route.every(step => INTEL[step.room] && INTEL[step.room].roadsBuilt);

                const minCarryParts = this.room.level >= 7
                    ? (fullRouteHasRoads ? 12 : 8)
                    : Math.max(2, this.room.level * 2);
                const queuedHaulers = countQueuedHaulersForSource(this.room.name, sourceId);
                const queuedCapacity = queuedHaulers * minCarryParts * CARRY_CAPACITY;
                const harvestAmount = this.creepInfo.other.harvestAmount || 0;
                const carryDeficit = Math.max(0, harvestAmount - currentHaulingCapacity - queuedCapacity);
                const desiredCarry = carryDeficit > 0
                    ? Math.max(minCarryParts, Math.ceil(carryDeficit / CARRY_CAPACITY))
                    : minCarryParts;

                if (fullRouteHasRoads) {
                    carry = Math.floor((this.energyAmount - (work * BODYPART_COST[WORK])) / (BODYPART_COST[CARRY] + (BODYPART_COST[MOVE] * 0.5))) || 1;
                    halfMove = true;
                } else {
                    carry = Math.floor((this.energyAmount - (work * BODYPART_COST[WORK])) / (BODYPART_COST[CARRY] + BODYPART_COST[MOVE])) || 1;
                }

                carry = Math.min(carry, desiredCarry);

                if (this.room.energyState < 3 || this.trend < 0) {
                    carry = Math.max(minCarryParts, Math.floor(carry * this.flowScale(0.5, 10)));
                }

                const maxCarry = this.room.level < 7 ? this.room.level * 2 : 33;
                if (halfMove) {
                    if (carry + work > maxCarry) carry = maxCarry - work;
                } else if (carry + work > Math.min(maxCarry, 25)) {
                    carry = Math.min(maxCarry, 25) - work;
                }

                carry = Math.max(minCarryParts, carry);
                break;
            }

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

        // General safeguard for 50-part limit (max body size): limit non-move parts
        // (primarily work+carry from % allocations) so that MOVE parts (full 1:1 or halfMove 0.5)
        // can be added without the final slice(0,50) stripping mobility. This was exposed
        // by drone body carry boosts (to reduce "getting energy" time) + raised caps, which
        // at high energyCapacityAvailable (RCL8, E~12k+) produce w+c > what fits balanced under 50.
        // E.g. without cap: halfMove 25W+20C +23M =68 parts â†’ slice keeps ~45+5M (bad ratio).
        // halfMove is set by roles on roads; defaults to full moves.
        const approxNonMove = (work || 0) + (carry || 0) + (claim || 0) + (attack || 0) + (rangedAttack || 0);
        const willHaveMoves = (typeof move === 'undefined' || move !== 0);
        if (willHaveMoves && approxNonMove > 0) {
            const moveRatio = halfMove ? 0.5 : 1.0;
            const maxNonMove = Math.floor(50 / (1 + moveRatio));
            if (approxNonMove > maxNonMove) {
                const scale = maxNonMove / approxNonMove;
                if (work) work = Math.max(1, Math.floor(work * scale));
                if (carry) carry = Math.max(1, Math.floor(carry * scale));
                if (claim) claim = Math.max(1, Math.floor(claim * scale));
                if (attack) attack = Math.max(1, Math.floor(attack * scale));
                if (rangedAttack) rangedAttack = Math.max(1, Math.floor(rangedAttack * scale));
            }
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
        // Graceful trim: remove excess from the "work/carry" array (prefer WORK over CARRY for roles
        // that need carry like stationaryHarvester). Re-enforce min saturation for stationary after trim
        // so caller sees realistic min cost (and blocks spawn rather than producing sub-5 WORK miners).
        let i = 0;
        let currentCostBody = [...toughArray, ...moveArray, ...bodyArray, ...healArray];
        while (this.bodyCost(currentCostBody) > this.energyAmount && bodyArray.length > 1 && i < 50) {
            i++;
            // Prefer trimming WORK before the final CARRY for harvesters etc.
            if (bodyArray.length > 1 && bodyArray[bodyArray.length - 1] === CARRY && bodyArray.filter(p => p === WORK).length > 1) {
                // remove a WORK instead of the carry
                const wi = bodyArray.lastIndexOf(WORK);
                if (wi >= 0) bodyArray.splice(wi, 1);
                else bodyArray.pop();
            } else {
                bodyArray.pop();
            }
            currentCostBody = [...toughArray, ...moveArray, ...bodyArray, ...healArray];
        }
        // stationaryHarvester: cap WORK to what energyAmount can fund (downgraded rooms included).
        if (this.role === 'stationaryHarvester') {
            const maxHarvesterWork = Math.max(1, Math.floor((this.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]));
            const workCap = this.room.level < 2 ? 1 : maxHarvesterWork;
            let wCount = bodyArray.filter(p => p === WORK).length;
            while (wCount > workCap && bodyArray.length > 1) {
                const wi = bodyArray.lastIndexOf(WORK);
                if (wi < 0) break;
                bodyArray.splice(wi, 1);
                wCount--;
            }
        }

        // Assemble the final body
        let generatedBody;
        if (['SKAttacker', 'powerAttacker', 'claimer'].includes(this.role)) {
            generatedBody = [...toughArray, ...moveArray, ..._.shuffle(bodyArray), ...healArray];
        } else {
            generatedBody = [...toughArray, ..._.shuffle(bodyArray), ...moveArray, ...healArray];
        }

        // Ensure the body is valid, 50 parts max.
        // The general non-move cap (above) prevents unbalancing MOVE parts for roles
        // that compute work/carry via energy % (the recent drone carry boosts etc.);
        // this is final safety net (and trims for roles that intentionally compute high).
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


    checkForNeededHeal(exposureBodies = 1, toughModifier = 1, rangedParts = false, toughCount = 0) {
        const destination = this.creepInfo.destination;
        const intel = INTEL[destination];
        const targetMemory = Memory.targetRooms[destination];
        const damageToTank = getSiegeTowerDamage(intel);
        if (!damageToTank) {
            if (targetMemory) targetMemory.boostTier = undefined;
            return false;
        }

        const tiers = determineNeededHeals(damageToTank);
        const squadSize = Math.max(1, (this.creepInfo.misc && this.creepInfo.misc.waitFor) || 1);
        const MIN_RANGED_PARTS = rangedParts ? 5 : 0;
        const MAX_HEAL_PARTS = getMaxSiegeHealParts(toughCount, MIN_RANGED_PARTS);
        const reservedEnergy = MIN_RANGED_PARTS * (BODYPART_COST[RANGED_ATTACK] + BODYPART_COST[MOVE]);
        const energyPerHealPair = BODYPART_COST[HEAL] + BODYPART_COST[MOVE];
        const healToughFactor = Math.max(toughModifier, 0.85);

        const tierKeys = Object.keys(tiers);
        let chosen;
        let chosenHeals = 0;
        for (const key of tierKeys) {
            const tier = tiers[key];
            const rawHeals = Math.ceil(tier.amount * exposureBodies * healToughFactor);
            if (rawHeals > MAX_HEAL_PARTS) continue;
            const perCreepHeals = rawHeals;
            if (perCreepHeals < 1) continue;
            if (perCreepHeals * energyPerHealPair + reservedEnergy > this.energyAmount) continue;
            if (this.room.store(tier.boost) < 30 * perCreepHeals * squadSize) continue;
            chosen = tier;
            chosenHeals = perCreepHeals;
            break;
        }

        if (!chosen) {
            for (let i = tierKeys.length - 1; i >= 0; i--) {
                const tier = tiers[tierKeys[i]];
                const rawHeals = Math.ceil(tier.amount * exposureBodies * healToughFactor);
                if (rawHeals > MAX_HEAL_PARTS) continue;
                const perCreepHeals = rawHeals;
                if (perCreepHeals * energyPerHealPair + reservedEnergy > this.energyAmount) continue;
                if (this.room.store(tier.boost) < 30 * perCreepHeals * squadSize) continue;
                chosen = tier;
                chosenHeals = perCreepHeals;
                break;
            }
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

    checkForNeededTough(squadSize = 1, rangedCreep = false) {
        const destination = this.creepInfo.destination;
        const siegeDamage = getSiegeTowerDamage(INTEL[destination]);
        if (!siegeDamage) return {boost: undefined, count: 0};
        if (siegeDamage < 300) return {boost: undefined, count: 0};

        let partCount = siegeDamage >= 1000 ? 8 : (siegeDamage >= 600 ? 6 : 4);
        if (rangedCreep) partCount = Math.min(partCount, 6);
        const healReserve = rangedCreep ? 10 : 12;
        const rangedReserve = rangedCreep ? 5 : 0;
        partCount = Math.min(partCount, Math.max(0, getMaxSiegeCombatBudget() - healReserve - rangedReserve));

        for (const boost of BOOST_USE[TOUGH]) {
            if (this.room.store(boost) >= 30 * partCount * squadSize) {
                return {boost: boost, count: partCount};
            }
        }
        return {boost: undefined, count: 0};
    }
}

profiler.registerClass(ModuleBodyGenerator, 'BodyGenerator');
module.exports = ModuleBodyGenerator;

function getMaxSiegeCombatBudget() {
    return 25;
}

function getMaxSiegeHealParts(toughCount = 0, rangedParts = 0) {
    return Math.max(1, getMaxSiegeCombatBudget() - toughCount - rangedParts);
}

function getSiegeTowerDamage(intel) {
    if (!intel) return 0;
    const td = intel.towerData;
    let damage = 0;
    if (td) {
        damage = Math.max(td.maxDamage || 0, td.average || 0);
        damage = Math.ceil(damage * (td.operated ? 1.1 : 1.05));
    } else if (intel.towers) {
        damage = intel.towers * TOWER_POWER_ATTACK;
    }
    return damage;
}

module.exports.getSiegeTowerDamage = getSiegeTowerDamage;
module.exports.getMaxSiegeHealParts = getMaxSiegeHealParts;

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
