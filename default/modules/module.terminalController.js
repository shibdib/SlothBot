/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
/**
 * Created by rober on 6/21/2017.
 */
const priceUpdateTracker = {};
const usedTerminals = {};
const lastRun = {};
const needsCommodities = {};
const globalOrdersCache = {tick: -1, orders: []};

function getCachedGlobalOrders() {
    if (globalOrdersCache.tick !== Game.time) {
        globalOrdersCache.tick = Game.time;
        globalOrdersCache.orders = Game.market.getAllOrders();
    }
    return globalOrdersCache.orders;
}

function pruneTerminalCaches() {
    const roomSet = new Set(MY_ROOMS);
    for (const name in lastRun) {
        if (name !== 'updates' && !roomSet.has(name)) delete lastRun[name];
    }
    for (const name in usedTerminals) {
        if (!roomSet.has(name)) delete usedTerminals[name];
    }
}

function getDerivedCommodityAmount(room, mineral) {
    const key = Object.keys(COMMODITIES).find(k => COMMODITIES[k].components && COMMODITIES[k].components[mineral]);
    if (!key) return 0;
    return (room.store(key) || 0) * 5;
}


class TerminalControl {
    constructor(room) {
        this.room = room;
    }

    run() {
        if (!this.room.terminal || (lastRun[this.room.name] && lastRun[this.room.name] + 25 > Game.time)) return;

        if (!Memory._banker) Memory._banker = {};

        lastRun[this.room.name] = Game.time;

        const terminal = this.room.terminal;
        const myOrders = Game.market.orders;
        const globalOrders = this.getGlobalOrders();

        if (!lastRun['updates'] || lastRun['updates'] + 50 < Game.time) {
            this.updateSpendingMoney();
            this.pricingUpdate(globalOrders, myOrders);
            this.orderCleanup(myOrders);
            pruneTerminalCaches();
            if (['shard0', 'shard1', 'shard2', 'shard3', 'shardX'].includes(Game.shard.name) && SELL_PIXELS) this.sellPixels();
            lastRun['updates'] = Game.time;
        }

        // Market (requires mineral tracking). Deals and instant sells before passive sell orders.
        if (_.size(MY_MINERALS)) {
            if (this.dealFinder(terminal, globalOrders)
                || this.quickSell(terminal, globalOrders)
                || this.placeSellOrders(terminal, globalOrders, myOrders)
                || this.placeBuyOrders(terminal, globalOrders, myOrders)) return;
        }

        if (this.emergencyEnergy(terminal) || this.balanceEnergy(terminal) || this.balanceResources(terminal)) return;
    }

    getGlobalOrders() {
        return this.globalOrders || (this.globalOrders = getCachedGlobalOrders());
    }

    getCreditTrend() {
        return Memory._banker && Memory._banker.creditTrend ? Memory._banker.creditTrend : 0;
    }

    getEmpireKeepAmount(resource) {
        if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource)) {
            let need = 0;
            for (const name of MY_ROOMS) {
                const room = Game.rooms[name];
                if (!room) continue;
                if (room.memory.neededCommodity === resource) need += REACTION_AMOUNT;
                if (needsCommodities[name] === resource) need += REACTION_AMOUNT;
                if (room.memory.commodityProduction) {
                    const comm = COMMODITIES[room.memory.commodityProduction];
                    if (comm && comm.components && comm.components[resource]) need += REACTION_AMOUNT;
                }
            }
            return need;
        }
        if (ALL_BOOSTS.includes(resource)) {
            let total = 0;
            for (const name of MY_ROOMS) {
                const room = Game.rooms[name];
                if (room) total += BOOST_AMOUNT(room, resource);
            }
            return total;
        }
        if (BASE_MINERALS.includes(resource)) {
            return REACTION_AMOUNT * MY_ROOMS.filter(r => Game.rooms[r] && Game.rooms[r].terminal).length;
        }
        return this.determineKeepAmount(resource);
    }

    computeSellableAmount(terminal, resource) {
        const inTerminal = terminal.store[resource] || 0;
        if (!inTerminal) return 0;
        const empireKeep = this.getEmpireKeepAmount(resource);
        const surplus = Math.max(0, getResourceTotal(resource) - empireKeep);
        return Math.min(inTerminal, surplus);
    }

    canSellSurplusEnergy(terminal) {
        if (terminal.room.level < 8 || terminal.room.energyState < 3) return false;
        if (terminal.store[RESOURCE_ENERGY] < TERMINAL_ENERGY_BUFFER + 5000) return false;
        return !_.find(MY_ROOMS, r => {
            const room = Game.rooms[r];
            return room && room.terminal && room.energyState < 2;
        });
    }

    allowEnergySell(terminal) {
        if (SELL_ENERGY) {
            return terminal.room.level >= 8 && terminal.room.energyState >= 2
                && !_.find(MY_ROOMS, r => Game.rooms[r].terminal && !Game.rooms[r].energyState);
        }
        return this.canSellSurplusEnergy(terminal);
    }

    recordBankerDeal(type, resourceType, amount, credits) {
        if (!Memory._banker.stats) Memory._banker.stats = {};
        const key = `${type}_${resourceType}`;
        if (!Memory._banker.stats[key]) Memory._banker.stats[key] = {count: 0, amount: 0, credits: 0};
        const stat = Memory._banker.stats[key];
        stat.count++;
        stat.amount += amount;
        stat.credits += credits;
    }

    updateSpendingMoney() {
        if (!Memory._banker) Memory._banker = {};

        // Track credit trend to determine "healthy income surplus"
        if (Memory._banker.lastCredits === undefined) Memory._banker.lastCredits = Game.market.credits;
        if (Memory._banker.creditTrend === undefined) Memory._banker.creditTrend = 0;

        // Update trend every ~1000 ticks
        if (!Memory._banker.lastTrendUpdate || Memory._banker.lastTrendUpdate + 1000 < Game.time) {
            const difference = Game.market.credits - Memory._banker.lastCredits;
            // Exponential moving average for trend
            Memory._banker.creditTrend = (Memory._banker.creditTrend * 0.9) + (difference * 0.1);
            Memory._banker.lastCredits = Game.market.credits;
            Memory._banker.lastTrendUpdate = Game.time;
        }

        Memory._banker.spendingAccount = Math.max(0, Game.market.credits - CREDIT_BUFFER);
    }

    pricingUpdate(globalOrders, myOrders) {
        for (let key in myOrders) {
            let order = myOrders[key];

            // Energy and base mineral buy orders are repriced by placeBuyOrders with tiered logic — skip here
            if (order.type === ORDER_BUY && (order.resourceType === RESOURCE_ENERGY || BASE_MINERALS.includes(order.resourceType))) continue;

            // Initialize the tracker for this order if it doesn't exist
            if (!priceUpdateTracker[order.id]) {
                priceUpdateTracker[order.id] = {lastChange: 0};
            } else if (priceUpdateTracker[order.id].lastChange + 500 > Game.time) {
                continue; // Check less frequently (every 500 ticks) to save CPU/spam
            }

            // Determine the optimal price based on competition
            let currentPrice = order.price;
            let newPrice = this.calculatePrice(order.type, order.resourceType, currentPrice);

            // Calculate the cost of changing the price (5% market fee only if price INCREASES)
            let cost = newPrice > currentPrice ? (newPrice - currentPrice) * order.remainingAmount * 0.05 : 0;
            let availableCash = Game.market.credits - CREDIT_BUFFER;

            // Only change the price if it's significantly different and we can afford the cost
            if (Math.abs(currentPrice - newPrice) > 0.001 && cost <= availableCash) {
                if (Game.market.changeOrderPrice(order.id, newPrice) === OK) {
                    priceUpdateTracker[order.id].lastChange = Game.time;
                }
            }
        }
    }

    getEnergyValue(globalOrders) {
        if (this._energyValue) return this._energyValue;
        const history = latestMarketHistory(RESOURCE_ENERGY);
        const avg = history.avg || 0.05;
        // Check for reachable buy orders to get "true" value
        const buyOrders = globalOrders.filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && (o.remainingAmount || o.amount) >= 1000);
        if (buyOrders.length) {
            this._energyValue = _.max(buyOrders, 'price').price;
        } else {
            this._energyValue = avg;
        }
        return this._energyValue;
    }

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

                    // Buy orders — tiered price by urgency, repriced if stock level changes
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

            // No immediate deal — place a standing buy order capped at just below raw component cost
            const price = Math.min(this.calculatePrice(ORDER_BUY, t1boost), rawCost * 0.98);
            if (createBuyOrder(t1boost, price, buyAmount)) return true;
        }

        // Energy buying — tiered by urgency, repriced if state changes
        if (BUY_ENERGY && terminal.room.energyState < 2 && Game.market.credits > BUY_ENERGY_CREDIT_BUFFER) {
            const histAvg = parseFloat(latestMarketHistory(RESOURCE_ENERGY).avg) || 1;
            const currentEnergyBuyOrders = globalOrders.filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && o.remainingAmount >= 500 && !MY_ROOMS.includes(o.roomName));
            // Use 90th-percentile buy price to anchor — single outlier orders can't skew the reference
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
         needsCommodities[this.room.name] = component;
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

    placeSellOrders(terminal, globalOrders, myOrders) {
        if (Game.market.credits <= 0) return false;

        for (let resource of Object.keys(terminal.store)) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) {
                if (!this.allowEnergySell(terminal)) continue;
                if (resource === RESOURCE_ENERGY && terminal.room.energyState < 3) continue;
            }

            if (MY_ROOMS.some(name => Game.rooms[name].memory.neededCommodity === resource)) continue;
            if (hasExistingSellOrder(myOrders, terminal, resource)) continue;
            if ((!SELL_BOOSTS || terminal.room.level < 8) && ALL_BOOSTS.includes(resource)) continue;

            if (ALL_BOOSTS.includes(resource) && getResourceTotal(resource) < this.getEmpireKeepAmount(resource) * 1.5) continue;

            let sellAmount = this.computeSellableAmount(terminal, resource);
            if (BASE_MINERALS.includes(resource) && sellAmount < REACTION_AMOUNT * 0.5) continue;
            if (sellAmount < 100) continue;

            let price = this.calculatePrice(ORDER_SELL, resource);
            if (resource === RESOURCE_ENERGY) {
                const energyFloor = this.getEnergyValue(globalOrders) * 0.95;
                if (price < energyFloor) price = energyFloor;
            }

            let cost = price * sellAmount * 0.05;
            if (cost > Game.market.credits) {
                sellAmount = Math.floor(Game.market.credits / (price * 0.05));
            }
            if (sellAmount < 100) continue;

            if (createSellOrder(terminal, resource, price, sellAmount)) return true;
        }

        function hasExistingSellOrder(myOrders, terminal, resourceType) {
            return _.some(myOrders, (order) =>
                order.roomName === terminal.pos.roomName && order.resourceType === resourceType && order.type === ORDER_SELL
            );
        }

        function createSellOrder(terminal, resourceType, price, sellAmount) {
            if (Game.market.createOrder({
                type: ORDER_SELL,
                resourceType: resourceType,
                price: price,
                totalAmount: sellAmount,
                roomName: terminal.pos.roomName
            }) === OK) {
                log.w(`New Sell Order: ${resourceType} at/per ${price} in ${roomLink(terminal.room.name)}`, "Market: ");
                return true;
            }
            return false;
        }

        return false;
    }

    quickSell(terminal, globalOrders) {
        const storageSpace = terminal.room.storage ? terminal.room.storage.store.getFreeCapacity() : 0;
        const spareSpace = terminal.store.getFreeCapacity() + storageSpace;
        const dynamicBuffer = Math.max(CREDIT_BUFFER, Game.market.credits * 0.20);
        const spendingAccount = Memory._banker.spendingAccount || 0;
        const creditTrend = this.getCreditTrend();
        if (spareSpace > STORAGE_CAPACITY * 0.2 && spendingAccount > dynamicBuffer && creditTrend <= 0) return false;

        const sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[a] - terminal.store[b]);

        const transferFactor = roomName => 1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, roomName) / 30);
        const transactionCost = (amount, roomName) => Math.ceil(amount * transferFactor(roomName));
        const maxAffordable = (energy, roomName) => Math.floor(energy / transferFactor(roomName));
        const isHostile = roomName => INTEL[roomName] && HOSTILES.includes(INTEL[roomName].user);

        const findBestBuyer = (resourceType, sellAmount) => {
            const orders = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                o.roomName !== terminal.pos.roomName &&
                transactionCost(sellAmount, o.roomName) < terminal.store[RESOURCE_ENERGY] &&
                !isHostile(o.roomName)
            );
            if (orders.length === 0) return null;

            const energyPrice = this.getEnergyValue(globalOrders);
            const netProfit = o => {
                const amount = Math.min(sellAmount, o.remainingAmount);
                return amount * o.price - transactionCost(amount, o.roomName) * energyPrice;
            };
            const best = _.max(orders, netProfit);
            return netProfit(best) > 0 ? best : null;
        };

        const handleSale = (buyer, sellAmount, resourceType) => {
            sellAmount = Math.min(sellAmount, buyer.remainingAmount);
            if (transactionCost(sellAmount, buyer.roomName) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], buyer.roomName);
            }
            if (sellAmount * buyer.price < 5) return false;
            if (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName) !== OK) return false;
            const credits = buyer.price * sellAmount;
            log.w(`${terminal.pos.roomName} Sell Off Completed - ${sellAmount} ${resourceType} for ${credits} credits in ${roomLink(terminal.room.name)}`, "Market: ");
            Memory._banker.spendingAccount += credits * 0.75;
            this.recordBankerDeal('sell', resourceType, sellAmount, credits);
            return true;
        };

        const handleOffload = (sellAmount, resourceType) => {
            // Fire sale: sell to highest bidder, ignoring price floors
            const fireSaleBuyers = globalOrders.filter(o =>
                o.resourceType === resourceType && o.type === ORDER_BUY &&
                !_.includes(MY_ROOMS, o.roomName) && !isHostile(o.roomName)
            );
            if (fireSaleBuyers.length > 0) {
                const buyer = _.max(fireSaleBuyers, 'price');
                const amount = Math.min(sellAmount, buyer.remainingAmount);
                if (transactionCost(amount, buyer.roomName) < terminal.store[RESOURCE_ENERGY]
                    && Game.market.deal(buyer.id, amount, terminal.pos.roomName) === OK) {
                    log.w(`FIRE SALE: Dumped ${amount} ${resourceType} to ${roomLink(buyer.roomName)} for ${buyer.price * amount} credits to clear space.`, "Market: ");
                    return true;
                }
            }

            // Dump to a friendly ally
            const friendlyRooms = _.filter(INTEL, r => r.user && FRIENDLIES.includes(r.user) && r.level >= 6
                && Game.rooms[r.name] && Game.rooms[r.name].terminal);
            if (friendlyRooms.length === 0) return false;
            const friend = _.sample(friendlyRooms).name;
            if (transactionCost(sellAmount, friend) > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = maxAffordable(terminal.store[RESOURCE_ENERGY], friend);
            }
            if (sellAmount <= 1000) return false;
            if (terminal.send(resourceType, sellAmount, friend) !== OK) return false;
            log.w(`Dumped ${sellAmount} ${resourceType} to Ally ${roomLink(friend)} to clear space.`, "Market: ");
            return true;
        };

        for (const resourceType of sortedKeys) {
            if ((resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) && !this.allowEnergySell(terminal)) continue;

            // Don't sell base minerals if any room is short, or unless we have a large surplus
            if (ALL_BOOSTS.includes(resourceType) && getResourceTotal(resourceType) < this.getEmpireKeepAmount(resourceType) * 1.5) continue;

            const sellAmount = this.computeSellableAmount(terminal, resourceType);
            if (sellAmount < 100) continue;

            const keepAmount = this.determineKeepAmount(resourceType);

            const buyer = findBestBuyer(resourceType, sellAmount);
            if (buyer) {
                if (handleSale(buyer, sellAmount, resourceType)) return true;
            } else if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1 && sellAmount >= keepAmount * 2) {
                if (handleOffload(sellAmount, resourceType)) return true;
            }
        }
        return false;
    }

    balanceResources(terminal) {
        // Sort by most to least so we send surplus first
        let sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[b] - terminal.store[a]);
        for (let resource of sortedKeys) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            let keepAmount = this.determineKeepAmount(resource);
            if (terminal.room.store(resource) < keepAmount) continue;

            // How much can we send while keeping at least keepAmount total in this room
            let available = Math.max(0, terminal.room.store(resource) - keepAmount);
            available = Math.min(available, terminal.store[resource]); // can't send more than what's in terminal
            if (available < 100) continue;

            // Search own rooms first (faster and preferred over allies)
            const needyTerminal = MY_ROOMS
                .filter(r => r !== terminal.room.name && Game.rooms[r] && Game.rooms[r].terminal)
                .map(r => Game.rooms[r].terminal)
                .find(t =>
                    (!usedTerminals[t.room.name] || usedTerminals[t.room.name].tick + 10 < Game.time) &&
                    t.store.getFreeCapacity() > available &&
                    t.room.store(resource) < this.determineKeepAmount(resource) &&
                    Game.market.calcTransactionCost(available, terminal.room.name, t.room.name) < available * 0.25
                );

            let targetRoom;
            if (needyTerminal) {
                targetRoom = needyTerminal.room.name;
            } else {
                for (const key in ALLY_HELP_REQUESTS) {
                    if (key === MY_USERNAME) continue;
                    const ally = ALLY_HELP_REQUESTS[key];
                    if (ally && ally.requests && ally.requests.resource && ally.requests.resource.find((re) => re.resourceType === resource)) {
                        targetRoom = ally.requests.resource.find((re) => re.resourceType === resource).roomName;
                        break;
                    }
                }
            }

            if (targetRoom) {
                if (sendResource(terminal, resource, available, targetRoom, usedTerminals)) return true;
            }
        }
        return false;

        function sendResource(terminal, resource, available, destinationRoom, usedTerminals) {
            switch (terminal.send(resource, available, destinationRoom)) {
                case OK:
                    log.a(`Balancing ${available} ${resource} to ${roomLink(destinationRoom)} from ${roomLink(terminal.room.name)}`, "Market: ");
                    usedTerminals[destinationRoom] = {tick: Game.time};
                    usedTerminals[terminal.room.name] = {tick: Game.time + 50};
                    return true;
            }
        }
    }

    balanceEnergy(terminal) {
        if (terminal.room.memory.dangerousAttack || terminal.room.energyState < 2) return false;
        if (usedTerminals[terminal.room.name] && usedTerminals[terminal.room.name].tick > Game.time) return false;

        const surplus = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER;
        if (surplus < 5000) return false;

        const target = findBestOwnedTarget();
        if (target) return sendEnergyOrBattery(terminal, target.room, target.amount);

        const needyAlly = findNeedyAlly();
        if (needyAlly) return sendEnergyOrBattery(terminal, needyAlly, undefined);
        return false;

        function findBestOwnedTarget() {
            // Only help rooms in genuine crisis (state 0) — state 1 rooms should stockpile on their own.
            // Among crisis rooms, prefer the one where we get the most energy delivered per unit of
            // transaction cost (i.e. nearby critical rooms win over distant ones).
            const candidates = MY_ROOMS
                .filter(r => {
                    if (r === terminal.room.name) return false;
                    const room = Game.rooms[r];
                    if (!room || !room.terminal) return false;
                    if (usedTerminals[r] && usedTerminals[r].tick > Game.time) return false;
                    return room.energyState < 1;
                })
                .map(r => {
                    const room = Game.rooms[r];
                    const energyGap = terminal.room.energy - room.energy;
                    const amount = Math.min(surplus, Math.max(0, Math.floor(energyGap / 2)));
                    if (amount < 5000) return null;
                    const txCost = Game.market.calcTransactionCost(amount, terminal.room.name, r);
                    // Reject sends where fees eat more than 25% of the delivered amount
                    if (txCost > amount * 0.25) return null;
                    // Score: energy delivered per unit of transaction cost (prefer cheap, effective sends)
                    const score = (amount - txCost) / (1 + txCost);
                    return {room: r, amount, score};
                })
                .filter(Boolean)
                .sort((a, b) => b.score - a.score);

            return candidates[0] || null;
        }

        function findNeedyAlly() {
            let bestFunnel = null;
            for (const key in ALLY_HELP_REQUESTS) {
                if (key === MY_USERNAME) continue;
                const ally = ALLY_HELP_REQUESTS[key];
                if (!ally?.requests?.funnel?.length) continue;
                const entry = _.min(ally.requests.funnel, 'maxAmount');
                if (!bestFunnel || entry.maxAmount < bestFunnel.maxAmount) bestFunnel = entry;
            }
            if (bestFunnel?.roomName) return bestFunnel.roomName;

            for (const key in ALLY_HELP_REQUESTS) {
                if (key === MY_USERNAME) continue;
                const energyReq = ALLY_HELP_REQUESTS[key]?.requests?.resource
                    ?.find(re => re.resourceType === RESOURCE_ENERGY);
                if (energyReq?.roomName) return energyReq.roomName;
            }
        }

        function sendEnergyOrBattery(terminal, destinationRoom, amount) {
            // Prefer batteries if destination has a factory — same energy value, lower transaction fee
            if (Game.rooms[destinationRoom] && Game.rooms[destinationRoom].factory && terminal.store[RESOURCE_BATTERY]) {
                const bAmount = Math.min(terminal.store[RESOURCE_BATTERY], 500);
                if (bAmount >= 50 && terminal.send(RESOURCE_BATTERY, bAmount, destinationRoom) === OK) {
                    usedTerminals[terminal.room.name] = {tick: Game.time};
                    usedTerminals[destinationRoom] = {tick: Game.time + 500};
                    return true;
                }
            }

            const sendAmount = amount || Math.min(surplus, 10000);
            if (sendAmount < 5000) return false;

            if (terminal.send(RESOURCE_ENERGY, sendAmount, destinationRoom) === OK) {
                log.i(`Balancing ${sendAmount} energy to ${roomLink(destinationRoom)} from ${roomLink(terminal.room.name)}`, 'Market: ');
                usedTerminals[terminal.room.name] = {tick: Game.time};
                usedTerminals[destinationRoom] = {tick: Game.time + 500};
                return true;
            }
            return false;
        }
    }

    emergencyEnergy(terminal) {
        const roomIntel = INTEL[terminal.room.name];
        if (!terminal.room.energyState || !terminal.store[RESOURCE_ENERGY] || terminal.room.memory.dangerousAttack
            || (roomIntel && roomIntel.threatLevel) || terminal.room.nukes.length) {
            return false;
        }

        let responseNeeded = _.filter(MY_ROOMS, (r) => r !== terminal.room.name && INTEL[r] && Game.rooms[r].memory.dangerousAttack && Game.rooms[r].terminal && !Game.rooms[r].energyState);
        if (!responseNeeded.length) return false;

        let lowestEnergyRoom = _.min(responseNeeded, (r) => Game.rooms[r].energy);
        let needyTerminal = Game.rooms[lowestEnergyRoom].terminal;

        let availableAmount = Math.max(terminal.store[RESOURCE_ENERGY] * 0.2, 1);  // Ensure at least 1 energy is sent if possible
        if (availableAmount <= 0) return false;

        if (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name) === OK) {
            log.a(`Emergency Supplies: Sent ${availableAmount} ${RESOURCE_ENERGY} to ${roomLink(needyTerminal.room.name)} from ${roomLink(terminal.room.name)}`, "Market: ");
            return true;
        }
        return false;
    }

    dealFinder(terminal, globalOrders) {
        if (Game.market.credits < CREDIT_BUFFER * 2) return false;
        if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.2) return false; // Need space

        const energyPrice = this.getEnergyValue(globalOrders);

        // -- ARBITRAGE / SPREAD GAMING --
        // Look for risk-free profit by buying low in one room and selling high elsewhere
        for (let mineral of shuffle(_.union(BASE_MINERALS, ALL_BOOSTS, ALL_COMMODITIES))) {
            let activeBuys = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_BUY && !_.includes(MY_ROOMS, o.roomName)).sort((a, b) => b.price - a.price);
            let activeSells = globalOrders.filter(o => o.resourceType === mineral && o.type === ORDER_SELL && !_.includes(MY_ROOMS, o.roomName)).sort((a, b) => a.price - b.price);

            if (!activeBuys.length || !activeSells.length) continue;

            let highestBuy = activeBuys[0];
            let lowestSell = activeSells[0];

            if (highestBuy.price <= lowestSell.price) continue;

            let spread = highestBuy.price - lowestSell.price;
            let maxAmount = Math.min(highestBuy.remainingAmount, lowestSell.remainingAmount, 1000, terminal.store.getFreeCapacity(mineral));
            if (maxAmount < 10) continue;

            const haveMineral = terminal.store[mineral] >= maxAmount;
            const targetRoom = haveMineral ? highestBuy.roomName : lowestSell.roomName;

            // Scale down amount until we can afford the energy for the immediate transaction
            let amount = maxAmount;
            while (amount >= 10) {
                if (terminal.store[RESOURCE_ENERGY] >= Game.market.calcTransactionCost(amount, terminal.room.name, targetRoom)) break;
                amount = Math.floor(amount * 0.75);
            }
            if (amount < 10) continue;

            // Full round-trip cost for profit check (ensures the spread justifies both legs)
            let costToBuy = Game.market.calcTransactionCost(amount, terminal.room.name, lowestSell.roomName) * energyPrice;
            let costToSell = Game.market.calcTransactionCost(amount, terminal.room.name, highestBuy.roomName) * energyPrice;
            let netProfit = spread * amount - costToBuy - costToSell;

            const minArbitrageProfit = this.getCreditTrend() > 0 ? 100 : 150;
            if (netProfit <= minArbitrageProfit) continue;

            if (haveMineral) {
                if (Game.market.deal(highestBuy.id, amount, terminal.room.name) === OK) {
                    this.recordBankerDeal('sell', mineral, amount, highestBuy.price * amount);
                    return true;
                }
            } else if (Game.market.deal(lowestSell.id, amount, terminal.room.name) === OK) {
                this.recordBankerDeal('buy', mineral, amount, lowestSell.price * amount);
                return true;
            }
        }

        if (this.getCreditTrend() < 0) return false;

        // Look for incredibly cheap sell orders (dumpers) to buy up
        for (let mineral of shuffle(_.union(BASE_MINERALS, ALL_BOOSTS, ALL_COMMODITIES))) {
            let marketHistory = latestMarketHistory(mineral);
            if (!marketHistory.avg || marketHistory.entries < 50) continue;

            let bargainPrice = marketHistory.avg * (this.getCreditTrend() > 0 ? 0.4 : 0.5);

            let cheapSells = globalOrders.filter(order =>
                order.resourceType === mineral &&
                order.type === ORDER_SELL &&
                order.price <= bargainPrice &&
                !_.includes(MY_ROOMS, order.roomName)
            );

            if (cheapSells.length > 0) {
                // Sort by cheapest, considering transaction cost
                let bestDeal = cheapSells.sort((a, b) => {
                    let costA = Game.market.calcTransactionCost(100, terminal.room.name, a.roomName) * energyPrice / 100;
                    let costB = Game.market.calcTransactionCost(100, terminal.room.name, b.roomName) * energyPrice / 100;
                    return (a.price + costA) - (b.price + costB);
                })[0];

                let buyAmount = Math.min(bestDeal.remainingAmount, 1000); // Buy in batches
                let cost = (bestDeal.price * buyAmount);
                let transCost = Game.market.calcTransactionCost(buyAmount, terminal.room.name, bestDeal.roomName);

                if (cost < Memory._banker.spendingAccount && transCost < terminal.store[RESOURCE_ENERGY]) {
                    if (Game.market.deal(bestDeal.id, buyAmount, terminal.room.name) === OK) {
                        log.w(`DEAL FINDER: Bought ${buyAmount} ${mineral} for ${cost} credits (Bargain Price: ${bestDeal.price}) in ${roomLink(terminal.room.name)}`, "Market: ");
                        Memory._banker.spendingAccount -= cost;
                        this.recordBankerDeal('buy', mineral, buyAmount, cost);
                        return true;
                    }
                }
            }
        }
        return false;
    }

    sellPixels() {
        if (Game.resources[PIXEL] && Game.resources[PIXEL] > PIXEL_BUFFER) {
            let sellAmount = Game.resources[PIXEL] - PIXEL_BUFFER;
            let marketHistory = latestMarketHistory(PIXEL);
            const trend = this.getCreditTrend();
            let minPrice = marketHistory.avg ? marketHistory.avg * (trend > 0 ? 0.95 : 0.8) : 1000;

            // Find best buyer globally (pixels don't have transaction costs)
            let orders = this.getGlobalOrders().filter(order =>
                order.resourceType === PIXEL &&
                order.type === ORDER_BUY &&
                order.price >= minPrice
            );

            if (orders.length > 0) {
                let bestOrder = orders.sort((a, b) => b.price - a.price)[0];
                let amountToSell = Math.min(sellAmount, bestOrder.remainingAmount);

                if (amountToSell > 0) {
                    if (Game.market.deal(bestOrder.id, amountToSell) === OK) {
                        log.a(`Sold ${amountToSell} Pixels for ${bestOrder.price * amountToSell} credits.`, "Market: ");
                        return true;
                    }
                }
            }
        }
        return false;
    }

    orderCleanup(myOrders) {
        // Ensure myOrders is an object and contains valid order data
        if (typeof myOrders !== 'object' || Object.keys(myOrders).length === 0) {
            return;
        }

        const currentCredits = Game.market.credits;
        for (let orderId in myOrders) {
            let order = myOrders[orderId];

            if (!order) continue;

            // Check if room still exists
            if (!Game.rooms[order.roomName] && Game.market.cancelOrder(order.id) === OK) {
                log.a(`Order Cancelled: ${order.id} - Room no longer exists.`, 'MARKET: ');
                continue;
            }

            // Cancel inactive orders
            if (!order.active) {
                this.cancelOrder(order, 'Order no longer active');
                continue;
            }

            // Check if boosts and we shouldn't be selling them
            if (order.type === ORDER_SELL && ALL_BOOSTS.includes(order.resourceType) && (!SELL_BOOSTS || Game.rooms[order.roomName].controller.level < 8)) {
                this.cancelOrder(order, 'Boost sales are disabled');
                continue;
            }

            // Check credit balance for buying
            if (order.type === ORDER_BUY && currentCredits < CREDIT_BUFFER * 0.5) {
                this.cancelOrder(order, 'Low credits');
                continue;
            }

            // Check for buy orders of minerals we mine ourselves
            if (order.type === ORDER_BUY && MY_MINERALS[order.resourceType]) {
                this.cancelOrder(order, 'We can mine this ourselves');
                continue;
            }

            // Cancel duplicate orders (keep best-priced)
            let duplicates = Object.values(myOrders).filter(o =>
                o.roomName === order.roomName && o.resourceType === order.resourceType && o.type === order.type && o.id !== order.id
            );
            if (duplicates.length) {
                const group = [order, ...duplicates];
                const keeper = order.type === ORDER_SELL ? _.max(group, 'price') : _.min(group, 'price');
                for (const dup of group) {
                    if (dup.id !== keeper.id) this.cancelOrder(dup, 'Duplicate order detected');
                }
                continue;
            }

            // Cancel energy orders if surplus detected
            if (order.resourceType === RESOURCE_ENERGY) {
                if (order.type === ORDER_BUY) {
                    const orderRoom = Game.rooms[order.roomName];
                    // Cancel only if the room placing the order itself no longer needs energy
                    if (!orderRoom || orderRoom.energyState >= 2) {
                        this.cancelOrder(order, 'Energy surplus detected');
                        continue;
                    }
                } else if (order.type === ORDER_SELL) {
                    if (Game.rooms[order.roomName] && Game.rooms[order.roomName].level < 8) {
                        this.cancelOrder(order, 'Pre-RCL8 rooms do not sell energy');
                        continue;
                    }
                    if (_.find(MY_ROOMS, r => Game.rooms[r].terminal && Game.rooms[r].energyState < 2)) {
                        this.cancelOrder(order, 'Energy shortage detected');
                        continue;
                    }
                    if (!SELL_ENERGY) {
                        const sellTerminal = Game.rooms[order.roomName] && Game.rooms[order.roomName].terminal;
                        if (!sellTerminal || !this.canSellSurplusEnergy(sellTerminal)) {
                            this.cancelOrder(order, 'Energy selling not allowed');
                            continue;
                        }
                    }
                    if (Game.rooms[order.roomName].energyState < 2) {
                        this.cancelOrder(order, 'Energy shortage in room');
                        continue;
                    }
                }
                continue;
            }

            // Cancel fulfilled orders
            if (order.amount === 0) {
                this.cancelOrder(order, 'Order Fulfilled');
                continue;
            }

            // Shard-specific cancellation
            if (['swc', 'botarena'].includes(Game.shard.name) && order.type === ORDER_SELL) {
                this.cancelOrder(order, 'No selling in SWC or BA');
                continue;
            }

            // Cancel if not enough resources for non-energy/battery orders
            if (order.type === ORDER_SELL && !order.amount) {
                this.cancelOrder(order, 'Not enough resources in terminal');
                continue;
            }

            // Extend orders if profitable
            if (order.type === ORDER_SELL) {
                let terminal = Game.rooms[order.roomName].terminal;
                if (terminal && terminal.store[order.resourceType] - order.remainingAmount > 1500) {
                    let availableAmount = terminal.store[order.resourceType] - order.remainingAmount;
                    let marketHistory = latestMarketHistory(order.resourceType);
                    if (marketHistory) {
                        let currentPriceRatio = order.price / marketHistory.avg;

                        // Don't extend if the current price is very poor, let pricingUpdate fix it first
                        // We no longer cancel active orders just because of volatility since we actively manage price
                        if (currentPriceRatio >= 0.75) {
                            let cost = order.price * availableAmount * 0.05;
                            if (cost <= Memory._banker.spendingAccount * 0.1) {
                                if (Game.market.extendOrder(order.id, availableAmount) === OK) {
                                    Memory._banker.spendingAccount -= cost;
                                    log.w(`Extended sell order ${order.id} by ${availableAmount} ${order.resourceType} in ${roomLink(order.roomName)}`, "Market: ");
                                }
                            }
                        }
                    }
                }
            } else if (order.type === ORDER_BUY) {
                if (this.getCreditTrend() < 0 && order.resourceType !== RESOURCE_ENERGY) continue;
                let terminal = Game.rooms[order.roomName].terminal;
                let keepAmount = this.determineKeepAmount(order.resourceType);
                let currentStored = terminal.room.store(order.resourceType);
                if (terminal && currentStored < keepAmount * 0.8 && order.remainingAmount < REACTION_AMOUNT * 0.5) {
                    let extendAmount = REACTION_AMOUNT - order.remainingAmount;
                    let marketHistory = latestMarketHistory(order.resourceType);
                    if (marketHistory) {
                        let currentPriceRatio = order.price / marketHistory.avg;
                        // Only extend if our price is still reasonable (at least 90% of market avg)
                        if (currentPriceRatio >= 0.9) {
                            let cost = order.price * extendAmount * 0.05;
                            if (cost <= Game.market.credits - CREDIT_BUFFER) {
                                if (Game.market.extendOrder(order.id, extendAmount) === OK) {
                                    log.w(`Extended buy order ${order.id} for ${extendAmount} ${order.resourceType} in ${roomLink(order.roomName)}`, "Market: ");
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    cancelOrder(order, reason) {
        if (Game.market.cancelOrder(order.id) === OK) {
            delete priceUpdateTracker[order.id];
            log.a(`Order Cancelled: ${order.id} - ${order.resourceType} - ${reason}`, 'MARKET: ');
        }
    }

    calculatePrice(orderType, resource, currentPrice = null) {
        const marketHistory = latestMarketHistory(resource);
        // Find competitors (ignore tiny dust orders < 10 to avoid baiting)
        const competitors = this.getGlobalOrders().filter(o =>
            o.resourceType === resource &&
            (o.remainingAmount || o.amount) >= 10 &&
            !MY_ROOMS.includes(o.roomName)
        );

        let avgPrice = parseFloat(marketHistory.avg) || 1;
        // Set dynamic floors/ceilings
        let minAcceptable = Math.max(avgPrice * 0.70, 0.05); // Don't sell below 70% of avg
        let maxAcceptable = avgPrice * 1.5; // Don't pay more than 150% of avg

        if (orderType === ORDER_SELL) {
            let activeSells = competitors.filter(o => o.type === ORDER_SELL).sort((a, b) => a.price - b.price);

            if (activeSells.length > 0) {
                let lowestCompetitor = activeSells[0].price;

                if (currentPrice !== null && currentPrice <= lowestCompetitor) {
                    // We are currently the lowest. Check if we're wasting margin against the next guy.
                    if (lowestCompetitor - currentPrice > 0.05 * currentPrice) {
                        return Math.max(lowestCompetitor - 0.001, minAcceptable);
                    }
                    return currentPrice; // Hold our position
                }

                // Not the lowest. Try to undercut if it's above our floor.
                if (lowestCompetitor > minAcceptable) {
                    return lowestCompetitor - 0.001;
                } else {
                    // Dumpers detected. Price at our floor and wait.
                    return Math.max(minAcceptable, marketHistory.trend5 || avgPrice);
                }
            } else {
                // No competition
                return marketHistory.trend5 ? Math.max(marketHistory.trend5, avgPrice * 1.05) : avgPrice * 1.05;
            }
        } else { // ORDER_BUY
            let activeBuys = competitors.filter(o => o.type === ORDER_BUY).sort((a, b) => b.price - a.price); // Descending

            if (activeBuys.length > 0) {
                let highestCompetitor = activeBuys[0].price;

                if (currentPrice !== null && currentPrice >= highestCompetitor) {
                    // We are currently the highest bidder. Check if we're overpaying.
                    if (currentPrice - highestCompetitor > 0.05 * currentPrice) {
                        return Math.min(highestCompetitor + 0.001, maxAcceptable);
                    }
                    return currentPrice; // Hold our position
                }

                // Not the highest. Try to overbid if it's below our ceiling.
                if (highestCompetitor < maxAcceptable) {
                    return highestCompetitor + 0.001;
                } else {
                    // Hyperinflation detected. Cap at our ceiling.
                    return maxAcceptable;
                }
            } else {
                // No competition
                return marketHistory.trend5 ? Math.min(marketHistory.trend5, avgPrice * 0.95) : avgPrice * 0.95;
            }
        }
    }

    determineKeepAmount(resource) {
        // Dynamically determine keepAmount based on resource type
        if (resource === RESOURCE_OPS || resource === RESOURCE_POWER) {
            return 0;
        }
        if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource)) {
            if (this.room.memory.neededCommodity === resource) return REACTION_AMOUNT;
            if (needsCommodities[this.room.name] === resource) return REACTION_AMOUNT;
            if (this.room.memory.commodityProduction) {
                const comm = COMMODITIES[this.room.memory.commodityProduction];
                if (comm && comm.components && comm.components[resource]) return REACTION_AMOUNT;
            }
            return 0;
        }
        if (ALL_BOOSTS.includes(resource)) return BOOST_AMOUNT(this.room, resource);
        if (resource === RESOURCE_BATTERY) return 1000;
        if (this.room.commodityProduction && this.room.mineral.mineralType === resource) return REACTION_AMOUNT * 2;
        if (BASE_MINERALS.includes(resource)) return REACTION_AMOUNT;
        if (COMPRESSED_COMMODITIES.includes(resource)) return 1000;
        if (resource === RESOURCE_GHODIUM) return BOOST_AMOUNT(this.room, resource);
        return REACTION_AMOUNT; // Default reaction amount
    }
}

profiler.registerClass(TerminalControl, 'TerminalControl');
module.exports = TerminalControl;