/**
 * Created by Bob on 5/23/2017.
 */

module.exports.convertPath = function (path)
{
    const result = [];
    for (let i = 0; i + 1 < path.length; i++) {
        const pos = path[i];
        const rel = path[i + 1];
        let dir = pos.getDirectionTo(rel);
        if (pos.roomName !== rel.roomName) {
            dir = (dir + 4) & 7;
        }
        result.push({
            x: pos.x,
            y: pos.y,
            direction: dir,
        });
    }
    return result;
};

module.exports.checkPos = function (pos) {
    let atPos = pos.look();
    let SWAMP = "swamp";
    let PLAIN = "plain";
    for (let i = 0; i < atPos.length; i++) {
        switch (atPos[i].type) {
            case LOOK_TERRAIN:
                if (atPos[i].terrain !== PLAIN && atPos[i].terrain !== SWAMP)
                    return false;
                break;
            case LOOK_STRUCTURES:
                if (OBSTACLE_OBJECT_TYPES.includes(atPos[i].structure.structureType))
                    return false;
                break;
            case LOOK_CREEPS:
            case LOOK_SOURCES:
            case LOOK_MINERALS:
            case LOOK_NUKES:
            case LOOK_ENERGY:
            case LOOK_RESOURCES:
            case LOOK_FLAGS:
            case LOOK_CONSTRUCTION_SITES:
            default:
        }
    }
    return true;
};