/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");

class RoleLongbowSquad {
    constructor(creep) {
        this.creep = creep;
        this.room = creep.room;
        this.performRoleActions();
    }

    performRoleActions() {
        if (this.housekeeping()) return;
        // If partner set
        if (this.creep.memory.grouped) {
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
        if (this.creep.tryToBoost([])) return true;
        // Blinky mode
        this.creep.healInRange(this.room.hostileCreeps.length || this.room.hostileStructures.length);
        // Check and set partner if conditions warrant
        this.creep.groupUp();
    }

    handleLeader() {
        this.creep.attackInRange();
        const squad = this.creep.memory.squadMembers.map(id => Game.getObjectById(id));

        // If no squad, remove leader
        if (!squad.length) {
            this.creep.memory.grouped = undefined;
            this.creep.memory.leader = undefined;
            return;
        }

        // If a squad mate is fatigued and nearby, wait
        if (this.creep.fatigue) return;
        for (const squadMate of squad) {
            if (!squadMate || !Game.getObjectById(squadMate.id)) {
                this.creep.memory.squadMembers = _.filter(this.creep.memory.squadMembers, (c) => c);
                continue;
            }
            if (squadMate && squadMate.fatigue) {
                if (this.creep.pos.isNearTo(squadMate)) {
                    return;
                }
            }
        }

        // If we can fight ramparts, do so

        // Manage squad
        const acceptableRange = this.room.hostileCreeps.length || this.room.hostileStructures.length ? 3 : 1;
        let ready = !squad.find((c) => !c || c.pos.getRangeTo(this.creep) > acceptableRange);
        let rampartMode;
        if (this.room.hostileCreeps.length && this.creep.fightFromRampart()) rampartMode = true;
        for (const squadRole in this.creep.memory.squadRoles) {
            const squadMate = Game.getObjectById(this.creep.memory.squadRoles[squadRole]);
            if (!squadMate) {
                this.creep.memory.squadRoles[squadRole] = undefined;
                this.creep.memory.squadMembers = _.filter(this.creep.memory.squadMembers, (c) => c !== this.creep.memory.squadRoles[squadRole]);
                continue;
            }

            // Have everyone fight from ramparts if possible
            if (rampartMode) {
                squadMate.fightFromRampart();
                continue;
            }

            // Formation fixing
            if (!ready || (!this.creep.memory._shibSquadMove || !this.creep.memory._shibSquadMove.path || !this.creep.memory._shibSquadMove.path.length)) {
                const squadPos = new RoomPosition(this.creep.pos.x + squadRolePositions[squadMate.memory.squadRole][0].x, this.creep.pos.y + squadRolePositions[squadMate.memory.squadRole][0].y, this.creep.room.name);
                if (!squadMate.pos.isEqualTo(squadPos)) {
                    if (!squadPos.checkForImpassible()) {
                        squadMate.shibMove(squadPos, {range: 0, ignoreCreeps: false});
                    } else {
                        const squadPos1 = new RoomPosition(this.creep.pos.x + squadRolePositions[squadMate.memory.squadRole][1].x, this.creep.pos.y + squadRolePositions[squadMate.memory.squadRole][1].y, this.creep.room.name);
                        squadMate.shibMove(squadPos1, {range: 0, ignoreCreeps: false});
                    }
                } else if (this.creep.memory.idle) {
                    squadMate.memory.idle = this.creep.memory.idle;
                }
            }
        }
        if (rampartMode) return;

        // Handle waiting for squad
        if (!ready || (this.creep.memory.misc && this.creep.memory.misc.waitFor && this.creep.memory.misc.waitFor > this.creep.memory.squadMembers.length + 1)) {
            return this.creep.handleMilitaryCreep();
        }

        if (this.creep.memory.operation) {
            this.operationManagement();
        } else if (this.creep.memory.destination) {
            this.destinationManagement();
        } else {
            this.creep.handleMilitaryCreep();
        }
    }

    handleFollower() {
        this.creep.attackInRange();
        const leader = Game.getObjectById(this.creep.memory.groupLeader);
        if (leader) {
            this.setSquadRole(leader);
            // Attack target
            if (this.room.hostileCreeps.length || this.room.hostileStructures.length) {
                const partnerTarget = Game.getObjectById(leader.memory.target);
                if (partnerTarget && this.creep.pos.getRangeTo(partnerTarget) <= 3) {
                    this.creep.rangedAttack(partnerTarget);
                }
            }
        } else {
            this.creep.memory.grouped = undefined;
            this.creep.memory.leader = undefined;
            this.creep.memory.squadRole = undefined;
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
            return this.creep.shibSquadMovement(new RoomPosition(25, 25, this.creep.memory.destination), {range: 22});
        } else {
            if (this.creep.findDefensivePosition()) this.creep.idleFor(5);
        }
    }

    setSquadRole(leader) {
        if (this.creep.memory.squadRole) return;
        if (!leader.memory.squadRoles) leader.memory.squadRoles = {};
        if (!leader.memory.squadRoles[1] || !Game.getObjectById(leader.memory.squadRoles[1])) {
            leader.memory.squadRoles[1] = this.creep.id;
            this.creep.memory.squadRole = 1;
        } else if (!leader.memory.squadRoles[2] || !Game.getObjectById(leader.memory.squadRoles[2])) {
            leader.memory.squadRoles[2] = this.creep.id;
            this.creep.memory.squadRole = 2;
        } else {
            leader.memory.squadRoles[3] = this.creep.id;
            this.creep.memory.squadRole = 3;
        }
    }
}

const squadRolePositions = {
    1: [{x: 0, y: 1}, {x: 0, y: -1}],
    2: [{x: 1, y: 0}, {x: -1, y: 0}],
    3: [{x: 1, y: 1}, {x: -1, y: -1}],
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;
