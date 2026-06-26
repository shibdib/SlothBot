/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {stableCreepInfoKey, maxBodyNonMoveParts} = require('bodyHelpers');
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
        return Math.max(minScale, Math.min(1.0, effective / budget));
    }

    setEnergyAmount() {
        if ((this.creepInfo && this.creepInfo.other && this.creepInfo.other.reboot) || this.room.myCreeps.length <= 3) {
            this.energyAmount = Math.max(this.room.energyAvailable, 300);
        } else if (!this.creepInfo || !this.creepInfo.military) {
            this.energyAmount = this.room.energyCapacityAvailable;
        }
    }

    getCacheKey() {
        const trendBucket = Math.round(this.trend);
        const dutyBucket = Math.round(this.upgraderDuty * 10);
        const reboot = this.creepInfo && this.creepInfo.other && this.creepInfo.other.reboot;
        const rebootString = reboot ? 'reboot' : '';
        return `${this.energyAmount}.${this.role}.${this.spareIncome}.${trendBucket}.${dutyBucket}.${rebootString}.${stableCreepInfoKey(this.creepInfo)}`;
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
            if (this.creepInfo && (!this.creepInfo.destination || !Memory.targetRooms[this.creepInfo.destination]
                || !Memory.targetRooms[this.creepInfo.destination].boosts)) {
                return {body: bodyCache[cacheKey], info: this.creepInfo};
            }
        }

        if (this.creepInfo && this.creepInfo.body) {
            return {body: this.creepInfo.body, info: this.creepInfo};
        }

        const built = this.buildRoleParts();
        if (built === false) return false;

        let {
            work, claim, carry, move, tough, attack, rangedAttack, heal, halfMove,
        } = built;

        let bodyArray = [];

        const approxNonMove = (work || 0) + (carry || 0) + (claim || 0) + (attack || 0) + (rangedAttack || 0);
        const willHaveMoves = (typeof move === 'undefined' || move !== 0);
        if (willHaveMoves && approxNonMove > 0) {
            const maxNonMove = maxBodyNonMoveParts(halfMove);
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
            currentCostBody = [...toughArray, ...moveArray, ...bodyArray, ...healArray];
        }

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

        let generatedBody;
        if (['SKAttacker', 'powerAttacker', 'claimer'].includes(this.role)) {
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

    checkForNeededHeal(exposureBodies, toughModifier, rangedParts, toughCount) {
        return siegeBoosts.checkForNeededHeal(this, exposureBodies, toughModifier, rangedParts, toughCount);
    }

    checkForNeededTough(squadSize, rangedCreep) {
        return siegeBoosts.checkForNeededTough(this, squadSize, rangedCreep);
    }
}

profiler.registerClass(ModuleBodyGenerator, 'BodyGenerator');
module.exports = ModuleBodyGenerator;

module.exports.getSiegeTowerDamage = siegeBoosts.getSiegeTowerDamage;
module.exports.getMaxSiegeHealParts = siegeBoosts.getMaxSiegeHealParts;