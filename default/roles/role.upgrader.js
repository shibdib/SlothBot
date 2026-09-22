/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
const {planUpgraderNeed} = require('bodyEconomic');
const {liveControllerLink, roomExpectsUpgradePad} = require('bodyHelpers');
const {pickLinkUpgradeStand, linkUpgradeStandPenalty, hasSharedSourceControllerLink} = require('planUtils');

const RETIRE_INTERVAL = 10;
const retireCache = {};
const retireBuiltAt = {};

function getUpgraderRetireState(room) {
    const cached = retireCache[room.name];
    const builtAt = retireBuiltAt[room.name] || 0;
    if (cached && (builtAt === Game.time || builtAt + RETIRE_INTERVAL > Game.time)) return cached;

    const energyInfo = room.energyInfo;
    const plan = planUpgraderNeed(room, {
        spareIncome: (energyInfo && energyInfo.spareIncome) || 0,
        trend: (energyInfo && energyInfo.trend) || 0,
    });
    const creeps = room.myCreeps || [];
    const pack = [];
    for (let i = 0; i < creeps.length; i++) {
        const c = creeps[i];
        if (!c || !c.memory || c.memory.role !== 'upgrader' || c.memory.recycling) continue;
        if (c.spawning || (c.ticksToLive || 1500) < 200) continue;
        pack.push(c);
    }
    const cull = {};
    if (pack.length > plan.count) {
        pack.sort((a, b) => {
            const dw = b.getActiveBodyparts(WORK) - a.getActiveBodyparts(WORK);
            if (dw) return dw;
            return (b.ticksToLive || 0) - (a.ticksToLive || 0);
        });
        for (let i = plan.count; i < pack.length; i++) cull[pack[i].id] = true;
    }
    const rcl = (room.controller && room.controller.level) || room.level || 0;
    const stored = (room.rawEnergy || 0) > 1000;
    const cap = room.energyCapacityAvailable || 0;
    const avail = room.energyAvailable || 0;
    const state = {
        cull,
        cullReboot: rcl < 8 && plan.maxWork >= 8 && ((room.energyState || 0) >= 1 || stored)
            && cap && avail >= cap * 0.85,
    };
    retireCache[room.name] = state;
    retireBuiltAt[room.name] = Game.time;
    return state;
}

class RoleUpgrader {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.container = global.resolveControllerContainer(this.room);
        this.link = liveControllerLink(this.room);
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        if (!this.creep.memory.other) this.creep.memory.other = {};
        const canStation = !!(this.link || this.container);
        const expectsPad = roomExpectsUpgradePad(this.room);
        const noMove = this.creep.memory.other.noMove || !this.creep.hasActiveBodyparts(MOVE);
        if (canStation && noMove) {
            this.stationaryUpgrading();
        } else if (!canStation && expectsPad) {
            // Pad is down. Do not haul as a moving upgrader — drones rebuild
            // the container/link and cover downgrade. Recycle this slot.
            this.retireForPadRebuild();
        } else if (!canStation && noMove) {
            this.creep.recycleCreep();
        } else {
            this.mobileUpgrading();
        }
    }

    housekeeping() {
        // Retire before boost so a surplus body does not eat minerals and then suicide.
        if (this.shouldRetire()) {
            if (!this.creep.hasActiveBodyparts(MOVE)) this.creep.suicide();
            else this.creep.recycleCreep();
            return true;
        }
        if (this.creep.tryToBoost()) return true;
        return false;
    }

    shouldRetire() {
        if (this.creep.spawning) return false;
        if ((this.creep.ticksToLive || 1500) < 200) return false;
        const state = getUpgraderRetireState(this.room);
        if (state.cull[this.creep.id]) return true;
        // Reboot leftovers (2–3W) only. Flow-scaled bodies must not suicide.
        return !!(state.cullReboot && this.creep.getActiveBodyparts(WORK) <= 4);
    }

    retireForPadRebuild() {
        if (this.creep.store[RESOURCE_ENERGY] > 0 && this.creep.pos.getRangeTo(this.room.controller) <= 3) {
            this.creep.upgradeController(this.room.controller);
        }
        if (!this.creep.hasActiveBodyparts(MOVE)) this.creep.suicide();
        else this.creep.recycleCreep();
    }

    stationaryUpgrading() {
        if (!this.container && !this.link) {
            return this.retireForPadRebuild();
        }
        this.creep.memory.other.stationary = true;
        this.creep.memory.other.noMove = true;
        // Handle getting in place. Re-pick immediately when parked on the
        // harvest pad / hub-access tile of a shared controller/source link.
        const blockingStand = this.link && linkUpgradeStandPenalty(this.room, this.creep.pos) <= -40;
        if (!this.creep.memory.inPosition || Game.time % 100 === 0 || blockingStand) {
            if (!this.link && this.container) {
                if (this.creep.pos.isEqualTo(this.container.pos) || this.creep.pos.isNearTo(this.container)) this.creep.memory.inPosition = true;
                else return this.creep.shibMove(this.container, {range: 0});
            } else if (this.link && (!this.container || hasSharedSourceControllerLink(this.room))) {
                const targetPos = this.findLinkUpgradePosition();
                if (targetPos && this.creep.pos.isEqualTo(targetPos)) this.creep.memory.inPosition = true;
                else if (targetPos) {
                    const occ = targetPos.checkForCreep && targetPos.checkForCreep();
                    const handoff = occ && (occ.id === this.creep.memory.towCreep
                        || (occ.memory && occ.memory.trailer === this.creep.id));
                    if (occ && !handoff && occ.id !== this.creep.id && this.creep.pos.isNearTo(targetPos)
                        && this.creep.pos.getRangeTo(this.room.controller) <= 3) {
                        this.creep.memory.inPosition = true;
                    } else return this.creep.shibMove(targetPos, {range: 0});
                }
                else if (this.creep.pos.isNearTo(this.link) && this.creep.pos.getRangeTo(this.room.controller) <= 3
                    && !blockingStand) this.creep.memory.inPosition = true;
                else return this.creep.shibMove(this.link, {range: 1});
            } else if (this.container && this.link) {
                if (this.creep.pos.isEqualTo(this.container.pos) || this.creep.pos.isNearTo(this.link)) this.creep.memory.inPosition = true;
                else if (!this.container.pos.checkForCreep()) return this.creep.shibMove(this.container, {range: 0});
                else return this.creep.shibMove([this.container, this.link], {range: 1});
            }
        }

        const result = this.creep.upgradeController(this.room.controller);
        if (result === OK) {
            this.withdraw();
        } else if (result === ERR_NOT_IN_RANGE) {
            this.creep.shibMove(this.room.controller, {range: 3});
        } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
            this.withdraw();
        }
    }

    mobileUpgrading() {
        if (this.creep.store[RESOURCE_ENERGY] > 0) {
            const result = this.creep.upgradeController(this.room.controller);
            if (result === OK) {
                this.creep.memory.other.stationary = true;
            } else if (result === ERR_NOT_IN_RANGE) {
                this.creep.shibMove(this.room.controller, {range: 3});
            } else if (result === ERR_NOT_ENOUGH_RESOURCES) {
                this.creep.memory.other.stationary = undefined;
                this.withdraw();
            }
        } else if (this.creep.memory.energyDestination || this.creep.locateEnergy()) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource();
        } else if (this.container && this.container.store && this.container.store[RESOURCE_ENERGY] > 0) {
            this.creep.memory.other.stationary = undefined;
            this.creep.withdrawResource(this.container);
        } else {
            this.creep.memory.other.stationary = undefined;
            this.creep.idleFor(5);
        }
    }

    findLinkUpgradePosition() {
        const taken = {};
        for (const c of this.room.myCreeps) {
            if (c.id !== this.creep.id && c.memory.role === 'upgrader' && c.memory.linkUpgradePos) {
                const p = c.memory.linkUpgradePos;
                taken[`${p.x}_${p.y}`] = true;
            }
        }
        const picked = pickLinkUpgradeStand(this.room, this.link, taken);
        if (picked) {
            this.creep.memory.linkUpgradePos = {x: picked.x, y: picked.y, roomName: picked.roomName};
            return picked;
        }
        this.creep.memory.linkUpgradePos = undefined;
        return undefined;
    }

    withdraw() {
        if (this.link && this.link.store && this.creep.pos.isNearTo(this.link) && this.link.store[RESOURCE_ENERGY] > 0) {
            return this.creep.withdraw(this.link, RESOURCE_ENERGY);
        } else if (this.container && this.container.store && this.creep.pos.isNearTo(this.container) && this.container.store[RESOURCE_ENERGY] > 0) {
            return this.creep.withdraw(this.container, RESOURCE_ENERGY);
        } else if (this.room.level < 4 && Game.time % 10 === 0) {
            const nearbyUpgrader = this.creep.pos.findInRange(this.room.myCreeps, 1, {filter: c => c.id !== this.creep.id && c.memory.role === 'upgrader' && c.store[RESOURCE_ENERGY] > 0})[0];
            if (nearbyUpgrader) {
                return nearbyUpgrader.transfer(this.creep, RESOURCE_ENERGY);
            }
        }
    }
}

profiler.registerClass(RoleUpgrader, 'Upgrader');
module.exports = RoleUpgrader;