/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleLongbowDuo {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        // If partner set
        if (this.creep.memory.partner) {
            if (this.creep.memory.leader) {
                this.handleLeader();
            } else {
                this.handleFollower();
            }
        } else {
            this.handleSolo();
        }
    }

    housekeeping() {
        // Boosting
        if (this.creep.tryToBoost([RANGED_ATTACK, HEAL])) return true;
        // Blinky mode
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            this.creep.healInRange(true);
        } else {
            this.creep.healInRange();
        }
        // Check and set partner
        if (!this.creep.memory.partner || !Game.getObjectById(this.creep.memory.partner)) {
            const availablePartner = _.find(Game.creeps, (c) => c.id !== this.creep.id && c.my && !c.spawning && c.memory.role === this.creep.memory.role && !c.memory.partner && c.memory.destination === this.creep.memory.destination);
            if (availablePartner) {
                this.creep.memory.leader = true;
                this.creep.memory.partner = availablePartner.id;
                availablePartner.memory.partner = this.creep.id;
            } else {
                this.creep.memory.leader = undefined;
                this.creep.memory.partner = undefined;
            }
        }
    }

    handleLeader() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        if (!this.creep.pos.isNearTo(partner)) {
            if (partner.room.name === this.room.name) this.creep.shibMove(partner); else this.handleSolo();
        } else {
            if (this.creep.memory.operation) {
                this.operationManagement();
            } else if (this.creep.memory.destination) {
                this.destinationManagement();
            }
        }
    }

    handleFollower() {
        const partner = Game.getObjectById(this.creep.memory.partner);
        this.creep.shibMove(partner, {range: 0});
        if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
            const partnerTarget = Game.getObjectById(partner.memory.target);
            if (partnerTarget && this.creep.pos.getRangeTo(partnerTarget) <= 3) {
                this.creep.rangedAttack(partnerTarget);
            } else if (partnerTarget && partner.pos.getRangeTo(partnerTarget) <= 3) {
                this.creep.attackInRange();
            } else {
                this.creep.attackInRange();
            }
        } else if (partner.memory.idle) {
            this.creep.memory.idle = partner.memory.idle;
        }
    }

    handleSolo() {
        if (this.creep.handleMilitaryCreep()) return;
        if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
    }

    operationManagement() {
        switch (this.creep.memory.operation) {
            case 'borderPatrol':
                this.creep.borderPatrol();
                break;
            case 'guard':
                this.creep.guardRoom();
                break;
            case 'stronghold':
            case 'roomDenial':
                this.creep.denyRoom();
                break;
            case 'harass':
                this.creep.harass();
                break;
            case 'remoteDenial':
                this.creep.remoteDenial();
                break;
        }
    }

    destinationManagement() {
        // Combat handling
        if (this.creep.handleMilitaryCreep()) return;

        // Healing
        if (this.creep.hits < this.creep.hitsMax) {
            if (this.creep.hasActiveBodyparts(HEAL)) {
                this.creep.findDefensivePosition();
                return this.creep.heal(this.creep);
            } else {
                return this.creep.fleeHome();
            }
        }

        if (this.room.name !== this.creep.memory.destination) {
            return this.creep.shibMove(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
        } else {
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
        }
    }
}

profiler.registerClass(RoleLongbowDuo, 'LongbowDuo');
module.exports = RoleLongbowDuo;
