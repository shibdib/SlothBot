/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 *
 * Facade for the pathfinding subsystem. Implementation lives in ./pathFinder/.
 * require.js loads this module for prototype side-effects.
 */

require('pathPrototypes');

const pathFormation = require('pathFormation');
const pathRoute = require('pathRoute');

module.exports = {
    QUAD_FOLLOWER_OFFSETS: pathFormation.QUAD_FOLLOWER_OFFSETS,
    followerOffsets: pathFormation.followerOffsets,
    getSquadMatrix: pathFormation.getSquadMatrix,
    getFormationVectors: pathFormation.getFormationVectors,
    formationRange: pathFormation.formationRange,
    posAfterMove: pathFormation.posAfterMove,
    offsetPos: pathFormation.offsetPos,
    tileBlocked: pathFormation.tileBlocked,
    isFootprintWalkable: pathFormation.isFootprintWalkable,
    exitDirectionTo: pathFormation.exitDirectionTo,
    isQuadCreep: pathFormation.isQuadCreep,
    isSquadCreep: pathFormation.isSquadCreep,
    wouldEnterDest: pathFormation.wouldEnterDest,
    findRoute: pathRoute.findRoute,
    deleteRoute: pathRoute.deleteRoute,
    getRoute: pathRoute.getRoute,
    routeDistance: pathRoute.routeDistance,
    estimateClaimRouteTicks: pathRoute.estimateClaimRouteTicks,
    routeWithinClaimTTL: pathRoute.routeWithinClaimTTL,
    exitHopTarget: pathRoute.exitHopTarget,
};