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
        // Group
        this.creep.groupUp();
        // Boosting
        if (this.creep.tryToBoost([RANGED_ATTACK])) return true;
        // Blinky mode
        this.creep.healInRange(this.room.hostileCreeps.length || this.room.hostileStructures.length);
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

        // Rampart mode decision
        const rampartMode = hostileCreeps.length && creep.fightFromRampart();

        // Squad readiness check
        const groupUp = hostileCreeps.length > 0 || hostileStructures.length > 0 || this.nearDestination(creep) || (INTEL[creep.room.name] && INTEL[creep.room.name].user !== MY_USERNAME);
        creep.memory.groupUp = groupUp;
        const squad = squadMembers.map(id => Game.getObjectById(id));
        const isReady = isQuadPacked(squad.concat(creep));

        // Check for fatigued squad members
        if (groupUp) {
            const fatigueDetected = squadMembers.find(function (c) {
                const sM = Game.getObjectById(c);
                if (sM && sM.room.name === creep.room.name && sM.fatigue) return true;
            })
            if (fatigueDetected) return;
        }

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
            if (groupUp) {
                // Handle needing to regroup, find an open space in the room to group up
                if (creep.memory.findRegroup) {
                    if (!isReady) {
                        const clearSpot = findClosestClear2x2(creep);
                        if (clearSpot) {
                            this.reformSquad(creep, squadMate);
                            creep.shibMove(clearSpot, {range: 0});
                        }
                    } else {
                        this.creep.memory.findRegroup = undefined;
                    }
                }
                this.reformSquad(creep, squadMate);
            } else {
                if (squadMate.pos.getRangeTo(creep) > 1) {
                    squadMate.shibMove(creep, {range: 1, ignoreCreeps: false});
                } else if (memory.idle) {
                    squadMate.memory.idle = memory.idle;
                }
            }
        }
        if (rampartMode) return;

        // Handle squad assembly and operations
        if ((groupUp && !isReady) || (memory.misc && memory.misc.waitFor > squadMembers.length + 1)) {
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

    reformSquad(creep, squadMate) {
        const posOffset = squadRolePositions[squadMate.memory.squadRole];
        let newX = Math.max(0, Math.min(49, creep.pos.x + posOffset[0].x));
        let newY = Math.max(0, Math.min(49, creep.pos.y + posOffset[0].y));

        let targetPos = new RoomPosition(newX, newY, creep.room.name);

        if (!squadMate.pos.isEqualTo(targetPos)) {
            if (targetPos.checkForImpassible()) {
                newX = Math.max(0, Math.min(49, creep.pos.x + posOffset[1].x));
                newY = Math.max(0, Math.min(49, creep.pos.y + posOffset[1].y));
                targetPos = new RoomPosition(newX, newY, creep.room.name);
            }
            squadMate.shibMove(targetPos, {range: 0, ignoreCreeps: false});
        } else if (creep.memory.idle) {
            squadMate.memory.idle = creep.memory.idle;
        }
    }

    nearDestination(leader) {
        if (!leader.memory.destination) return true;
        return Game.map.getRoomLinearDistance(this.creep.room.name, leader.memory.destination) <= 1;
    }
}

function isQuadPacked(creeps) {
    for (let i = 0; i < creeps.length; i++) {
        for (let j = i + 1; j < creeps.length; j++) {
            if (!creeps[i]) continue;
            // Return true near border
            if (creeps[i].pos.x <= 1 || creeps[i].pos.x >= 48 || creeps[i].pos.y <= 1 || creeps[i].pos.y >= 48) return true
            if (!creeps[i].pos.isNearTo(creeps[j].pos)) return false
        }
    }
    return true
}

// Function to find the closest clear 2x2 space
function findClosestClear2x2(creep) {
    const room = creep.room;
    const startPos = creep.pos;

    // Search range - adjust as needed
    const range = 10;

    // Get terrain data for the room
    const terrain = new Room.Terrain(room.name);

    // Store the best position found
    let closestPos = null;
    let closestDist = Infinity;

    // Check positions around the creep within range
    for (let x = Math.max(0, startPos.x - range); x <= Math.min(49, startPos.x + range - 1); x++) {
        for (let y = Math.max(0, startPos.y - range); y <= Math.min(49, startPos.y + range - 1); y++) {
            // Check if this is a valid 2x2 spot
            if (isClear2x2(room, terrain, x, y, creep)) {
                const dist = startPos.getRangeTo(x, y);
                if (dist < closestDist) {
                    closestDist = dist;
                    closestPos = new RoomPosition(x, y, room.name);
                }
            }
        }
    }

    return closestPos;
}

// Helper function to check if a 2x2 area is clear
function isClear2x2(room, terrain, x, y, creep) {
    // Ensure we're not checking outside room bounds (room is 50x50)
    if (x >= 49 || y >= 49) return false;

    // If creep is there return true
    if (creep.pos.x === x && creep.pos.y === y) return true;

    // Check all 4 tiles in the 2x2 grid
    for (let dx = 0; dx < 2; dx++) {
        for (let dy = 0; dy < 2; dy++) {
            const checkX = x + dx;
            const checkY = y + dy;

            // Check terrain (0 = plain, 1 = wall, 2 = swamp)
            if (terrain.get(checkX, checkY) === TERRAIN_MASK_WALL) {
                return false;
            }

            // Check for structures and creeps
            const objects = room.lookAt(checkX, checkY);
            for (const obj of objects) {
                if (obj.type === LOOK_CREEPS ||
                    (obj.type === LOOK_STRUCTURES &&
                        OBSTACLE_OBJECT_TYPES.includes(obj.structure.structureType))) {
                    return false;
                }
            }
        }
    }

    return true;
}


const squadRolePositions = {
    1: [{x: 0, y: 1}, {x: 0, y: -1}],
    2: [{x: 1, y: 0}, {x: -1, y: 0}],
    3: [{x: 1, y: 1}, {x: -1, y: -1}],
}

profiler.registerClass(RoleLongbowSquad, 'longbowSquad');
module.exports = RoleLongbowSquad;
