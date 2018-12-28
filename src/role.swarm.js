/**
 * Created by Bob on 7/19/2017.
 */
module.exports.role = function (creep) {
    // Harass
    if (creep.memory.operation && creep.memory.operation === 'harass') creep.harassRoom();
    // Escort
    if (creep.memory.operation && creep.memory.operation === 'guard') creep.guardRoom();
    // Hold
    if (creep.memory.operation && creep.memory.operation === 'hold') creep.holdRoom();
    // Swarm
    if (creep.memory.operation && creep.memory.operation === 'swarm') creep.swarmRoom();
    // Swarm
    if (creep.memory.operation && creep.memory.operation === 'swarmHarass') creep.swarmHarassRoom();
};