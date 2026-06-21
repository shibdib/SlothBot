/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Re-exports owned-room road planning (implementation in planOwnedRoads.js).
 */

const owned = require('planOwnedRoads');

module.exports = {
    roadBuilder: owned.planOwnedRoomRoads,
    getRoadOrigin: owned.getRoadOrigin,
    layoutRoadsComplete: owned.isRoadPlanComplete,
    hasPendingRoadWork: room => !owned.isRoadPlanComplete(room),
};