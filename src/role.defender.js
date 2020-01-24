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
    if (!creep.handleMilitaryCreep() && !creep.findDefensivePosition(creep)) creep.idleFor(creep.pos.getRangeTo(creep.pos.findClosestByRange(FIND_EXIT)) - 4);
};
