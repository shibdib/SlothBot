/**
 * Created by rober on 6/18/2017.
 */
moveTo(new RoomPosition(25, 25, roomName), {range: 21}); //to move to any room

//dropped resources pick the creep
var collectDropped = {

    /**  *
     * @param thisRoom
     */
    run: function(thisRoom) {
        var droppedResources = thisRoom.find(FIND_DROPPED_RESOURCES, 1);
        if(droppedResources.length){
            for (var name in droppedResources){
                if(droppedResources[name].energy > MIN_ENERGY_TO_COLLECT){
                    //CollectDropped.run(thisRoom, droppedResources.name);

                    var nearestCreep = droppedResources[name].pos.findClosestByPath(FIND_CREEPS,{
                        filter: function(creep){
                            return creep.carry.energy < creep.carryCapacity;

                        }
                    });
                    if(nearestCreep.name){
                        console.log('found ' + droppedResources[name].energy + ' energy at '+droppedResources[name].pos+' and '+nearestCreep.name+' will pick it up!');
                        nearestCreep.memory.iWillTakeIt = true;
                        if (nearestCreep.pickup(droppedResources[name]) === ERR_NOT_IN_RANGE) {
                            nearestCreep.moveTo(droppedResources[name]);
                            nearestCreep.say('👣 => 💰');
                        }
                    }
                }
            }
        }else{
            for(var name in Game.creeps){
                var creep = Game.creeps[name];
                if (creep.memory.iWillTakeIt !== null || creep.carry.energy === creep.carryCapacity) {
                    creep.memory.iWillTakeIt = null;
                }
            }
        }
    }
};
function towerDamageAtRange (range){
    if (range <= TOWER_OPTIMAL_RANGE) { return TOWER_POWER_ATTACK; }
    if (range >= TOWER_FALLOFF_RANGE) { range = TOWER_FALLOFF_RANGE; }
    return TOWER_POWER_ATTACK - (TOWER_POWER_ATTACK * TOWER_FALLOFF *
        (range - TOWER_OPTIMAL_RANGE) / (TOWER_FALLOFF_RANGE - TOWER_OPTIMAL_RANGE))
}

/**
 * Simple benchmark test with sanity check
 *
 * Usage: benchmark([
 *        () => doThing(),
 *        () => doThingAnotherWay(),
 * ]);
 *
 * Output:
 *
 * Benchmark results, 1 loop(s):
 * Time: 1.345, Avg: 1.345, Function: () => doThing()
 * Time: 1.118, Avg: 1.118, Function: () => doThingAnotherWay()
 */
function benchmark(arr, iter = 1) {
    var exp, r, i, j, len = arr.length;
    var start, end, used;
    var results = _.map(arr, (fn) => ({fn: fn.toString(), time: 0, avg: 0}));
    for (j = 0; j < iter; j++) {
        for (i = 0; i < len; i++) {
            start = Game.cpu.getUsed();
            results[i].rtn = arr[i]();
            used = Game.cpu.getUsed() - start;
            if (i > 0 && results[i].rtn != results[0].rtn)
                throw new Error('Results are not the same!');
            results[i].time += used;
        }
    }
    console.log(`Benchmark results, ${iter} loop(s): `);
    _.each(results, (res) => {
        res.avg = _.round(res.time / iter, 3);
        res.time = _.round(res.time, 3);
        console.log(`Time: ${res.time}, Avg: ${res.avg}, Function: ${res.fn}`);
    });
}