/*

 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.

 *

 * Market buy orders and mineral/boost purchasing.

 */


const state = require('termState');
const {getDerivedCommodityAmount} = require('termCache');

const TerminalControl = require('termClass');


Object.assign(TerminalControl.prototype, {

    placeBuyOrders(terminal, globalOrders, myOrders) {
        // Iterate over minerals and handle orders
        const labs = terminal.room.labs;
        const labNeeds = _.compact(labs.map(l => l.memory.itemNeeded));

        for (let mineral of shuffle(_.union(BASE_MINERALS, labNeeds))) {
            if (mineral === RESOURCE_ENERGY || mineral === RESOURCE_BATTERY) continue;

            let target = REACTION_AMOUNT;
            const isLabNeed = labNeeds.includes(mineral);

            let stored = terminal.room.store(mineral) + getDerivedCommodityAmount(terminal.room, mineral);
            let buyAmount = Math.min(target - stored, REACTION_AMOUNT);

            // Don't buy from the market if other rooms have enough to route here
            if (stored < target && getResourceTotal(mineral) * (MY_ROOMS.length * 2) >= target) continue;

            if (stored < target && buyAmount > 0) {
                let price;

                // On demand buy a small amount on mmo shards or buy a larger amount on private servers
                if (!isLabNeed && (['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) || MY_MINERALS[mineral])) target = target * 0.5;

                if (stored < target) {
                    // Allied requests...
                    const requests = ALLY_HELP_REQUESTS[MY_USERNAME] ? ALLY_HELP_REQUESTS[MY_USERNAME].requests : {};
                    let resourceRequests = requests.resource ? requests.resource : [];
                    if (resourceRequests && ALLY_HELP_REQUESTS[MY_USERNAME]) {
                        resourceRequests = resourceRequests.filter((r) => (r.resourceType !== mineral && r.roomName === terminal.room.name) || r.roomName !== terminal.room.name);
                        resourceRequests.push({
                            resourceType: mineral,
                            amount: buyAmount,
                            priority: isLabNeed ? 0.8 : 0.2,
                            roomName: terminal.room.name
                        });
                        ALLY_HELP_REQUESTS[MY_USERNAME].requests.resource = resourceRequests;
                    }

                    if (Game.market.credits < CREDIT_BUFFER * 0.6 && !isLabNeed) continue;
                    if (this.getCreditTrend() < 0 && !isLabNeed) continue;

                    // Buy orders â€” tiered price by urgency, repriced if stock level changes
                    const activeBuyOrder = _.find(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === mineral && o.type === ORDER_BUY);
                    if (!MY_MINERALS[mineral]) {
                        const histAvg = parseFloat(latestMarketHistory(mineral).avg) || 1;
                        const mineralBuyOrders = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_BUY && o.remainingAmount >= 50 && !MY_ROOMS.includes(o.roomName));
                        const sortedMineralPrices = mineralBuyOrders.map(o => o.price).sort((a, b) => a - b);
                        const p90mineral = sortedMineralPrices.length ? sortedMineralPrices[Math.floor(sortedMineralPrices.length * 0.9)] : null;
                        const avgPrice = p90mineral ? Math.min(histAvg, p90mineral) : histAvg;
                        const stockRatio = stored / target;
                        const baseMult = (isLabNeed && stored < 500) ? 0.95
                            : stockRatio < 0.25 ? 0.88
                                : stockRatio < 0.5 ? 0.82
                                    : 0.75;
                        const escalationTicks = (isLabNeed && stored < 500) ? 5000
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

                    // Be more willing to pay a higher markup if we are desperately low or labs are stalled
                    let acceptableMarkup = stored < (target * 0.25) ? getAcceptableMarkup(mineral, activeBuyOrder) * 1.5 : getAcceptableMarkup(mineral, activeBuyOrder);
                    if (isLabNeed && stored < 500) acceptableMarkup *= 1.5;

                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === mineral &&
                        order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName) && order.price <= latestMarketHistory(mineral).avg * acceptableMarkup), 'price');
                    if (sellOrder && sellOrder.id) {
                        if (sellOrder.amount < buyAmount) buyAmount = Math.min(buyAmount, sellOrder.amount);
                        if (sellOrder.price * buyAmount > Memory._banker.spendingAccount) buyAmount = _.floor(Memory._banker.spendingAccount / sellOrder.price);
                        if (buyAmount >= 100) {
                            if (Game.market.deal(sellOrder.id, buyAmount, terminal.room.name) === OK) {
                                const dealCost = sellOrder.price * buyAmount;
                                log.w(`Bought ${buyAmount} ${mineral} for ${dealCost} credits in ${roomLink(terminal.room.name)} ${isLabNeed ? '(LAB NEED)' : ''}`, "Market: ");
                                Memory._banker.spendingAccount -= dealCost;
                                this.recordBankerDeal('buy', mineral, buyAmount, dealCost);
                                break;
                            }
                        }
                    }
                }
            } else {
                // Clean allied requests
                const requests = ALLY_HELP_REQUESTS[MY_USERNAME] ? ALLY_HELP_REQUESTS[MY_USERNAME].requests : {};
                const resourceRequests = requests.resource ? requests.resource : [];
                const request = resourceRequests.find((r) => r.resourceType === mineral && r.roomName === terminal.room.name);
                if (request) {
                    resourceRequests.splice(resourceRequests.indexOf(request), 1);
                    ALLY_HELP_REQUESTS[MY_USERNAME].requests.resource = resourceRequests;
                }
            }
        }

        // Buy T1 boosts directly when cheaper on the market than reacting from raw components
        for (const t1boost of TIER_1_BOOSTS) {
            if (!labNeeds.includes(t1boost)) continue;
            const components = BOOST_COMPONENTS[t1boost];
            // Only handle simple T1s whose both components are base minerals (skips GH/GO which need synthesised G)
            if (!components || !components.every(c => BASE_MINERALS.includes(c))) continue;

            const stored = terminal.room.store(t1boost);
            if (stored >= REACTION_AMOUNT) continue;
            if (_.some(myOrders, o => o.roomName === terminal.room.name && o.resourceType === t1boost && o.type === ORDER_BUY)) continue;

            const t1Avg = latestMarketHistory(t1boost).avg;
            const rawCost = components.reduce((sum, c) => sum + (latestMarketHistory(c).avg || 0), 0);
            if (!t1Avg || !rawCost || t1Avg >= rawCost) continue;

            const buyAmount = Math.min(REACTION_AMOUNT - stored, REACTION_AMOUNT);

            // Immediately deal on the cheapest sell order priced below raw component cost
            const cheapSell = _.min(
                globalOrders.filter(o => o.resourceType === t1boost && o.type === ORDER_SELL &&
                    !_.includes(MY_ROOMS, o.roomName) && o.price < rawCost),
                'price'
            );
            if (cheapSell && cheapSell.id) {
                let amount = Math.min(buyAmount, cheapSell.amount);
                if (cheapSell.price * amount > Memory._banker.spendingAccount) amount = Math.floor(Memory._banker.spendingAccount / cheapSell.price);
                if (amount >= 100) {
                    if (Game.market.deal(cheapSell.id, amount, terminal.room.name) === OK) {
                        log.w(`Bought ${amount} ${t1boost} at ${cheapSell.price}/u (raw cost: ${rawCost.toFixed(3)}/u) in ${roomLink(terminal.room.name)}`, "Market: ");
                        Memory._banker.spendingAccount -= cheapSell.price * amount;
                        return true;
                    }
                }
            }

            // No immediate deal â€” place a standing buy order capped at just below raw component cost
            const price = Math.min(this.calculatePrice(ORDER_BUY, t1boost), rawCost * 0.98);
            if (createBuyOrder(t1boost, price, buyAmount)) return true;
        }

        // Energy buying â€” tiered by urgency, repriced if state changes
        if (BUY_ENERGY && terminal.room.energyState < 2 && Game.market.credits > BUY_ENERGY_CREDIT_BUFFER) {
            const histAvg = parseFloat(latestMarketHistory(RESOURCE_ENERGY).avg) || 1;
            const currentEnergyBuyOrders = globalOrders.filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && o.remainingAmount >= 500 && !MY_ROOMS.includes(o.roomName));
            // Use 90th-percentile buy price to anchor â€” single outlier orders can't skew the reference
            const sortedBuyPrices = currentEnergyBuyOrders.map(o => o.price).sort((a, b) => a - b);
            const p90 = sortedBuyPrices.length ? sortedBuyPrices[Math.floor(sortedBuyPrices.length * 0.9)] : null;
            const refPrice = p90 ? Math.min(histAvg, p90) : histAvg;
            const isCritical = !terminal.room.energyState && Game.market.credits > BUY_ENERGY_CREDIT_BUFFER * 2;
            const existingOrder = _.find(myOrders, o => o.resourceType === RESOURCE_ENERGY && o.roomName === terminal.room.name);
            // Escalate price over time if unfilled: start conservative, climb to full market price
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

        // Buy boosts only if we have a healthy income surplus (credits trending up, or massive buffer)
        let healthySurplus = Game.market.credits > (BUY_ENERGY_CREDIT_BUFFER * 1.5) && (Memory._banker.creditTrend > 0 || Game.market.credits > BUY_ENERGY_CREDIT_BUFFER * 3);
        if (healthySurplus) {
            let price;
            // Buy boosts
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

        // Handle buy orders for raw commodities if room is producing the T0 for it
        /**
         if (this.room.memory.commodityProduction) {
         const commodity = COMMODITIES[this.room.memory.commodityProduction];
         for (const component of Object.keys(commodity.components)) {
         if (!BASE_COMMODITIES.includes(component)) continue;
         const activeBuyOrder = _.some(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === component && o.type === ORDER_BUY)
         if (activeBuyOrder) continue;
         const stored = getResourceTotal(component) || 0;
         const buyAmount = REACTION_AMOUNT - stored;
         const price = this.calculatePrice(ORDER_BUY, component);
         state.needsCommodities[this.room.name] = component;
         if (createBuyOrder(component, price, buyAmount)) break;
         }
         }**/

        // Helper function to place buy order
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

        // Helper function to determine an acceptable markup for buying orders
        function getAcceptableMarkup(resourceType, activeBuyOrder) {
            let markup = 1.2;  // Default markup
            if (activeBuyOrder) {
                // Scale markup based on time elapsed since the order was created
                const timeElapsed = Game.time - activeBuyOrder.created;
                const cooldown = ['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) ? 10000 : 10;
                markup = Math.min(1.0 + (timeElapsed / cooldown), 2.0);  // Maximum markup of 200% after cooldown
            }
            return markup;
        }
    }

});