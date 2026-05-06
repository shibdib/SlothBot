/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const towers = require('module.towerController');
const ROOM_STATE_CACHE = {};

class DefenseManager {
    constructor(room) {
        this.room = room;
    }

    run() {
        // Manage towers
        towers.towerControl(this.room);

        // Invader check
        this.room.invaderCheck();

        // Manage ramparts
        if (!Memory._rampartsSet || RAMPART_ACCESS) this.rampartManager();

        // Periodic Nuke Defense Check
        if (Game.time % 100 === 0) this.handleNukeAttack();

        // Manage room attacks
        const armedHostiles = this.room.hostileCreeps.filter((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK));
        if (armedHostiles.length || this.room.controller.safeMode) {
            this.alertHostileAttack(this.room);
            if (armedHostiles[0] && armedHostiles[0].owner && armedHostiles[0].owner.username !== 'Invader') {
                this.safeModeManager(this.room);
                INTEL[this.room.name].requestingSupport = true;
            }
        }

        // Check surrounding rooms for high threat
        this.room.memory.earlyWarning = _.some(Object.values(Game.map.describeExits(this.room.name)), roomName => INTEL[roomName] && INTEL[roomName].threatLevel > 4);
    }

    rampartManager() {
        const roomName = this.room.name;
        const currentTick = Game.time;

        // Cache room state once per tick
        if (!ROOM_STATE_CACHE[roomName] || ROOM_STATE_CACHE[roomName].tick !== currentTick) {
            const ramparts = [];
            const allies = [];
            const hostileCreeps = this.room.hostileCreeps;
            const structures = this.room.structures;
            const creeps = this.room.creeps;

            for (let s of structures) {
                if (s.structureType === STRUCTURE_RAMPART) ramparts.push(s);
            }
            for (let c of creeps) {
                if (c.owner && _.includes(FRIENDLIES, c.owner.username) && !c.my) allies.push(c);
            }

            ROOM_STATE_CACHE[roomName] = {
                ramparts: ramparts,
                allies: allies,
                hostileCreeps: hostileCreeps,
                tick: currentTick
            };
        }

        const state = ROOM_STATE_CACHE[roomName];

        if (!RAMPART_ACCESS) {
            Memory._rampartsSet = true;
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) rampart.setPublic(false);
            }
            return;
        }

        Memory._rampartsSet = undefined;

        if (!state.hostileCreeps.length) {
            for (let rampart of state.ramparts) {
                if (!rampart.isPublic) rampart.setPublic(true);
            }
            return;
        }

        if (state.allies.length) {
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) {
                    const closestHostile = rampart.pos.findClosestByRange(state.hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) <= 1) {
                        rampart.setPublic(false);
                    }
                } else {
                    const closestHostile = rampart.pos.findClosestByRange(state.hostileCreeps);
                    if (closestHostile && rampart.pos.getRangeTo(closestHostile) > 1) {
                        rampart.setPublic(true);
                    }
                }
            }
        } else if (state.hostileCreeps.length) {
            for (let rampart of state.ramparts) {
                if (rampart.isPublic) rampart.setPublic(false);
            }
        }

        for (let rampart of state.ramparts) {
            if (rampart.isPublic && rampart.pos.checkForObstacleStructure()) {
                rampart.setPublic(false);
            }
        }
    }

    handleNukeAttack() {
        const currentTick = Game.time;
        const roomName = this.room.name;

        if (currentTick % 100 !== 0) return;

        const nukes = this.room.find(FIND_NUKES);
        if (!nukes.length) {
            this.room.memory.nuke = undefined;
            return false;
        }

        this.room.memory.nuke = _.min(nukes, 'timeToLand').timeToLand;

        const launchRoom = nukes[0].launchRoomName;
        if (INTEL[launchRoom] && INTEL[launchRoom].owner) {
            let nukeTargets = Memory.MAD || [];
            nukeTargets.push(INTEL[launchRoom].owner);
            Memory.MAD = _.uniq(nukeTargets);
        }

        const criticalStructures = this.room.structures.filter(s => [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN].includes(s.structureType));

        for (let nuke of nukes) {
            if (nuke.timeToLand <= 75) {
                for (let c of this.room.myCreeps) {
                    c.memory.fleeNukeTime = currentTick + nuke.timeToLand + 2;
                    c.memory.fleeNukeRoom = roomName;
                }
                return true;
            }

            const nearbyStructures = [];
            for (let s of criticalStructures) {
                if (nuke.pos.getRangeTo(s.pos) <= 5) nearbyStructures.push(s);
            }

            for (let structure of nearbyStructures) {
                if (structure.pos.checkForConstructionSites() || structure.pos.checkForRampart()) continue;
                structure.pos.createConstructionSite(STRUCTURE_RAMPART);
            }
        }
        return true;
    }

    alertHostileAttack() {
        if (!INTEL[this.room.name].alertEmail) {
            INTEL[this.room.name].alertEmail = true;

            // Filter hostile creeps that are not Invaders
            let playerHostile = _.filter(this.room.hostileCreeps, (c) => (
                c.owner &&
                (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM)) &&
                c.owner.username !== 'Invader'
            ));

            if (!playerHostile || !playerHostile.length) return;

            let hostileOwners = _.uniq(playerHostile.map(hostile => hostile.owner.username));

            // Send notification and log the alert
            sendHostileNotification(this.room, hostileOwners);
        }
    }

    safeModeManager() {
        addThreat(this.room);

        if (this.room.controller.safeMode) {
            this.room.memory.defenseCooldown = undefined;
            if (this.room.controller.safeMode < 750 && this.room.level >= 5) {
                let endingTick = Game.time + this.room.controller.safeMode;
                this.room.memory.defenseCooldown = endingTick + CREEP_LIFE_TIME * 0.5;
            }
            return;
        }

        const activeSafemode = _.find(MY_ROOMS, function (r) {
            return Game.rooms[r].controller.safeMode;
        });

        if (activeSafemode || !this.room.controller.safeModeAvailable || this.room.controller.safeModeCooldown) return;

        const damagedStructures = this.room.structures.find(s => [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY, STRUCTURE_POWER_SPAWN, STRUCTURE_EXTENSION].includes(s.structureType) && s.hits < s.hitsMax);
        const spawn = this.room.structures.find((s) => s.structureType === STRUCTURE_SPAWN);

        if (damagedStructures || (this.room.controller.level >= 6 && !spawn)) {
            this.room.memory.safeModeInfo = {
                tick: Game.time,
                attackers: INTEL[this.room.name].hostileOwners,
                level: INTEL[this.room.name].threatLevel
            };
            activateSafeMode(this.room);
        }
    }
}

profiler.registerClass(DefenseManager, 'DefenseManager');
module.exports = DefenseManager;

function sendHostileNotification(room, hostileOwners) {
    const historyLink = roomHistoryLink(room.name);
    Game.notify('----------------------');
    Game.notify(`${historyLink} - Enemy detected, room is now in FPCON DELTA.`);
    Game.notify('----------------------');
    Game.notify(`${INTEL[room.name].numberOfHostiles} - Foreign Hostiles Reported`);
    Game.notify('----------------------');
    Game.notify(`Hostile Owners - ${JSON.stringify(hostileOwners)}`);
    Game.notify('----------------------');

    log.a('----------------------');
    log.a(`${roomLink(room.name)} - Enemy detected, room is now in FPCON DELTA.`);
    log.a('----------------------');
    log.a(`${INTEL[room.name].numberOfHostiles} - Foreign Hostiles Reported`);
    log.a('----------------------');
    log.a(`Hostile Owners - ${JSON.stringify(hostileOwners)}`);
    log.a('----------------------');
}

function activateSafeMode(room) {
    if (room.controller.activateSafeMode() === OK) {
        let ownerArray = _.uniq(room.hostileCreeps.map(c => c.owner.username));
        log.a(roomLink(room.name) + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray), 'DEFENSE COMMAND');
        Game.notify(room.name + ' has entered safemode with ' + room.hostileCreeps.length + ' attackers in the room, creep owners: ' + JSON.stringify(ownerArray));
    }
}

function addThreat(room) {
    let neutrals = _.uniq(_.pluck(_.filter(room.creeps, (c) => !c.my && c.owner && !_.includes(FRIENDLIES, c.owner.username) && c.owner.username !== 'Invader' && c.owner.username !== 'Source Keeper'), 'owner.username'));
    if (neutrals.length) {
        for (let user of neutrals) {
            if (user === MY_USERNAME || _.includes(FRIENDLIES, user)) continue;
            let cache = Memory._userList || {};
            let standing;
            if (cache[user]) {
                standing = cache[user]['standing'] - 0.25;
            } else if (!cache[user]) {
                standing = 0;
                log.w(roomLink(room.name) + ' has detected a neutral.' + user + ' has now been marked hostile for trespassing.', 'DIPLOMACY:');
            }
            cache[user] = {
                standing: standing,
                lastAction: Game.time,
            };
            Memory._userList = cache;
        }
    }
}