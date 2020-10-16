/*
 * Copyright (c) 2019.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.say(ICONS.medical + 'Medic' + ICONS.medical, true);
    if (creep.hits < creep.hitsMax) creep.heal(creep);
    let wounded = _.filter(Game.creeps, (c) => _.includes(FRIENDLIES, c.owner.username) && c.hits < c.hitsMax);
    if (wounded.length) {
        let closest = _.sortBy(wounded, function (c) {
            return Game.map.getRoomLinearDistance(creep.room.name, c.room.name)
        })[0];
        creep.shibMove(closest);
        creep.healInRange();
    } else {
        creep.goToHub();
    }
};
