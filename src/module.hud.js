module.exports.hud = function () {
    let opCount = 0;
    for (let key in Memory.targetRooms) {
        let level = Memory.targetRooms[key].level || 1;
        let type = Memory.targetRooms[key].type;
        let priority = Memory.targetRooms[key].priority || 4;
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
        if (type === 'siege' && Memory.targetRooms[key].activeSiege) {
            new RoomVisual(key).text(
                'ACTIVE SIEGE',
                1,
                2,
                {align: 'left', opacity: 0.8, color: '#ff0000'}
            );
        }
        if (type === 'siege' && !Memory.targetRooms[key].activeSiege) {
            new RoomVisual(key).text(
                'QUEUED SIEGE',
                1,
                2,
                {align: 'left', opacity: 0.8, color: '#0b18ff'}
            );
        }
        if (!stagingRoom) {
            new RoomVisual(key).text(
                ICONS.crossedSword + ' Operation Type: ' + _.capitalize(type) + ' Level - ' + level + ' Priority - ' + priority,
                1,
                3,
                {align: 'left', opacity: 0.8}
            );
        } else {
            new RoomVisual(key).text(
                ICONS.crossedSword + ' Operation Type: ' + _.capitalize(type) + ' Level - ' + level + ' Priority - ' + priority + ' - Staging From ' + stagingRoom,
                1,
                3,
                {align: 'left', opacity: 0.8}
            );
        }
        if (Memory.targetRooms[key].enemyDead || Memory.targetRooms[key].friendlyDead) {
            new RoomVisual(key).text(
                'Enemy Kills/Energy - ' + Memory.targetRooms[key].trackedEnemy.length + '/' + Memory.targetRooms[key].enemyDead + ' Friendly Losses/Energy - ' + Memory.targetRooms[key].trackedFriendly.length + '/' + Memory.targetRooms[key].friendlyDead,
                1,
                0,
                {align: 'left', opacity: 0.8, color: '#ff0000'}
            );
        }
        let creeps = _.filter(Game.creeps, (c) => c.memory.targetRoom === key);
        let y = 0;
        if (type !== 'swarm') {
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
        } else {
            new RoomVisual(key).text(
                creeps.length + ' Swarm creeps inbound.',
                1,
                4 + y,
                {align: 'left', opacity: 0.8}
            );
        }
        new RoomVisual().text(
            ICONS.crossedSword + ' ACTIVE OPERATIONS ' + ICONS.crossedSword,
            1,
            34,
            {align: 'left', opacity: 0.5, color: '#ff0000'}
        );
        new RoomVisual().text(
            ' Operation Type: ' + _.capitalize(type) + ' Level - ' + level + ' Priority - ' + priority + ' in Room ' + key,
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
        //GCL
        let lastTickProgress = Memory.lastTickProgress || 0;
        Memory.lastTickProgress = Game.gcl.progress;
        Memory.gclProgressArray = Memory.gclProgressArray || [];
        let progressPerTick = Game.gcl.progress - lastTickProgress;
        let paused = '';
        if (progressPerTick > 0) {
            if (Memory.gclProgressArray.length < 250) {
                Memory.gclProgressArray.push(progressPerTick)
            } else {
                Memory.gclProgressArray.shift();
                Memory.gclProgressArray.push(progressPerTick)
            }
        } else {
            paused = '  **PAUSED**'
        }
        progressPerTick = average(Memory.gclProgressArray);
        let secondsToUpgrade = _.round(((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick) * Memory.tickLength);
        let ticksToUpgrade = _.round((Game.gcl.progressTotal - Game.gcl.progress) / progressPerTick);
        let displayTime;
        if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
        if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
        if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
        if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
        new RoomVisual(name).text(
            ICONS.upgradeController + ' GCL: ' + Game.gcl.level + ' - Next Level In Apx. ' + displayTime + ' or ' + ticksToUpgrade + ' ticks.' + paused,
            1,
            1,
            {align: 'left', opacity: 0.5}
        );
        //Controller
        if (room.controller.progressTotal) {
            let lastTickProgress = room.memory.lastTickProgress || room.controller.progress;
            room.memory.lastTickProgress = room.controller.progress;
            let progressPerTick = room.controller.progress - lastTickProgress;
            room.memory.rclProgressArray = room.memory.rclProgressArray || [];
            let paused = '';
            if (progressPerTick > 0) {
                if (room.memory.rclProgressArray.length < 250) {
                    room.memory.rclProgressArray.push(progressPerTick)
                } else {
                    room.memory.rclProgressArray.shift();
                    room.memory.rclProgressArray.push(progressPerTick)
                }
            } else {
                paused = '  **PAUSED**'
            }
            progressPerTick = average(room.memory.rclProgressArray);
            let secondsToUpgrade = _.round(((room.controller.progressTotal - room.controller.progress) / progressPerTick) * Memory.tickLength);
            let ticksToUpgrade = _.round((room.controller.progressTotal - room.controller.progress) / progressPerTick);
            let displayTime;
            if (secondsToUpgrade < 60) displayTime = secondsToUpgrade + ' Seconds';
            if (secondsToUpgrade >= 86400) displayTime = _.round(secondsToUpgrade / 86400, 2) + ' Days';
            if (secondsToUpgrade < 86400 && secondsToUpgrade >= 3600) displayTime = _.round(secondsToUpgrade / 3600, 2) + ' Hours';
            if (secondsToUpgrade > 60 && secondsToUpgrade < 3600) displayTime = _.round(secondsToUpgrade / 60, 2) + ' Minutes';
            new RoomVisual(name).text(
                ICONS.upgradeController + ' Controller Level: ' + room.controller.level + ' - ' + room.controller.progress + '/' + room.controller.progressTotal + ' - Next Level In Apx. ' + displayTime + ' or ' + ticksToUpgrade + ' ticks.' + paused,
                1,
                3,
                {align: 'left', opacity: 0.5}
            );
        } else {
            delete room.memory.lastTickProgress;
            delete room.memory.rclProgressArray;
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
                7,
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
};