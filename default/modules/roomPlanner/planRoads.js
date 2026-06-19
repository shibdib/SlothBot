/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Legacy facade — owned-room roads live in planOwnedRoads.js.
 */

const {
    planOwnedRoomRoads,
    getRoadOrigin,
    isRoadPlanComplete,
} = require('planOwnedRoads');

module.exports = {
    roadBuilder: planOwnedRoomRoads,
    getRoadOrigin,
    layoutRoadsComplete: isRoadPlanComplete,
    hasPendingRoadWork: room => !isRoadPlanComplete(room),
};