/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Market buy orders and mineral/boost purchasing.

 */


const {getDerivedCommodityAmount} = require('termCache');
const {getEffectiveSupply} = require('termNetwork');
const {recordMarketEnergyCost, canAffordSend} = require('termBudget');
const {getInboundPlannedAmount, getEmpireBuyCandidates} = require('termMarket');

const TerminalControl = require('termClass');

/** Combat-oriented boost categories from BOOST_USE. */
const COMBAT_BOOST_TYPES = new Set(['attack', 'ranged_attack', 'heal', 'tough', 'dismantle', 'move']);

function getBoostUseType(resource) {
    if (typeof BOOST_USE === 'undefined' || !BOOST_USE) return null;
    for (const type in BOOST_USE) {
        if (BOOST_USE[type].includes(resource)) return type;
    }
    return null;
}

function isResourceStockLow(candidate, threshold = 0.5) {
    if (candidate.stockRatio != null) return candidate.stockRatio < threshold;
    return true;
}

/**
 * Ally help should only ask for base minerals (stockpile), plus boosts we need right now.
 * Intermediates / peacetime lab pipeline fill should not spam allies.
 */
function collectAllyRequestUrgency() {
    const labBoostNeeds = new Set();
    let combat = false;
    let upgrade = false;
    let build = false;

    for (const name of MY_ROOMS) {
        const room = Game.rooms[name];
        if (!room) continue;

        if (room.level < 8) {
            upgrade = true;
            build = true;
        }
        if (room.constructionSites && room.constructionSites.length) build = true;

        if (room.memory.dangerousAttack) combat = true;
        const intel = typeof INTEL !== 'undefined' ? INTEL[name] : null;
        if (intel && intel.threatLevel > 0) combat = true;

        for (const lab of room.labs || []) {
            const boost = lab.memory && lab.memory.neededBoost;
            if (!boost) continue;
            labBoostNeeds.add(boost);
            const t = getBoostUseType(boost);
            if (t && COMBAT_BOOST_TYPES.has(t)) combat = true;
            if (t === 'upgrade') upgrade = true;
            if (t === 'build') build = true;
        }
    }

    if (!combat && typeof CREEP_QUEUES !== 'undefined') {
        for (const queueName in CREEP_QUEUES) {
            const queue = CREEP_QUEUES[queueName];
            if (!queue || typeof queue !== 'object') continue;
            for (const key in queue) {
                const entry = queue[key];
                if (!entry) continue;
                const isCombat = entry.military
                    || (typeof COMBAT_ROLES !== 'undefined' && COMBAT_ROLES.includes(entry.role));
                if (isCombat) {
                    combat = true;
                    break;
                }
            }
            if (combat) break;
        }
    }

    return {labBoostNeeds, combat, upgrade, build};
}

function shouldRequestAllyResource(mineral, candidate, urgency) {
    if (BASE_MINERALS.includes(mineral)) return true;

    const boostType = getBoostUseType(mineral);
    if (!boostType) return false;

    // Creeps are reserved against labs for this exact boost — pull ASAP if low.
    if (urgency.labBoostNeeds.has(mineral)) {
        return isResourceStockLow(candidate, 0.75);
    }

    if (!isResourceStockLow(candidate, 0.5)) return false;

    if (COMBAT_BOOST_TYPES.has(boostType)) return urgency.combat;
    if (boostType === 'upgrade') return urgency.upgrade;
    if (boostType === 'build') return urgency.build;
    return false;
}

Object.assign(TerminalControl.prototype, {

    placeBuyOrders(terminal, globalOrders, myOrders) {
        const labs = terminal.room.labs || [];
        const labNeeds = _.compact(labs.map(l => l.memory.itemNeeded));
        const buyCandidates = shuffle(getEmpireBuyCandidates());
        const allyUrgency = collectAllyRequestUrgency();

        for (const candidate of buyCandidates) {
            const mineral = candidate.resource;
            if (mineral === RESOURCE_ENERGY || mineral === RESOURCE_BATTERY) continue;

            const target = REACTION_AMOUNT;
            const isLabNeed = candidate.isLabNeed;

            const inbound = getInboundPlannedAmount(terminal.room.name, mineral);
            const adjustedStored = getEffectiveSupply(mineral) + inbound;
            const hubFree = terminal.store.getFreeCapacity(mineral);
            let buyAmount = Math.min(candidate.deficit, REACTION_AMOUNT, hubFree);
            if (buyAmount < 100) continue;

            if (!isLabNeed && (['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) || MY_MINERALS[mineral])) {
                buyAmount = Math.min(buyAmount, target * 0.5);
            }

            // Ally requests: base minerals always; boosts only when urgently needed and low.
            if (ALLY_HELP_REQUESTS[MY_USERNAME]) {
                const requests = ALLY_HELP_REQUESTS[MY_USERNAME].requests || {};
                let resourceRequests = requests.resource ? requests.resource : [];
                resourceRequests = resourceRequests.filter((r) =>
                    (r.resourceType !== mineral && r.roomName === terminal.room.name) || r.roomName !== terminal.room.name
                );
                if (shouldRequestAllyResource(mineral, candidate, allyUrgency)) {
                    const isAsapBoost = !BASE_MINERALS.includes(mineral);
                    resourceRequests.push({
                        resourceType: mineral,
                        amount: buyAmount,
                        priority: isAsapBoost ? 0.9 : (isLabNeed ? 0.5 : 0.2),
                        roomName: terminal.room.name
                    });
                }
                ALLY_HELP_REQUESTS[MY_USERNAME].requests.resource = resourceRequests;
            }

            if (Game.market.credits < CREDIT_BUFFER * 0.6 && !isLabNeed) continue;
            if (this.getCreditTrend() < 0 && !isLabNeed) continue;

            const activeBuyOrder = _.find(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === mineral && o.type === ORDER_BUY);
            if (!MY_MINERALS[mineral]) {
                const histAvg = parseFloat(latestMarketHistory(mineral).avg) || 1;
                const mineralBuyOrders = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_BUY && o.remainingAmount >= 50 && !MY_ROOMS.includes(o.roomName));
                const sortedMineralPrices = mineralBuyOrders.map(o => o.price).sort((a, b) => a - b);
                const p90mineral = sortedMineralPrices.length ? sortedMineralPrices[Math.floor(sortedMineralPrices.length * 0.9)] : null;
                const avgPrice = p90mineral ? Math.min(histAvg, p90mineral) : histAvg;
                const stockRatio = candidate.stockRatio != null ? candidate.stockRatio : adjustedStored / target;
                const baseMult = (isLabNeed && adjustedStored < 500) ? 0.95
                    : stockRatio < 0.25 ? 0.88
                        : stockRatio < 0.5 ? 0.82
                            : 0.75;
                const escalationTicks = (isLabNeed && adjustedStored < 500) ? 5000
                    : stockRatio < 0.25 ? 20000
                        : 50000;
                const mineralOrderAge = activeBuyOrder ? Game.time - activeBuyOrder.created : 0;
                const ageMult = Math.min(1.0, baseMult + (mineralOrderAge / escalationTicks) * (1.0 - baseMult));
                const targetPrice = avgPrice * ageMult;
                if (!activeBuyOrder) {
                    buyAmount = Math.min(buyAmount, REACTION_AMOUNT);
                    if (createBuyOrder(mineral, targetPrice, buyAmount)) break;
                } else if (Math.abs(activeBuyOrder.price - targetPrice) > 0.02 * avgPrice) {
                    Game.market.changeOrderPrice(activeBuyOrder.id, targetPrice);
                }
            }

            let acceptableMarkup = adjustedStored < (target * 0.25) ? getAcceptableMarkup(mineral, activeBuyOrder) * 1.5 : getAcceptableMarkup(mineral, activeBuyOrder);
            if (isLabNeed && adjustedStored < 500) acceptableMarkup *= 1.5;

            let sellOrder = _.min(globalOrders.filter(order => order.resourceType === mineral &&
                order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName) && order.price <= latestMarketHistory(mineral).avg * acceptableMarkup), 'price');
            if (sellOrder && sellOrder.id) {
                if (sellOrder.remainingAmount < buyAmount) buyAmount = Math.min(buyAmount, sellOrder.remainingAmount);
                if (sellOrder.price * buyAmount > Memory._banker.spendingAccount) buyAmount = _.floor(Memory._banker.spendingAccount / sellOrder.price);
                if (buyAmount >= 100) {
                    const txCost = Game.market.calcTransactionCost(buyAmount, terminal.room.name, sellOrder.roomName);
                    if (!canAffordSend(txCost)) continue;
                    if (Game.market.deal(sellOrder.id, buyAmount, terminal.room.name) === OK) {
                        recordMarketEnergyCost(terminal.room.name, txCost);
                        const dealCost = sellOrder.price * buyAmount;
                        log.w(`Bought ${buyAmount} ${mineral} for ${dealCost} credits in ${roomLink(terminal.room.name)} ${isLabNeed ? '(LAB NEED)' : ''}`, "Market: ");
                        Memory._banker.spendingAccount -= dealCost;
                        this.recordBankerDeal('buy', mineral, buyAmount, dealCost);
                        break;
                    }
                }
            }
        }

        const empireLabNeeds = new Set(labNeeds);
        for (const name of MY_ROOMS) {
            const room = Game.rooms[name];
            if (!room) continue;
            for (const lab of room.labs || []) {
                if (lab.memory?.itemNeeded) empireLabNeeds.add(lab.memory.itemNeeded);
            }
        }

        for (const t1boost of TIER_1_BOOSTS) {
            if (!empireLabNeeds.has(t1boost)) continue;
            const components = BOOST_COMPONENTS[t1boost];
            if (!components || !components.every(c => BASE_MINERALS.includes(c))) continue;

            const stored = getResourceTotal(t1boost) || 0;
            if (stored >= REACTION_AMOUNT) continue;
            if (_.some(myOrders, o => o.roomName === terminal.room.name && o.resourceType === t1boost && o.type === ORDER_BUY)) continue;

            const t1Avg = latestMarketHistory(t1boost).avg;
            const rawCost = components.reduce((sum, c) => sum + (latestMarketHistory(c).avg || 0), 0);
            if (!t1Avg || !rawCost || t1Avg >= rawCost) continue;

            const buyAmount = Math.min(REACTION_AMOUNT - stored, REACTION_AMOUNT);

            const cheapSell = _.min(
                globalOrders.filter(o => o.resourceType === t1boost && o.type === ORDER_SELL &&
                    !_.includes(MY_ROOMS, o.roomName) && o.price < rawCost),
                'price'
            );
            if (cheapSell && cheapSell.id) {
                let amount = Math.min(buyAmount, cheapSell.remainingAmount);
                if (cheapSell.price * amount > Memory._banker.spendingAccount) amount = Math.floor(Memory._banker.spendingAccount / cheapSell.price);
                if (amount >= 100) {
                    const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, cheapSell.roomName);
                    if (!canAffordSend(txCost)) continue;
                    if (Game.market.deal(cheapSell.id, amount, terminal.room.name) === OK) {
                        recordMarketEnergyCost(terminal.room.name, txCost);
                        log.w(`Bought ${amount} ${t1boost} at ${cheapSell.price}/u (raw cost: ${rawCost.toFixed(3)}/u) in ${roomLink(terminal.room.name)}`, "Market: ");
                        Memory._banker.spendingAccount -= cheapSell.price * amount;
                        return true;
                    }
                }
            }

            const price = Math.min(this.calculatePrice(ORDER_BUY, t1boost), rawCost * 0.98);
            if (createBuyOrder(t1boost, price, buyAmount)) return true;
        }

        if (BUY_ENERGY && terminal.room.energyState < 2 && Game.market.credits > BUY_ENERGY_CREDIT_BUFFER) {
            const histAvg = parseFloat(latestMarketHistory(RESOURCE_ENERGY).avg) || 1;
            const currentEnergyBuyOrders = globalOrders.filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && o.remainingAmount >= 500 && !MY_ROOMS.includes(o.roomName));
            const sortedBuyPrices = currentEnergyBuyOrders.map(o => o.price).sort((a, b) => a - b);
            const p90 = sortedBuyPrices.length ? sortedBuyPrices[Math.floor(sortedBuyPrices.length * 0.9)] : null;
            const refPrice = p90 ? Math.min(histAvg, p90) : histAvg;
            const isCritical = !terminal.room.energyState && Game.market.credits > BUY_ENERGY_CREDIT_BUFFER * 2;
            const existingOrder = _.find(myOrders, o => o.resourceType === RESOURCE_ENERGY && o.roomName === terminal.room.name);
            const orderAge = existingOrder ? Game.time - existingOrder.created : 0;
            const baseMult = isCritical ? 1 : 0.75;
            const escalationTicks = isCritical ? 25000 : 50000;
            const ageMult = Math.min(1.0, baseMult + (orderAge / escalationTicks) * (1.0 - baseMult));
            const targetPrice = refPrice * ageMult;
            if (!existingOrder) {
                if (createBuyOrder(RESOURCE_ENERGY, targetPrice, isCritical ? 10000 : 5000)) return true;
            } else if (Math.abs(existingOrder.price - targetPrice) > 0.02 * refPrice) {
                Game.market.changeOrderPrice(existingOrder.id, targetPrice);
            }
        }

        let healthySurplus = Game.market.credits > (BUY_ENERGY_CREDIT_BUFFER * 1.5) && (Memory._banker.creditTrend > 0 || Game.market.credits > BUY_ENERGY_CREDIT_BUFFER * 3);
        if (healthySurplus) {
            let price;
            if (BUY_THESE_BOOSTS && BUY_THESE_BOOSTS.length) {
                for (let mineral of shuffle(BUY_THESE_BOOSTS)) {
                    const activeBuyOrder = _.some(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === mineral && o.type === ORDER_BUY)
                    if (activeBuyOrder) continue;
                    let stored = getResourceTotal(mineral) || 0;
                    const dutyScale = Math.min(1, Math.max(0.5, terminal.room.memory.energyInfo && terminal.room.memory.energyInfo.upgraderDuty != null ? terminal.room.memory.energyInfo.upgraderDuty : 1));
                    const boostTarget = BOOST_AMOUNT(terminal.room, mineral) * MY_ROOMS.length * dutyScale;
                    if (stored < boostTarget) {
                        let buyAmount = Math.min(boostTarget - stored, REACTION_AMOUNT);
                        price = this.calculatePrice(ORDER_BUY, mineral);
                        if (createBuyOrder(mineral, price, buyAmount)) break;
                    }
                }
            }
        }

        function createBuyOrder(resourceType, price, buyAmount) {
            if (buyAmount <= 0) return false;
            if (Game.market.createOrder({
                type: ORDER_BUY,
                resourceType: resourceType,
                price: price,
                totalAmount: buyAmount,
                roomName: terminal.pos.roomName
            }) === OK) {
                log.w(`New Buy Order: ${resourceType} at/per ${price} in ${roomLink(terminal.room.name)}`, "Market: ");
                return true;
            }
            return false;
        }

        function getAcceptableMarkup(resourceType, activeBuyOrder) {
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