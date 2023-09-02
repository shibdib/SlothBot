/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

module.exports.farm = function (room) {
    room.cacheRoomIntel();
    // If no drone make one, otherwise run drone
    let drone = _.find(room.myCreeps, (c) => c.memory.role === 'drone');
    if (!drone) {
        let spawn = _.find(room.impassibleStructures, (s) => s.structureType === STRUCTURE_SPAWN);
        if (spawn) spawn.createCreep([WORK, CARRY, MOVE], 'drone' + getRandomInt(1, 99), {role: 'drone', other: {}});
    } else {
        require('role.drone').role(drone);
    }
    // Generate pixels
    if (Game.cpu.bucket === BUCKET_MAX) {
        log.a('Pixel Generated');
        Game.cpu.generatePixel();
    }
};