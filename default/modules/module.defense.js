/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */
const profiler = require("tools.profiler");
const towers = require('module.towerController');
const ROOM_STATE_CACHE = {};

// Re-send an "ongoing attack" reminder at most this often (~3 hours real time)
const ALERT_REMINDER_TICKS = 5000;
// Email grouping window passed to Game.notify (minutes)
const ALERT_GROUP_MINUTES = 30;

class DefenseManager {
    constructor(room) {
        this.room = room;
    }

    run() {
        // Manage towers
        towers.towerController(this.room);

        // Invader check
        this.room.invaderCheck();

        // Manage ramparts
        if (!Memory._rampartsSet || RAMPART_ACCESS) this.rampartManager();

        // Periodic Nuke Defense Check
        if (Game.time % 100 === 0) this.handleNukeAttack();

        // Manage room attacks
        const armedHostiles = this.room.hostileCreeps.filter((c) => c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK));
        if (armedHostiles.length || this.room.controller.safeMode) {
            this.alertHostileAttack();
            if (armedHostiles[0] && armedHostiles[0].owner && armedHostiles[0].owner.username !== 'Invader') {
                this.safeModeManager(this.room);
                INTEL[this.room.name].requestingSupport = true;
            }
        } else {
            clearHostileAlert(this.room);
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
        // Filter hostile creeps that are armed players (not Invaders)
        const playerHostile = _.filter(this.room.hostileCreeps, (c) => (
            c.owner &&
            c.owner.username !== 'Invader' &&
            (c.hasActiveBodyparts(ATTACK) || c.hasActiveBodyparts(RANGED_ATTACK) || c.hasActiveBodyparts(WORK) || c.hasActiveBodyparts(CLAIM))
        ));
        if (!playerHostile.length) return;

        const hostileOwners = _.uniq(playerHostile.map(c => c.owner.username)).sort();
        sendHostileNotification(this.room, hostileOwners);
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
        const spawn = this.room.spawns[0];

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
    Memory._defenseAlerts = Memory._defenseAlerts || {};
    const intel = INTEL[room.name] || {};
    const state = Memory._defenseAlerts[room.name];
    const ownersKey = hostileOwners.join(',');
    const threatLevel = intel.threatLevel || 0;
    const hostileCount = intel.numberOfHostiles || 0;
    const hostilePower = intel.hostilePower || 0;
    const friendlyPower = intel.friendlyPower || 0;

    // Decide whether this tick warrants an alert
    let reason;
    if (!state) {
        reason = 'INITIAL';
    } else if (state.ownersKey !== ownersKey) {
        reason = 'NEW ATTACKER';
    } else if (threatLevel > (state.peakThreat || 0)) {
        reason = 'ESCALATION';
    } else if (Game.time - state.lastAlert >= ALERT_REMINDER_TICKS) {
        reason = 'ONGOING';
    }

    // Persist running state regardless of whether we notify (keeps peaks current
    // so the eventual all-clear summary is accurate)
    Memory._defenseAlerts[room.name] = {
        firstAlert: state ? state.firstAlert : Game.time,
        lastAlert: state && !reason ? state.lastAlert : Game.time,
        ownersKey: ownersKey,
        peakThreat: Math.max(threatLevel, (state && state.peakThreat) || 0),
        peakHostiles: Math.max(hostileCount, (state && state.peakHostiles) || 0),
    };

    if (INTEL[room.name]) INTEL[room.name].alertEmail = true;
    if (!reason) return;

    const historyLink = roomHistoryLink(room.name);
    const summary = `${room.name} [${reason}] hostiles=${hostileCount} threat=${threatLevel} power H/F=${hostilePower}/${friendlyPower} owners=${ownersKey}`;

    // Single email with grouping so repeat sends within the window collapse server-side
    Game.notify(summary, ALERT_GROUP_MINUTES);

    log.a(`${historyLink} [${reason}] hostiles=${hostileCount} threat=${threatLevel} power H/F=${hostilePower}/${friendlyPower}`, 'DEFENSE');
    log.a(`owners: ${ownersKey}`, 'DEFENSE');
}

function clearHostileAlert(room) {
    if (!Memory._defenseAlerts || !Memory._defenseAlerts[room.name]) return;
    const state = Memory._defenseAlerts[room.name];
    delete Memory._defenseAlerts[room.name];

    // Only bother announcing all-clear for attacks that were actually meaningful
    if ((state.peakThreat || 0) < 3) return;
    const duration = Game.time - (state.firstAlert || Game.time);
    const summary = `${room.name} [ALL CLEAR] attack ended after ${duration} ticks. peak hostiles=${state.peakHostiles} peak threat=${state.peakThreat} owners=${state.ownersKey}`;
    Game.notify(summary, ALERT_GROUP_MINUTES);
    log.a(`${roomLink(room.name)} all clear after ${duration} ticks. Peak: ${state.peakHostiles} hostiles, threat ${state.peakThreat}, owners ${state.ownersKey}`, 'DEFENSE');
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