/**
 * Created by rober on 5/16/2017.
 */

const autoBuild = {
    /** @param  {Spawn} spawn  **/
    run: function () {

        //Auto Build Containers
        //Lower source
        var pos = new RoomPosition(35, 29, 'E41N96');
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0){
            console.log('Building Container:' + pos);
            pos.createConstructionSite(STRUCTURE_CONTAINER);
        }
        var pos = new RoomPosition(35, 30, 'E41N96');
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0){
            console.log('Building Container:' + pos);
            pos.createConstructionSite(STRUCTURE_CONTAINER);
        }
        //Upper source
        var pos = new RoomPosition(23, 9, 'E41N96');
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0){
            console.log('Building Container:' + pos);
            pos.createConstructionSite(STRUCTURE_CONTAINER);
        }
        var pos = new RoomPosition(23, 10, 'E41N96');
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0){
            console.log('Building Container:' + pos);
            pos.createConstructionSite(STRUCTURE_CONTAINER);
        }
        var pos = new RoomPosition(23, 8, 'E41N96');
        if (pos.lookFor(LOOK_STRUCTURES).length === 0 && pos.lookFor(LOOK_CONSTRUCTION_SITES).length === 0){
            console.log('Building Container:' + pos);
            pos.createConstructionSite(STRUCTURE_CONTAINER);
        }
    }
};

module.exports = autoBuild;
