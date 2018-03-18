let profiler = require('screeps-profiler');
let overlord = require('main.Overlord');
let highCommand = require('military.highCommand');
let labs = require('module.labController');
let spawning = require('module.creepSpawning');
let shib = require("shibBench");

function mind() {
    // Set Name
    if (!global.USERNAME) {
        for (let key in Game.spawns) {
            global.USERNAME = Game.spawns[key].owner.username;
        }
    }

    // Get Tick Length
    let d = new Date();
    let seconds = _.round(d.getTime() / 1000, 2);
    let lastTick = Memory.lastTick || seconds;
    Memory.lastTick = seconds;
    Memory.tickLength = seconds - lastTick;

    Memory.ownedRooms = shuffle(_.filter(Game.rooms, (r) => r.controller && r.controller.owner && r.controller.owner['username'] === USERNAME));
    let cpuBucket = Game.cpu.bucket;

    let cpu;
    // High Command
        cpu = Game.cpu.getUsed();
        highCommand.highCommand();
        shib.shibBench('highCommand', cpu);

    // Handle Labs
    cpu = Game.cpu.getUsed();
    labs.labManager();
    shib.shibBench('labControl', cpu);

    // Process Overlords
    let processed = 0;
    let activeClaim;
    let overlordCount = Memory.ownedRooms.length;
    for (let key in Memory.ownedRooms) {
        let activeRoom = Memory.ownedRooms[key];
        if (!activeRoom.memory._caches) activeRoom.memory._caches = {};
        let cpuUsed = Game.cpu.getUsed();
        let cpuLimit = Game.cpu.limit - cpuUsed;
        let cpuTickLimit = Game.cpu.tickLimit - cpuUsed;
        let roomLimit = cpuLimit / (overlordCount - processed);
        if (cpuBucket > 5000) roomLimit = cpuTickLimit / (overlordCount - processed);
        overlord.overlordMind(activeRoom, roomLimit);
        //Expansion Manager
        if (Game.time % 500 === 0 && !activeRoom.memory.activeClaim && activeRoom.controller.level >= 4 && Game.gcl.level - 1 > overlordCount && !activeClaim) {
            activeRoom.claimNewRoom();
        }
        processed++;
    }
    cpu = Game.cpu.getUsed();
    roomHud();
    shib.shibBench('roomHud', cpu);
    cpu = Game.cpu.getUsed();
    spawning.processBuildQueue();
    shib.shibBench('processBuildQueue', cpu);
}
module.exports.hiveMind = profiler.registerFN(mind, 'hiveMind');

function roomHud() {
    let opCount = 0;
    for (let key in Memory.targetRooms) {
        let level = Memory.targetRooms[key].level || 1;
        let type = Memory.targetRooms[key].type;
        if (Memory.targetRooms[key].type === 'attack') type = 'Scout';
        let stagingRoom;
        for (let staging in Memory.stagingRooms) {
            if (Game.map.getRoomLinearDistance(staging, key) === 1) {
                stagingRoom = staging;
            }
        }
        if (Memory.targetRooms[key].escort) {
            new RoomVisual(key).text(
                'ESCORT REQUESTED',
                1,
                2,
                {align: 'left', opacity: 0.8, color: '#ff0000'}
            );
        }
        if (!stagingRoom) {
            new RoomVisual(key).text(
                ICONS.crossedSword + ' Operation Type: ' + _.capitalize(type) + ' Level ' + level,
                1,
                3,
                {align: 'left', opacity: 0.8}
            );
        } else {
            new RoomVisual(key).text(
                ICONS.crossedSword + ' Operation Type: ' + _.capitalize(type) + ' Level ' + level + ' - Staging From ' + stagingRoom,
                1,
                3,
                {align: 'left', opacity: 0.8}
            );
        }
        let creeps = _.filter(Game.creeps, (c) => c.memory.targetRoom === key);
        let y = 0;
        for (let creep in creeps) {
            if (creeps[creep].room.name !== key) {
                let roomDistance = Game.map.findRoute(creeps[creep].room.name, key).length;
                let pathLength = 49;
                if (creeps[creep].memory._shibMove && creeps[creep].memory._shibMove.path) pathLength = creeps[creep].memory._shibMove.path.length;
                let secondsToArrive = (roomDistance * 49) * Memory.tickLength;
                let displayTime;
                if (secondsToArrive < 60) displayTime = secondsToArrive + ' Seconds';
                if (secondsToArrive >= 86400) displayTime = _.round(secondsToArrive / 86400, 2) + ' Days';
                if (secondsToArrive < 86400 && secondsToArrive >= 3600) displayTime = _.round(secondsToArrive / 3600, 2) + ' Hours';
                if (secondsToArrive > 60 && secondsToArrive < 3600) displayTime = _.round(secondsToArrive / 60, 2) + ' Minutes';
                new RoomVisual(key).text(
                    creeps[creep].name + ' Is ' + roomDistance + ' rooms away. Currently in ' + creeps[creep].room.name + '. With ' + creeps[creep].ticksToLive + ' ticks to live. It should arrive in appx. ' + displayTime,
                    1,
                    4 + y,
                    {align: 'left', opacity: 0.8}
                );
            } else {
                new RoomVisual(key).text(
                    creeps[creep].name + ' Is On Scene. ' + creeps[creep].hits + '/' + creeps[creep].hitsMax + ' hp',
                    1,
                    4 + y,
                    {align: 'left', opacity: 0.8}
                );
            }
            y++;
        }
        new RoomVisual().text(
            ICONS.crossedSword + ' ACTIVE OPERATIONS ' + ICONS.crossedSword,
            1,
            34,
            {align: 'left', opacity: 0.5, color: '#ff0000'}
        );
        new RoomVisual().text(
            ' Operation Type: ' + _.capitalize(type) + ' Level ' + level + ' in Room ' + key,
            1,
            35 + opCount,
            {align: 'left', opacity: 0.5}
        );
        opCount++;
    }
    for (let key in Memory.ownedRooms) {
        let name = Memory.ownedRooms[key].name;
        let room = Game.rooms[name];
        if (!room) continue;
        //Reaction Room
        if (room.memory.reactionRoom) {
            new RoomVisual(name).text(
                ICONS.reaction + ' REACTION ROOM',
                1,
                2,
                {align: 'left', opacity: 0.5}
            );
        }
        //GCL
        let lastTickProgress = Memory.lastTickProgress || 0;
        Memory.lastTickProgress = Game.gcl.progress;
        let progressPerTick = Game.gcl.progress - lastTickProgress;
        let secondsToUpgrade = _.round(((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick) * Memory.tickLength);
        let displayTime;
        if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
        if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
        if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
        if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
        new RoomVisual(name).text(
            ICONS.upgradeController + ' GCL: ' + Game.gcl.level + ' - ' + Game.gcl.progress + '/' + Game.gcl.progressTotal + ' - Next Level In Apx. ' + displayTime,
            1,
            1,
            {align: 'left', opacity: 0.5}
        );
        //Controller
        if (room.controller.progressTotal) {
            let lastTickProgress = room.memory.lastTickProgress || room.controller.progress;
            room.memory.lastTickProgress = room.controller.progress;
            let progressPerTick = room.controller.progress - lastTickProgress;
            let secondsToUpgrade = _.round(((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickLength);
            let displayTime;
            if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
            if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
            if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
            if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
            new RoomVisual(name).text(
                ICONS.upgradeController + ' Controller Level: ' + room.controller.level + ' - ' + room.controller.progress + '/' + room.controller.progressTotal + ' - Next Level In Apx. ' + displayTime,
                1,
                3,
                {align: 'left', opacity: 0.5}
            );
        } else {
            new RoomVisual(name).text(
                ICONS.upgradeController + ' Controller Level: ' + room.controller.level,
                1,
                3,
                {align: 'left', opacity: 0.5}
            );
        }
        if (room.memory.responseNeeded) {
            new RoomVisual(name).text(
                ICONS.crossedSword + ' RESPONSE NEEDED: Threat Level ' + room.memory.threatLevel,
                1,
                2,
                {align: 'left', opacity: 0.8, color: '#ff0000'}
            );
        }
        if (room.memory.claimTarget) {
            new RoomVisual(name).text(
                ICONS.claimController + ' Claim Target: ' + room.memory.claimTarget,
                1,
                4,
                {align: 'left', opacity: 0.5, color: '#31ff1e'}
            );
        }
        if (room.memory.assistingRoom) {
            new RoomVisual(name).text(
                ICONS.repair + ' Sending Builders To Room: ' + room.memory.assistingRoom,
                1,
                5,
                {align: 'left', opacity: 0.5, color: '#feff3b'}
            );
        }
        if (room.memory.sendingResponse) {
            new RoomVisual(name).text(
                ICONS.attack + ' Sending Military Support To: ' + room.memory.sendingResponse,
                1,
                6,
                {align: 'left', opacity: 0.5, color: '#ff0000'}
            );
        }
    }
}