/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Market buy orders for base minerals and bars. Boosts are never purchased.

 */


const {getEffectiveSupply} = require('termNetwork');
const {recordMarketEnergyCost, canAffordSend} = require('termBudget');
const {
    getInboundPlannedAmount,
    getEmpireBuyCandidates,
    shouldProcureResource,
    isCompressedBar,
    maxBarBuyPrice
} = require('termMarket');
const {hasRoomOrder, recordCreatedOrder} = require('termCache');
const {empireHasSpareBoostType} = require('termKeep');
const FactoryControl = require('module.factoryController');

const TerminalControl = require('termClass');

/** Combat-oriented boost categories from BOOST_USE. */
const COMBAT_BOOST_TYPES = new Set(['attack', 'ranged_attack', 'heal', 'tough', 'dismantle', 'move']);
const ALLY_COMBAT_BOOST_AMOUNT = 10000;

function getBoostUseType(resource) {
    if (typeof BOOST_USE === 'undefined' || !BOOST_USE) return null;
    for (const type in BOOST_USE) {
        if (BOOST_USE[type].includes(resource)) return type;
    }
    return null;
}

function isCombatRole(entry) {
    if (!entry) return false;
    if (entry.military) return true;
    return typeof COMBAT_ROLES !== 'undefined' && COMBAT_ROLES.includes(entry.role);
}

function addCombatBoostPart(parts, part) {
    if (!part) return;
    if (COMBAT_BOOST_TYPES.has(part)) parts.add(part);
}

function addCombatBoostParts(parts, list) {
    if (!list) return;
    for (let i = 0; i < list.length; i++) addCombatBoostPart(parts, list[i]);
}

/**
 * Combat boost types we actually need for offensive/defensive ops, plus any
 * specific resources already reserved on labs.
 */
function collectMilitaryBoostNeed() {
    const parts = new Set();

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room) continue;
        if (room.memory.dangerousAttack || room.memory.earlyWarning) {
            addCombatBoostPart(parts, ATTACK);
            addCombatBoostPart(parts, RANGED_ATTACK);
            addCombatBoostPart(parts, HEAL);
            addCombatBoostPart(parts, TOUGH);
        }
        for (const lab of room.labs || []) {
            const boost = lab.memory && lab.memory.neededBoost;
            if (!boost) continue;
            const t = getBoostUseType(boost);
            if (t && COMBAT_BOOST_TYPES.has(t)) parts.add(t);
        }
    }

    if (typeof CREEP_QUEUES !== 'undefined' && CREEP_QUEUES) {
        for (const queueName in CREEP_QUEUES) {
            const queue = CREEP_QUEUES[queueName];
            if (!queue || typeof queue !== 'object') continue;
            for (const key in queue) {
                const entry = queue[key];
                if (!isCombatRole(entry)) continue;
                addCombatBoostParts(parts, entry.misc && entry.misc.boosts);
            }
        }
    }

    const opBuckets = [Memory.targetRooms, Memory.auxiliaryTargets];
    for (let b = 0; b < opBuckets.length; b++) {
        const mem = opBuckets[b];
        if (!mem) continue;
        for (const roomName in mem) {
            const op = mem[roomName];
            if (!op) continue;
            addCombatBoostParts(parts, op.boosts);
            addCombatBoostParts(parts, op.optionalBoosts);
        }
    }

    return {parts};
}

/**
 * Ally help asks for base minerals always. Boosts only when a military op
 * needs them and we have nothing in-empire to ship.
 */
function collectMilitaryBoostAllyRequests(roomName) {
    const rows = [];
    if (typeof BOOST_USE === 'undefined' || !BOOST_USE) return rows;

    const need = collectMilitaryBoostNeed();
    const requested = new Set();

    const push = (resource) => {
        if (!resource || requested.has(resource)) return;
        requested.add(resource);
        rows.push({
            resourceType: resource,
            amount: ALLY_COMBAT_BOOST_AMOUNT,
            priority: 0.9,
            roomName,
            terminal: true
        });
    };

    for (const part of need.parts) {
        if (empireHasSpareBoostType(part)) continue;
        const tiers = BOOST_USE[part];
        if (tiers && tiers[0]) push(tiers[0]);
    }

    return rows;
}

function isAllyBoostRequest(resourceType) {
    if (!resourceType) return false;
    if (typeof ALL_BOOSTS !== 'undefined' && ALL_BOOSTS.includes(resourceType)) return true;
    return !!getBoostUseType(resourceType);
}

function publishAllyResourceRequests(terminal, mineralAdds) {
    if (!ALLY_HELP_REQUESTS[MY_USERNAME]) return;
    const bucket = ALLY_HELP_REQUESTS[MY_USERNAME].requests || (ALLY_HELP_REQUESTS[MY_USERNAME].requests = {});
    let resourceRequests = bucket.resource ? bucket.resource : [];
    resourceRequests = resourceRequests.filter((r) => r.roomName !== terminal.room.name);
    for (let i = 0; i < mineralAdds.length; i++) resourceRequests.push(mineralAdds[i]);
    const combatBoosts = collectMilitaryBoostAllyRequests(terminal.room.name);
    for (let i = 0; i < combatBoosts.length; i++) resourceRequests.push(combatBoosts[i]);
    bucket.resource = resourceRequests;
}

function syncAllyBoostRequests() {
    if (!ALLY_HELP_REQUESTS || !ALLY_HELP_REQUESTS[MY_USERNAME]) return;
    const hub = Memory._banker && Memory._banker.marketHub;
    if (!hub) return;
    const bucket = ALLY_HELP_REQUESTS[MY_USERNAME].requests;
    if (!bucket || !Array.isArray(bucket.resource)) return;
    bucket.resource = bucket.resource.filter((r) => r && r.roomName === hub && !isAllyBoostRequest(r.resourceType));
    const combatBoosts = collectMilitaryBoostAllyRequests(hub);
    for (let i = 0; i < combatBoosts.length; i++) bucket.resource.push(combatBoosts[i]);
}

Object.assign(TerminalControl.prototype, {

    placeBuyOrders(terminal, globalOrders, myOrders) {
        const buyCandidates = shuffle(getEmpireBuyCandidates());
        const allyMineralAdds = [];

        for (const candidate of buyCandidates) {
            const mineral = candidate.resource;
            if (!shouldProcureResource(mineral, candidate)) continue;

            const target = REACTION_AMOUNT;
            const isLabNeed = candidate.isLabNeed;
            const extreme = !!candidate.extreme;

            const inbound = getInboundPlannedAmount(terminal.room.name, mineral);
            const adjustedStored = getEffectiveSupply(mineral) + inbound;
            const hubFree = terminal.store.getFreeCapacity(mineral);
            let buyAmount = Math.min(candidate.deficit, REACTION_AMOUNT, hubFree);
            if (buyAmount < 100) continue;

            const publicShard = ['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name);
            if (!isLabNeed && !extreme && publicShard) {
                buyAmount = Math.min(buyAmount, target * 0.5);
            }

            if (BASE_MINERALS.includes(mineral)) {
                allyMineralAdds.push({
                    resourceType: mineral,
                    amount: buyAmount,
                    priority: isLabNeed || extreme ? 0.5 : 0.2,
                    roomName: terminal.room.name,
                    terminal: true
                });
            }

            if (Game.market.credits < CREDIT_BUFFER * 0.6 && !isLabNeed && !extreme) continue;
            if (this.getCreditTrend() < 0 && !isLabNeed && !extreme) continue;

            const activeBuyOrder = _.find(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === mineral && o.type === ORDER_BUY);
            const histAvg = parseFloat(latestMarketHistory(mineral).avg) || 1;
            const mineralBuyOrders = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_BUY && o.remainingAmount >= 50 && !MY_ROOMS.includes(o.roomName));
            const sortedMineralPrices = mineralBuyOrders.map(o => o.price).sort((a, b) => a - b);
            const p90mineral = sortedMineralPrices.length ? sortedMineralPrices[Math.floor(sortedMineralPrices.length * 0.9)] : null;
            const avgPrice = p90mineral ? Math.min(histAvg, p90mineral) : histAvg;
            const stockRatio = candidate.stockRatio != null ? candidate.stockRatio : adjustedStored / target;
            const baseMult = (isLabNeed && adjustedStored < 500) || extreme ? 0.95
                : stockRatio < 0.25 ? 0.88
                    : stockRatio < 0.5 ? 0.82
                        : 0.75;
            const escalationTicks = (isLabNeed && adjustedStored < 500) || extreme ? 5000
                : stockRatio < 0.25 ? 20000
                    : 50000;
            const mineralOrderAge = activeBuyOrder ? Game.time - activeBuyOrder.created : 0;
            const ageMult = Math.min(1.0, baseMult + (mineralOrderAge / escalationTicks) * (1.0 - baseMult));
            let targetPrice = avgPrice * ageMult;
            const barCap = isCompressedBar(mineral) ? maxBarBuyPrice(mineral, globalOrders) : 0;
            if (isCompressedBar(mineral)) {
                if (!(barCap > 0)) continue;
                targetPrice = Math.min(targetPrice, barCap * 0.99);
                if (!(targetPrice < barCap)) continue;
            }
            if (!activeBuyOrder) {
                buyAmount = Math.min(buyAmount, REACTION_AMOUNT);
                if (createBuyOrder(mineral, targetPrice, buyAmount)) break;
            } else if (!activeBuyOrder.pending && Math.abs(activeBuyOrder.price - targetPrice) > 0.02 * avgPrice) {
                Game.market.changeOrderPrice(activeBuyOrder.id, targetPrice);
            }

            let acceptableMarkup = getAcceptableMarkup(activeBuyOrder);
            if (adjustedStored < target * 0.25 || extreme) acceptableMarkup *= 1.5;
            if (isLabNeed && adjustedStored < 500) acceptableMarkup *= 1.5;

            let sellOrder = _.min(globalOrders.filter(order => order.resourceType === mineral &&
                order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName)
                && (!barCap || order.price < barCap)
                && order.price <= latestMarketHistory(mineral).avg * acceptableMarkup), 'price');
            if (sellOrder && sellOrder.id) {
                if (sellOrder.remainingAmount < buyAmount) buyAmount = Math.min(buyAmount, sellOrder.remainingAmount);
                if (sellOrder.price * buyAmount > Memory._banker.spendingAccount) buyAmount = _.floor(Memory._banker.spendingAccount / sellOrder.price);
                if (buyAmount >= 100) {
                    const txCost = Game.market.calcTransactionCost(buyAmount, terminal.room.name, sellOrder.roomName);
                    if (!canAffordSend(txCost)) continue;
                    if (Game.market.deal(sellOrder.id, buyAmount, terminal.room.name) === OK) {
                        recordMarketEnergyCost(terminal.room.name, txCost);
                        const dealCost = sellOrder.price * buyAmount;
                        const why = extreme ? '(SHORTAGE)' : isLabNeed ? '(LAB NEED)' : '';
                        log.w(`Bought ${buyAmount} ${mineral} for ${dealCost} credits in ${roomLink(terminal.room.name)} ${why}`, "Market: ");
                        Memory._banker.spendingAccount -= dealCost;
                        this.recordBankerDeal('buy', mineral, buyAmount, dealCost);
                        break;
                    }
                }
            }
        }

        publishAllyResourceRequests(terminal, allyMineralAdds);

        // CRIT only. LOW rooms unpack batteries / take empire energy instead of locking credits.
        if (BUY_ENERGY && !terminal.room.energyState && Game.market.credits > BUY_ENERGY_CREDIT_BUFFER
            && terminal.room.store(RESOURCE_BATTERY) < FactoryControl.batteryBatchCost()) {
            const histAvg = parseFloat(latestMarketHistory(RESOURCE_ENERGY).avg) || 1;
            const currentEnergyBuyOrders = globalOrders.filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && o.remainingAmount >= 500 && !MY_ROOMS.includes(o.roomName));
            const sortedBuyPrices = currentEnergyBuyOrders.map(o => o.price).sort((a, b) => a - b);
            const p90 = sortedBuyPrices.length ? sortedBuyPrices[Math.floor(sortedBuyPrices.length * 0.9)] : null;
            const refPrice = p90 ? Math.min(histAvg, p90) : histAvg;
            const existingOrder = _.find(myOrders, o => o.resourceType === RESOURCE_ENERGY && o.roomName === terminal.room.name && o.type === ORDER_BUY);
            const orderAge = existingOrder ? Game.time - existingOrder.created : 0;
            const ageMult = Math.min(1.0, 0.85 + (orderAge / 25000) * 0.15);
            const targetPrice = refPrice * ageMult;
            if (!existingOrder) {
                if (createBuyOrder(RESOURCE_ENERGY, targetPrice, 10000)) return true;
            } else if (!existingOrder.pending && Math.abs(existingOrder.price - targetPrice) > 0.02 * refPrice) {
                Game.market.changeOrderPrice(existingOrder.id, targetPrice);
            }
        }

        function createBuyOrder(resourceType, price, buyAmount) {
            if (buyAmount <= 0) return false;
            if (hasRoomOrder(myOrders, terminal.pos.roomName, resourceType, ORDER_BUY)) return false;
            const spec = {
                type: ORDER_BUY,
                resourceType: resourceType,
                price: price,
                totalAmount: buyAmount,
                roomName: terminal.pos.roomName
            };
            if (Game.market.createOrder(spec) === OK) {
                recordCreatedOrder(spec);
                log.w(`New Buy Order: ${resourceType} at/per ${price} in ${roomLink(terminal.room.name)}`, "Market: ");
                return true;
            }
            return false;
        }

        function getAcceptableMarkup(activeBuyOrder) {
            let markup = 1.2;
            if (activeBuyOrder) {
                const timeElapsed = Game.time - activeBuyOrder.created;
                const cooldown = ['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) ? 10000 : 10;
                markup = Math.min(1.0 + (timeElapsed / cooldown), 2.0);
            }
            return markup;
        }
    }

});

module.exports = {syncAllyBoostRequests};