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