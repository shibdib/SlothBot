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
        const creep = this.creep;
        const memory = creep.memory;

        // Early attack and fatigue checks
        creep.attackInRange();
        if (creep.fatigue) return;

        // Squad initialization and validation
        if (!memory.squadMembers || !memory.squadMembers.length) {
            delete memory.squadMembers;
            delete memory.squadRoles;
            delete memory.grouped;
            delete memory.leader;
            return;
        }

        // Cache frequently accessed properties
        const squadMembers = memory.squadMembers;
        const squadRoles = memory.squadRoles || {};
        const room = creep.room;
        const hostileCreeps = room.hostileCreeps;
        const hostileStructures = room.hostileStructures;

        // Clean invalid squad members and check fatigue
        let hasFatiguedMate = false;
        for (let i = squadMembers.length - 1; i >= 0; i--) {
            const mate = Game.getObjectById(squadMembers[i]);
            if (!mate) {
                squadMembers.splice(i, 1);
                delete squadRoles[squadMembers[i]];
                continue;
            }
            if (mate.fatigue && creep.pos.isNearTo(mate)) {
                hasFatiguedMate = true;
                break;
            }
        }
        if (hasFatiguedMate) return;

        // Rampart mode decision
        const rampartMode = hostileCreeps.length && creep.fightFromRampart();

        // Squad readiness check
        const acceptableRange = (hostileCreeps.length || hostileStructures.length) ? 3 : 1;
        const squad = squadMembers.map(id => Game.getObjectById(id));
        const isReady = squad.every(c => c && c.pos.getRangeTo(creep) <= acceptableRange) &&
            (acceptableRange === 1 || isQuadPacked(squad.concat(creep)));

        // Manage squad members
        for (const role in squadRoles) {
            const squadMate = Game.getObjectById(squadRoles[role]);
            if (!squadMate) {
                delete squadRoles[role];
                const index = squadMembers.indexOf(squadRoles[role]);
                if (index !== -1) squadMembers.splice(index, 1);
                continue;
            }

            if (rampartMode) {
                squadMate.fightFromRampart();
                continue;
            }

            // Formation management
            if (!isReady || (!memory._shibSquadMove || !memory._shibSquadMove.path || !memory._shibSquadMove.path.length)) {
                const posOffset = squadRolePositions[squadMate.memory.squadRole];
                if (!posOffset || !posOffset[0]) continue;
                let targetPos = new RoomPosition(
                    creep.pos.x + posOffset[0].x,
                    creep.pos.y + posOffset[0].y,
                    creep.room.name
                );

                if (!squadMate.pos.isEqualTo(targetPos)) {
                    if (targetPos.checkForImpassible()) {
                        targetPos = new RoomPosition(
                            creep.pos.x + posOffset[1].x,
                            creep.pos.y + posOffset[1].y,
                            creep.room.name
                        );
                    }
                    squadMate.shibMove(targetPos, {range: 0, ignoreCreeps: false});
                } else if (memory.idle) {
                    squadMate.memory.idle = memory.idle;
                }
            }
        }
        if (rampartMode) return;

        // Handle squad assembly and operations
        if (!isReady || (memory.misc && memory.misc.waitFor > squadMembers.length + 1)) {
            creep.handleMilitaryCreep() || creep.findDefensivePosition();
            return;
        }

        if (memory.operation) {
            this.operationManagement();
        } else if (memory.destination) {
            this.destinationManagement();
        } else {
            creep.handleMilitaryCreep();
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

function isQuadPacked(creeps) {
    if (creeps.length !== 4) return false
    for (let i = 0; i < creeps.length; i++) {
        for (let j = i + 1; j < creeps.length; j++) {
            if (!creeps[i].pos.isNearTo(creeps[j].pos)) return false
        }
    }
    return true
}


const squadRolePositions = {
    1: [{x: 0, y: 1}, {x: 0, y: -1}],
    2: [{x: 1, y: 0}, {x: -1, y: 0}],
    3: [{x: 1, y: 1}, {x: -1, y: -1}],
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;
