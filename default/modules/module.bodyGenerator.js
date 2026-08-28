/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {
    stableCreepInfoKey,
    maxBodyNonMoveParts,
    roomHasCriticalBuildSites,
    harvesterWorkCapUnlocked,
    roomInSpawnRecovery,
    recoverySpawnEnergy,
} = require('bodyHelpers');
const economic = require('bodyEconomic');
const remote = require('bodyRemote');
const military = require('bodyMilitary');
const siegeBoosts = require('bodySiegeBoosts');

let bodyCache = {};
let _bodyCacheTick = -1;

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
        this.trend = (ei && ei.trend) || 0;
        this.upgraderDuty = (ei && typeof ei.upgraderDuty === 'number') ? ei.upgraderDuty : 1.0;
    }

    flowScale(minScale = 0.3, budget = 15) {
        const projected = this.spareIncome + this.trend * 50;
        const effective = Math.min(this.spareIncome, projected);
        // Negative/zero spare must shrink consumers below the healthy minScale.
        // A 0.5–0.75 floor is why rooms stay net-negative for a full creep life.
        if (!(effective > 0)) return Math.max(0.1, minScale * 0.33);
        return Math.max(minScale, Math.min(1.0, effective / budget));
    }

    setEnergyAmount() {
        const operation = this.creepInfo && this.creepInfo.operation;
        if (roomInSpawnRecovery(this.room, this.creepInfo) && !operation) {
            this.energyAmount = recoverySpawnEnergy(this.room);
        } else if (!this.creepInfo || !this.creepInfo.military) {
            this.energyAmount = this.room.energyCapacityAvailable;
        }
    }

    getCacheKey() {
        const trendBucket = Math.round(this.trend);
        const dutyBucket = Math.round(this.upgraderDuty * 10);
        const reboot = this.creepInfo && this.creepInfo.other && this.creepInfo.other.reboot;
        const rebootString = reboot ? 'reboot' : '';
        const recoveryString = roomInSpawnRecovery(this.room, this.creepInfo) ? 'rec' : '';
        let bootstrapFlag = '';
        if (this.role === 'drone' && roomHasCriticalBuildSites(this.room)) bootstrapFlag = 'crit';
        else if (this.role === 'shuttle') {
            const other = this.creepInfo && this.creepInfo.other;
            if ((other && other.haulUrgent) || roomHasCriticalBuildSites(this.room)) bootstrapFlag = 'crit';
        }
        return `${this.energyAmount}.${this.role}.${this.spareIncome}.${trendBucket}.${dutyBucket}.${rebootString}.${recoveryString}.${bootstrapFlag}.${stableCreepInfoKey(this.creepInfo)}`;
    }

    buildRoleParts() {
        let result = economic.build(this.role, this);
        if (result !== undefined) return result;
        result = remote.build(this.role, this);
        if (result !== undefined) return result;
        result = military.build(this.role, this);
        if (result !== undefined) return result;
        return {};
    }

    generateBody() {
        if (_bodyCacheTick !== Game.time) {
            _bodyCacheTick = Game.time;
            bodyCache = {};
        }

        this.setEnergyAmount();

        const cacheKey = this.getCacheKey();
        if (bodyCache[cacheKey]) {
            const destBoosts = this.creepInfo && this.creepInfo.destination
                && Memory.targetRooms[this.creepInfo.destination]
                && Memory.targetRooms[this.creepInfo.destination].boosts;
            const listed = this.creepInfo && this.creepInfo.misc && this.creepInfo.misc.boosts;
            const mineralBody = destBoosts || (listed && (
                listed.includes(MOVE) || listed.includes(HEAL) || listed.includes(TOUGH)
            ));
            if (!mineralBody) {
                return {body: bodyCache[cacheKey], info: this.creepInfo};
            }
        }

        if (this.creepInfo && this.creepInfo.body) {
            if (this.bodyCost(this.creepInfo.body) <= this.energyAmount) {
                const body = this.creepInfo.body;
                const moves = body.filter(p => p === MOVE).length;
                const others = body.length - moves;
                const needsMoveBoost = moves > 0 && others > moves;
                const hasMoveBoost = this.creepInfo.neededBoosts && this.creepInfo.neededBoosts.moveBoost;
                if (!needsMoveBoost || hasMoveBoost) {
                    return {body, info: this.creepInfo};
                }
            }
        }

        const built = this.buildRoleParts();
        if (built === false) return false;

        let {
            work, claim, carry, move, tough, attack, rangedAttack, heal, halfMove, moveFactor,
        } = built;

        // Longbows kite off-road (swamps, dest interiors). halfMove is a road
        // assumption — MOVE boosts use moveFactor, never this flag.
        if (['longbow', 'longbowSquad', 'testSquad'].includes(this.role)) {
            halfMove = undefined;
        }
        const moveFatigue = (moveFactor && moveFactor > 1) ? moveFactor : 1;

        let bodyArray = [];

        const approxNonMove = (work || 0) + (carry || 0) + (claim || 0) + (attack || 0) + (rangedAttack || 0);
        const willHaveMoves = (typeof move === 'undefined' || move !== 0);
        if (willHaveMoves && approxNonMove > 0) {
            const maxNonMove = maxBodyNonMoveParts(halfMove, moveFatigue);
            if (approxNonMove > maxNonMove) {
                const scale = maxNonMove / approxNonMove;
                if (work) work = Math.max(1, Math.floor(work * scale));
                if (carry) carry = Math.max(1, Math.floor(carry * scale));
                if (claim) claim = Math.max(1, Math.floor(claim * scale));
                if (attack) attack = Math.max(1, Math.floor(attack * scale));
                if (rangedAttack) rangedAttack = Math.max(1, Math.floor(rangedAttack * scale));
            }
        }

        const addBodyParts = (count, part, array) => {
            count = Math.floor(count);
            if (count > 0) array.push(...Array(count).fill(part));
        };

        addBodyParts(work, WORK, bodyArray);
        addBodyParts(carry, CARRY, bodyArray);
        addBodyParts(claim, CLAIM, bodyArray);
        addBodyParts(rangedAttack, RANGED_ATTACK, bodyArray);
        addBodyParts(attack, ATTACK, bodyArray);

        const healArray = [];
        const toughArray = [];
        addBodyParts(heal, HEAL, healArray);
        addBodyParts(tough, TOUGH, toughArray);

        let moveArray = [];
        const autoMove = move !== 0 && !(move && move > 0);
        const rebuildMoves = () => {
            if (move === 0) {
                moveArray = [];
                return;
            }
            if (!autoMove) return;
            const nonMove = bodyArray.length + healArray.length + toughArray.length;
            const denom = moveFatigue > 1 ? moveFatigue : (halfMove ? 2 : 1);
            const moveParts = Math.ceil(nonMove / denom);
            moveArray = moveParts > 0 ? Array(moveParts).fill(MOVE) : [];
        };
        if (move !== 0) {
            if (!autoMove) {
                addBodyParts(move, MOVE, moveArray);
            } else {
                rebuildMoves();
            }
        }

        let i = 0;
        let currentCostBody = [...toughArray, ...moveArray, ...bodyArray, ...healArray];
        while (this.bodyCost(currentCostBody) > this.energyAmount && bodyArray.length > 1 && i < 50) {
            i++;
            if (bodyArray.length > 1 && bodyArray[bodyArray.length - 1] === CARRY && bodyArray.filter(p => p === WORK).length > 1) {
                const wi = bodyArray.lastIndexOf(WORK);
                if (wi >= 0) bodyArray.splice(wi, 1);
                else bodyArray.pop();
            } else {
                bodyArray.pop();
            }
            rebuildMoves();
            currentCostBody = [...toughArray, ...moveArray, ...bodyArray, ...healArray];
        }

        if (this.role === 'stationaryHarvester') {
            const maxHarvesterWork = Math.max(1, Math.floor((this.energyAmount - BODYPART_COST[CARRY]) / BODYPART_COST[WORK]));
            const workCap = harvesterWorkCapUnlocked(this.room) ? maxHarvesterWork : 1;
            let wCount = bodyArray.filter(p => p === WORK).length;
            while (wCount > workCap && bodyArray.length > 1) {
                const wi = bodyArray.lastIndexOf(WORK);
                if (wi < 0) break;
                bodyArray.splice(wi, 1);
                wCount--;
            }
        }

        let generatedBody;
        if (['SKAttacker', 'powerAttacker', 'claimer', 'claimAttacker'].includes(this.role)) {
            generatedBody = [...toughArray, ...moveArray, ..._.shuffle(bodyArray), ...healArray];
        } else {
            generatedBody = [...toughArray, ..._.shuffle(bodyArray), ...moveArray, ...healArray];
        }

        if (generatedBody.length > 50) {
            generatedBody = generatedBody.slice(0, 50);
        }

        bodyCache[cacheKey] = generatedBody;
        return {body: generatedBody, info: this.creepInfo};
    }

    bodyCost(body) {
        return body.reduce((cost, part) => cost + BODYPART_COST[part], 0);
    }

    checkForNeededHeal(exposureBodies, toughModifier, rangedParts, toughCount, moveFactor) {
        return siegeBoosts.checkForNeededHeal(this, exposureBodies, toughModifier, rangedParts, toughCount, moveFactor);
    }

    checkForNeededTough(squadSize, rangedCreep) {
        return siegeBoosts.checkForNeededTough(this, squadSize, rangedCreep);
    }
}

profiler.registerClass(ModuleBodyGenerator, 'BodyGenerator');
module.exports = ModuleBodyGenerator;

module.exports.getSiegeTowerDamage = siegeBoosts.getSiegeTowerDamage;
module.exports.getMaxSiegeHealParts = siegeBoosts.getMaxSiegeHealParts;