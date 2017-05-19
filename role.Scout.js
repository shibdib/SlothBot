var roleScout = {

    /** @param {Creep} creep **/
    run: function (creep) {
        var scout = creep.memory.destination;
            creep.moveTo(Game.flags[scout]);
        }

};

module.exports = roleScout;
/**
 * Created by rober on 5/15/2017.
 */
