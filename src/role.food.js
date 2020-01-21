/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    let spawn = _.filter(creep.room.structures, (s) => s.structureType === STRUCTURE_SPAWN)[0];
    creep.say('BYE!', true);
    if (spawn && creep.pos.isNearTo(spawn)) spawn.recycleCreep(creep)
};

