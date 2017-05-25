module.exports.buildWalls = function (spawn) {
    for (let i = 2; i < 47; i++) {
        if (Game.constructionSites.length > 75) {
            return null;
        }
        let pos = new RoomPosition(47, i, spawn.room.name);
        const look = pos.look();
        look.forEach(function (lookObject) {
            if (lookObject[LOOK_TERRAIN] !== 'wall') {
                if (!lookObject[LOOK_CONSTRUCTION_SITES] && !lookObject[LOOK_STRUCTURES]) {
                    if (i & 1) {
                        pos.createConstructionSite(STRUCTURE_WALL);// ODD
                    }
                    else {
                        pos.createConstructionSite(STRUCTURE_RAMPART);// EVEN
                    }
                }
            }
        });
    }
};