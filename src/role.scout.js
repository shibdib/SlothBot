/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    creep.scoutRoom();
    hud(creep);
};

function hud(creep) {
    try {
        let destination = creep.memory.destination || creep.room.name;
        Game.map.visual.text('Scout Inbound', new RoomPosition(40, 2, destination), {
            color: '#d68000',
            fontSize: 3,
            align: 'left'
        });
        if (destination !== creep.room.name && creep.memory._shibMove && creep.memory._shibMove.route) {
            let route = [];
            for (let routeRoom of creep.memory._shibMove.route) {
                if (routeRoom === creep.room.name) route.push(new RoomPosition(creep.pos.x, creep.pos.y, routeRoom));
                else route.push(new RoomPosition(25, 25, routeRoom));
            }
            for (let posNumber = 0; posNumber++; posNumber < route.length) {
                Game.map.visual.line(route[posNumber], route[posNumber + 1])
            }
        }
    } catch (e) {
    }
}