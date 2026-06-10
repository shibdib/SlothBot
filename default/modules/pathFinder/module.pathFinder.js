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
    getSquadMatrix: pathFormation.getSquadMatrix,
    getFormationVectors: pathFormation.getFormationVectors,
    findRoute: pathRoute.findRoute,
    deleteRoute: pathRoute.deleteRoute,
    getRoute: pathRoute.getRoute,
    estimateClaimRouteTicks: pathRoute.estimateClaimRouteTicks,
    routeWithinClaimTTL: pathRoute.routeWithinClaimTTL,
};