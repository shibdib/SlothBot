/**
 * Created by Bob on 7/1/2017.
 */
const profiler = require('screeps-profiler');
let towers = require('module.towerController');
let shib = require("shibBench");

//Claimed Defense
function controller(room) {
    let creeps = room.creeps;
    let structures = room.structures;

    // Tower control
    let towerCpu = Game.cpu.getUsed();
    if (Game.time % 5 === 0 || room.memory.responseNeeded) towers.towerControl(room);
    shib.shibBench('towerController', towerCpu);

    // Check for invaders and request help
    room.invaderCheck();

    // Handle nuke defense
    if (Game.time % 100 === 0) room.handleNukeAttack();

    // Check if you should safemode
    if (Game.time % 5 === 0) safeModeManager(room);

    // Abandon hopeless rooms
    if (Game.time % 5 === 0) unsavableCheck(room);

    //TODO: ramparts up unless ally in room and no enemies near him
    rampartManager(room, structures);

    // Early Warning System
    //earlyWarning(room);

    // Send an email on a player attack with details of attack
    if (room.memory.responseNeeded && !room.memory.alertEmail) {
        room.memory.alertEmail = true;
        if (room.memory.threatLevel >= 4) {
            let playerHostile = _.filter(room.hostileCreeps, (c) => (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 1) && _.includes(FRIENDLIES, c.owner.username) === false && c.owner.username !== 'Invader')[0];
            if (!playerHostile || !playerHostile.length) return;
            let hostileOwners = [];
            for (let hostile of playerHostile) hostileOwners.push(hostile.owner.username)
            Game.notify('----------------------');
            Game.notify(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
            Game.notify('----------------------');
            Game.notify(room.memory.numberOfHostiles + ' - Foreign Hostiles Reported');
            Game.notify('----------------------');
            Game.notify('Hostile Owners - ' + hostileOwners.toString());
            Game.notify('----------------------');
            log.a('----------------------');
            log.a(room.name + ' - Enemy detected, room is now in FPCON DELTA.');
            log.a('----------------------');
            log.a(room.memory.numberOfHostiles + ' - Foreign Hostiles Reported');
            log.a('----------------------');
            log.a('Hostile Owners - ' + hostileOwners.toString());
            log.a('----------------------');
        }
    }

    // Request assistance
    if (room.memory.responseNeeded) {
        let playerHostile = _.filter(creeps, (c) => (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && _.includes(FRIENDLIES, c.owner.username) === false && c.owner.username !== 'Invader')[0];
        let tower = _.max(_.filter(structures, (s) => s.structureType === STRUCTURE_TOWER), 'energy');
        let responders = _.filter(creeps, (c) => c.memory && c.memory.role === 'responder' && c.memory.overlord === room.name);
        if (((tower.energy < 10 && !responders.length) || !tower || playerHostile || room.memory.threatLevel >= 4) && !room.controller.safeMode) {
            room.memory.requestingSupport = true;
        }
    } else {
        // Send assistance
        if (!room.memory.requestingSupport && room.controller.level > 4) {
            let needyRoom = _.filter(Memory.ownedRooms, (r) => r.memory.requestingSupport && Game.map.findRoute(room.name, r.name).length < 9)[0];
            if (needyRoom) {
                if (room.memory.sendingResponse !== needyRoom.name) {
                    room.memory.sendingResponse = needyRoom.name;
                    log.a(room.name + ' is sending remote responders to ' + needyRoom.name);
                }
            } else {
                delete room.memory.sendingResponse;
            }
        }
    }

    // Manage remote/room standby responders
    manageResponseForces()
}

module.exports.controller = profiler.registerFN(controller, 'defenseController');

//Functions

function rampartManager(room, structures) {
    let allies = _.filter(room.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && !c.my);
    // Check if allies are in the room
    if (allies.length) {
        let enemies = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username));
        // Open ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && !s.isPublic && !s.pos.checkForObstacleStructure() && s.pos.rangeToTarget(s.pos.findClosestByRange(allies)) <= 1 && (!enemies.length || s.pos.rangeToTarget(s.pos.findClosestByRange(enemies)) > 2)).forEach((rampart) => rampart.setPublic(true));
        // Close ramparts
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic && (s.pos.rangeToTarget(s.pos.findClosestByRange(allies)) > 1 || (enemies.length && s.pos.rangeToTarget(s.pos.findClosestByRange(enemies)) <= 2))).forEach((rampart) => rampart.setPublic(false));
    } else {
        // Close public ones
        _.filter(structures, (s) => s.structureType === STRUCTURE_RAMPART && s.isPublic).forEach((rampart) => rampart.setPublic(false));
    }
}

function safeModeManager(room) {
    if (room.controller.safeMode || room.controller.safeModeCooldown || !room.controller.safeModeAvailable || !room.memory.extensionHub) return;
    if (room.controller.level < 3) {
        let enemyMilitary = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 1 || c.getActiveBodyparts(RANGED_ATTACK) >= 1 || c.getActiveBodyparts(WORK) >= 2));
        if (enemyMilitary.length) return room.controller.activateSafeMode();
    } else {
        let hub = new RoomPosition(room.memory.extensionHub.x, room.memory.extensionHub.y, room.name);
        let alliedMilitary = _.filter(room.creeps, (c) => c.memory && c.memory.military);
        let enemyMilitary = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3) && c.pos.rangeToTarget(c.pos.findClosestByRange(FIND_MY_SPAWNS)) < 8);
        if (enemyMilitary.length && !alliedMilitary.length && hub.rangeToTarget(hub.findClosestByPath(enemyMilitary)) < 9) {
            return room.controller.activateSafeMode();
        }
    }
}

function earlyWarning(room) {
    let earlyWarning;
    if (room.memory.remoteRooms) earlyWarning = _.filter(room.memory.remoteRooms, (r) => Memory.roomCache[r] && Memory.roomCache[r].threatLevel >= 3);
    room.memory.earlyWarning = !!earlyWarning.length;
}

function manageResponseForces() {
    let responseTargets = _.max(_.filter(Game.rooms, (r) => r.memory && r.memory.responseNeeded), 'memory.threatLevel');
    if (!responseTargets || !responseTargets.name) {
        let highestHeat = _.max(_.filter(Game.rooms, (r) => r.memory && r.memory.roomHeat), 'memory.roomHeat');
        if (highestHeat) {
            let idleResponders = _.filter(Game.creeps, (c) => c.memory && highestHeat.name !== c.room.name && c.memory.awaitingOrders && Game.map.findRoute(c.memory.overlord, responseTargets.name).length <= 3);
            for (let creep of idleResponders) {
                creep.memory.responseTarget = highestHeat.name;
                creep.memory.awaitingOrders = undefined;
                log.a(creep.name + ' reassigned to guard ' + highestHeat.name + ' from ' + creep.room.name);
            }
        }
    } else {
        let idleResponders = _.filter(Game.creeps, (c) => c.memory && c.memory.awaitingOrders && Game.map.findRoute(c.memory.overlord, responseTargets.name).length <= 3);
        for (let creep of idleResponders) {
            creep.memory.responseTarget = responseTargets.name;
            creep.memory.awaitingOrders = undefined;
            log.a(creep.name + ' reassigned to assist ' + responseTargets.name + ' from ' + creep.room.name);
        }
    }
}

function unsavableCheck(room) {
    // Abandon Bad Rooms
    log.d('Abandon Check');
    let hostiles = _.filter(room.creeps, (c) => !_.includes(FRIENDLIES, c.owner.username) && (c.getActiveBodyparts(ATTACK) >= 3 || c.getActiveBodyparts(RANGED_ATTACK) >= 3 || c.getActiveBodyparts(WORK) >= 3));
    let worthyStructures = _.filter(room.structures, (s) => s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART && s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_TOWER && s.my);
    let towers = _.filter(room.structures, (s) => s.structureType === STRUCTURE_TOWER && s.my);
    let badCount = room.memory.badCount || 0;
    if (room.controller.level <= 4 && hostiles.length && !worthyStructures.length && hostiles.length >= towers.length * 2) {
        if (Game.time % 20 === 0) {
            room.memory.badCount = badCount + 1;
        }
        if (room.memory.badCount > 3) {
            let hostileOwners = [];
            for (let hostile of hostiles) hostileOwners.push(hostile.owner.username)
            abandonOverrun(room);
            Memory.roomCache[room.name].noClaim = true;
            log.a(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + hostileOwners.toString());
            Game.notify(room.name + ' has been abandoned due to a prolonged enemy presence. (Enemies - ' + hostileOwners.toString());
        }
    } else {
        if (badCount === 0) {
            room.memory.badCount = undefined;
        } else {
            room.memory.badCount = badCount - 1;
        }
    }
}

abandonOverrun = function (room) {
    for (let key in room.creeps) {
        room.creeps[key].suicide();
    }
    let overlordFor = _.filter(Game.creeps, (c) => c.memory && c.memory.overlord === room.name);
    for (let key in overlordFor) {
        overlordFor[key].suicide();
    }
    for (let key in room.structures) {
        room.structures[key].destroy();
    }
    for (let key in room.constructionSites) {
        room.constructionSites[key].remove();
    }
    delete room.memory;
    delete Memory.rooms[room.name];
    delete Memory.roomCache[room.name];
    room.controller.unclaim();
};