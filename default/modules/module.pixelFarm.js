/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

module.exports.farm = function (room) {
    room.cacheRoomIntel();
    // If no drone make one, otherwise run drone
    let drone = _.find(room.myCreeps, (c) => c.memory.role === 'drone');
    if (!drone) {
        let spawn = room.spawns[0];
        if (spawn) {
            spawn.spawnCreep([WORK, CARRY, MOVE], 'drone' + getRandomInt(1, 99), {
                memory: {role: 'drone', other: {}}
            });
        }
    } else {
        new (require('role.drone'))(drone);
    }
    // Generate pixels
    if (Game.cpu.bucket === BUCKET_MAX) {
        log.a('Pixel Generated');
        Game.cpu.generatePixel();
    }
};