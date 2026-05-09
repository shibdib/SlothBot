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

class TerminalControl {
    constructor(room) {
        this.room = room;
    }

    run() {
        if (!this.room.terminal || !_.size(MY_MINERALS) || (lastRun[this.room.name] && lastRun[this.room.name] + 25 > Game.time)) return;

        // Make sure banker is set
        if (!Memory._banker) Memory._banker = {};

        lastRun[this.room.name] = Game.time;

        const myOrders = Game.market.orders;
        const globalOrders = this.getGlobalOrders();

        if (!lastRun['updates'] || lastRun['updates'] + 50 < Game.time) {
            this.updateSpendingMoney();
            this.pricingUpdate(globalOrders, myOrders);
            this.orderCleanup(myOrders);
            if (['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) && SELL_PIXELS) this.sellPixels();
            lastRun['updates'] = Game.time;
        }

        // Handle market
        if (this.placeSellOrders(this.room.terminal, globalOrders, myOrders) || this.quickSell(this.room.terminal, globalOrders) || this.placeBuyOrders(this.room.terminal, globalOrders, myOrders) || this.dealFinder(this.room.terminal, globalOrders)) return;

        // Handle distribution
        if (this.emergencyEnergy(this.room.terminal) || this.balanceEnergy(this.room.terminal) || this.balanceResources(this.room.terminal)) return;
    }

    getGlobalOrders() {
        return this.globalOrders || (this.globalOrders = Game.market.getAllOrders());
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
                    log.a(`${order.type === ORDER_SELL ? 'Sell' : 'Buy'} order price updated ${order.id} new/old ${newPrice.toFixed(3)}/${currentPrice.toFixed(3)} Resource - ${order.resourceType}`, "Market: ");
                }
            }
        }
    }

    getEnergyValue(globalOrders) {
        if (this._energyValue) return this._energyValue;
        const history = latestMarketHistory(RESOURCE_ENERGY);
        const avg = history.avg || 0.05;
        // Check for reachable buy orders to get "true" value
        const buyOrders = globalOrders.filter(o => o.resourceType === RESOURCE_ENERGY && o.type === ORDER_BUY && o.amount >= 1000);
        if (buyOrders.length) {
            this._energyValue = _.max(buyOrders, 'price').price;
        } else {
            this._energyValue = avg;
        }
        return this._energyValue;
    }

    placeBuyOrders(terminal, globalOrders, myOrders) {
        // Iterate over minerals and handle orders
        const labs = terminal.room.structures.filter(s => s.structureType === STRUCTURE_LAB);
        const labNeeds = _.compact(labs.map(l => l.memory.itemNeeded));

        for (let mineral of shuffle(_.union(BASE_MINERALS, labNeeds))) {
            if (mineral === RESOURCE_ENERGY || mineral === RESOURCE_BATTERY) continue;

            let target = REACTION_AMOUNT * 0.9;
            const isLabNeed = labNeeds.includes(mineral);
            if (isLabNeed) target = REACTION_AMOUNT; // Be more aggressive if labs need it

            let stored = terminal.room.store(mineral) + (terminal.room.store(Object.keys(COMMODITIES).find(key => COMMODITIES[key].components[mineral])) * 5) || 0;
            let buyAmount = Math.min(target - stored, REACTION_AMOUNT);

            // Don't buy from the market if other rooms have enough to route here
            if (stored < target && getResourceTotal(mineral) >= target) continue;

            if (stored < target && buyAmount > 0) {
                let price;

                // On demand buy a small amount on mmo shards or buy a larger amount on private servers
                if (!isLabNeed && (['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) || MY_MINERALS[mineral])) target = target * 0.5;

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

                    // Buy orders
                    const activeBuyOrder = _.find(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === mineral && o.type === ORDER_BUY)
                    if (!activeBuyOrder && !MY_MINERALS[mineral]) {
                        price = this.calculatePrice(ORDER_BUY, mineral);
                        buyAmount = Math.min(buyAmount, REACTION_AMOUNT);
                        if (createBuyOrder(mineral, price, buyAmount)) break;
                    }

                    // Be more willing to pay a higher markup if we are desperately low or labs are stalled
                    let acceptableMarkup = stored < (target * 0.25) ? getAcceptableMarkup(mineral, activeBuyOrder) * 1.5 : getAcceptableMarkup(mineral, activeBuyOrder);
                    if (isLabNeed && stored < 500) acceptableMarkup *= 1.5;
                    
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === mineral &&
                        order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName) && order.price <= latestMarketHistory(mineral).avg * acceptableMarkup), 'price');
                    if (sellOrder.id) {
                        if (sellOrder.amount < buyAmount) buyAmount = Math.min(buyAmount, sellOrder.amount);
                        if (sellOrder.price * buyAmount > Memory._banker.spendingAccount) buyAmount = _.floor(Memory._banker.spendingAccount / sellOrder.price);
                        if (buyAmount >= 100) {
                            if (Game.market.deal(sellOrder.id, buyAmount, terminal.room.name) === OK) {
                                log.w(`Bought ${buyAmount} ${mineral} for ${sellOrder.price * buyAmount} credits in ${roomLink(terminal.room.name)} ${isLabNeed ? '(LAB NEED)' : ''}`, "Market: ");
                                Memory._banker.spendingAccount -= (sellOrder.price * buyAmount);
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

        // Handle energy buying
        if (Game.market.credits > BUY_ENERGY_CREDIT_BUFFER) {
            let price;
            // Buy energy
            if (BUY_ENERGY && !_.find(MY_ROOMS, (r) => Game.rooms[r].terminal && Game.rooms[r].energyState > 1)) {
                if (!_.find(myOrders, (o) => o.resourceType === RESOURCE_ENERGY && o.roomName === terminal.room.name)) {
                    price = this.calculatePrice(ORDER_BUY, RESOURCE_ENERGY);
                    if (createBuyOrder(RESOURCE_ENERGY, price, 10000)) return true;
                }
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
                    if (stored < BOOST_AMOUNT(terminal.room) * MY_ROOMS.length) {
                        let buyAmount = BOOST_AMOUNT(terminal.room) - stored;
                        price = this.calculatePrice(ORDER_BUY, mineral);
                        if (createBuyOrder(mineral, price, buyAmount)) break;
                    }
                }
            }
        }

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
                const cooldown = ['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) ? 10000 : 10;
                markup = Math.min(1.0 + (timeElapsed / cooldown), 2.0);  // Maximum markup of 200% after cooldown
            }
            return markup;
        }
    }

    placeSellOrders(terminal, globalOrders, myOrders) {
        if (Game.market.credits <= 0) return false; // Exit if no credits available

        for (let resource of Object.keys(terminal.store)) {
            // Sell energy and battery only if we have a surplus
            if ((resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) &&
                (!SELL_ENERGY || terminal.room.energyState < 2 || !_.find(MY_ROOMS, r => Game.rooms[r].terminal && !Game.rooms[r].energyState))) continue;

            // If already selling continue
            if (hasExistingSellOrder(myOrders, terminal, resource)) continue;

            // No selling boosts if set
            if (!SELL_BOOSTS && ALL_BOOSTS.includes(resource)) continue;

            // Don't sell base minerals if any room is short
            if (BASE_MINERALS.includes(resource) && MY_ROOMS.some(r => Game.rooms[r].terminal && Game.rooms[r].store(resource) < REACTION_AMOUNT)) continue;

            const keepAmount = this.determineKeepAmount(resource);
            let sellAmount = terminal.room.store(resource) - keepAmount;

            // Require a bit more buffer for selling base minerals to ensure we don't bounce around
            if (BASE_MINERALS.includes(resource) && sellAmount < REACTION_AMOUNT * 0.5) continue;

            if (sellAmount > terminal.store[resource]) sellAmount = terminal.store[resource];

            // Skip if no valid sell amount
            if (sellAmount < 100) continue;

            let price = this.calculatePrice(ORDER_SELL, resource);
            let cost = price * sellAmount * 0.05;

            // Adjust sell amount based on available credits, ensuring we're not overspending
            if (cost > Game.market.credits) {
                sellAmount = Math.floor(Game.market.credits / (price * 0.05));
            }

            // Sell smarter based on the market price and profit margins
            if (sellAmount > 0) {
                createSellOrder(terminal, resource, price, sellAmount);
            }
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
            }
        }
    }

    quickSell(terminal, globalOrders) {
        const storageSpace = terminal.room.storage ? terminal.room.storage.store.getFreeCapacity() : 0;
        const spareSpace = terminal.store.getFreeCapacity() + storageSpace;
        // Dynamically adjust credit buffer based on current market condition
        let dynamicBuffer = Math.max(CREDIT_BUFFER, Game.market.credits * 0.20);
        const spendingAccount = Memory._banker.spendingAccount || 0;
        if (spareSpace > STORAGE_CAPACITY * 0.2 && spendingAccount > dynamicBuffer) return false;

        // Sort resources and filter based on relevance
        let sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[a] - terminal.store[b]);

        let findBestBuyer = (globalOrders, resourceType, sellAmount) => {
            // Use a more advanced matching system with multiple offer matching and transaction cost optimization
            let orders = globalOrders.filter(order =>
                order.resourceType === resourceType && order.type === ORDER_BUY &&
                order.roomName !== terminal.pos.roomName &&
                calculateTransactionCost(sellAmount, order.roomName) < terminal.store[RESOURCE_ENERGY] &&
                (!INTEL[order.roomName] || !HOSTILES.includes(INTEL[order.roomName].user))
            );
            if (orders.length === 0) return null;

            let energyPrice = this.getEnergyValue(globalOrders);

            // Select the best buyer dynamically considering distance, price, and availability (Maximize Net Profit)
            let sortedOrders = orders.sort((a, b) => {
                let amountA = Math.min(sellAmount, a.remainingAmount);
                let costA = calculateTransactionCost(amountA, a.roomName);
                let netProfitA = (amountA * a.price) - (costA * energyPrice);

                let amountB = Math.min(sellAmount, b.remainingAmount);
                let costB = calculateTransactionCost(amountB, b.roomName);
                let netProfitB = (amountB * b.price) - (costB * energyPrice);

                return netProfitB - netProfitA;  // Prefer higher net profit
            });

            // Only return if the sale is actually profitable
            let bestOrder = sortedOrders[0];
            let bestAmount = Math.min(sellAmount, bestOrder.remainingAmount);
            let bestCost = calculateTransactionCost(bestAmount, bestOrder.roomName);
            let netProfit = (bestAmount * bestOrder.price) - (bestCost * energyPrice);

            return netProfit > 0 ? bestOrder : null;
        }

        for (let resourceType of sortedKeys) {
            if ((resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) &&
                (!SELL_ENERGY || terminal.room.energyState < 2 || !_.find(MY_ROOMS, r => Game.rooms[r].terminal && Game.rooms[r].energyState < 2))) continue;

            // No selling base minerals if any room is short or if we don't have a large surplus
            if (BASE_MINERALS.includes(resourceType)) {
                if (MY_ROOMS.some(r => Game.rooms[r].terminal && Game.rooms[r].store(resourceType) < REACTION_AMOUNT)) continue;
                if (terminal.store[resourceType] < this.determineKeepAmount(resourceType) * 1.5) continue;
            }

            let keepAmount = this.determineKeepAmount(resourceType);
            let sellAmount = Math.max(terminal.store[resourceType] - keepAmount, 0);
            if (sellAmount <= 0) continue;

            let buyer = findBestBuyer(globalOrders, resourceType, sellAmount);
            if (buyer) {
                if (handleSale(buyer, sellAmount, resourceType)) return true;
            } else if (terminal.store.getFreeCapacity() < TERMINAL_CAPACITY * 0.1) {
                // Offload excess resources dynamically
                if (sellAmount >= keepAmount * 2) {
                    let offloadResult = handleOffload(sellAmount, resourceType);
                    if (offloadResult) return true;
                }
            }
        }
        return false;

        function handleSale(buyer, sellAmount, resourceType) {
            if (buyer.remainingAmount < sellAmount) sellAmount = buyer.remainingAmount;
            let transactionCost = calculateTransactionCost(sellAmount, buyer.roomName);
            if (transactionCost > terminal.store[RESOURCE_ENERGY]) {
                sellAmount = _.floor(terminal.store[RESOURCE_ENERGY] / (1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, buyer.roomName) / 30)));
            }
            if (sellAmount * buyer.price >= 5) {
                if (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName) === OK) {
                    log.w(`${terminal.pos.roomName} Sell Off Completed - ${sellAmount} ${resourceType} for ${buyer.price * sellAmount} credits in ${roomLink(terminal.room.name)}`, "Market: ");
                    Memory._banker.spendingAccount += (buyer.price * sellAmount) * 0.75;
                    log.w(`New spending account amount - ${Memory._banker.spendingAccount}`, "Market: ");
                    return true;
                }
            }
            return false;
        }

        function handleOffload(sellAmount, resourceType) {
            // First, try a fire sale (sell to any highest bidder, regardless of our standard price floors)
            let fireSaleBuyers = globalOrders.filter(order =>
                order.resourceType === resourceType && order.type === ORDER_BUY &&
                !_.includes(MY_ROOMS, order.roomName) &&
                (!INTEL[order.roomName] || !HOSTILES.includes(INTEL[order.roomName].user))
            ).sort((a, b) => b.price - a.price);

            if (fireSaleBuyers.length > 0) {
                let buyer = fireSaleBuyers[0];
                let amount = Math.min(sellAmount, buyer.remainingAmount);
                let transactionCost = calculateTransactionCost(amount, buyer.roomName);
                if (transactionCost < terminal.store[RESOURCE_ENERGY]) {
                    if (Game.market.deal(buyer.id, amount, terminal.pos.roomName) === OK) {
                        log.w(`FIRE SALE: Dumped ${amount} ${resourceType} to ${roomLink(buyer.roomName)} for ${buyer.price * amount} credits to clear space.`, "Market: ");
                        return true;
                    }
                }
            }

            // If no buyers, try to dump to a friend or ally
            let friendlyRooms = _.filter(INTEL, (r) => r.user && FRIENDLIES.includes(r.user) && r.level >= 6);
            if (friendlyRooms.length > 0) {
                let randomFriend = _.sample(friendlyRooms).name;
                let transactionCost = calculateTransactionCost(sellAmount, randomFriend);
                if (transactionCost > terminal.store[RESOURCE_ENERGY]) {
                    sellAmount = _.floor(terminal.store[RESOURCE_ENERGY] / (1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, randomFriend) / 30)));
                }
                if (sellAmount > 1000) {
                    if (terminal.send(resourceType, sellAmount, randomFriend) === OK) {
                        log.w(`Dumped ${sellAmount} ${resourceType} to Ally ${roomLink(randomFriend)} to clear space.`, "Market: ");
                        return true;
                    }
                }
            }
            return false;
        }

        function calculateTransactionCost(amount, roomName1) {
            let distance = Game.map.getRoomLinearDistance(roomName1, terminal.room.name);
            return Math.ceil(amount * (1 - Math.exp(-distance / 30)));
        }
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

        const poorestRoom = findNeedyTerminal();
        if (poorestRoom) {
            return sendEnergyOrBattery(terminal, poorestRoom);
        }

        const needyAlly = findNeedyAllies();
        if (needyAlly) {
            return sendEnergyOrBattery(terminal, needyAlly);
        }
        return false;

        function findNeedyTerminal() {
            // Only consider rooms that genuinely need energy (below state 2) and are meaningfully poorer
            return MY_ROOMS
                .filter(r => r !== terminal.room.name && Game.rooms[r] && Game.rooms[r].terminal && Game.rooms[r].energyState < 2)
                .sort((a, b) => Game.rooms[a].energy - Game.rooms[b].energy)[0];
        }

        function findNeedyAllies() {
            const needyAllies = _.filter(ALLY_HELP_REQUESTS, (r) => r && r.requests && r.requests.funnel).sort((a, b) => a.requests.funnel.maxAmount - b.requests.funnel.maxAmount)[0]
                || _.find(ALLY_HELP_REQUESTS, (r) => r.requests && r.requests.resource && r.requests.resource.find((re) => re.resourceType === RESOURCE_ENERGY));
            if (needyAllies) return needyAllies.roomName;
        }

        function sendEnergyOrBattery(terminal, destinationRoom) {
            // Prefer batteries if destination has a factory
            if (Game.rooms[destinationRoom] && Game.rooms[destinationRoom].factory && terminal.store[RESOURCE_BATTERY]) {
                const amount = Math.min(terminal.store[RESOURCE_BATTERY], 500);
                if (amount >= 50 && terminal.send(RESOURCE_BATTERY, amount, destinationRoom) === OK) {
                    log.a(`Sent ${amount} ${RESOURCE_BATTERY} To ${roomLink(destinationRoom)} From ${roomLink(terminal.room.name)}`, "Market: ");
                    usedTerminals[terminal.room.name] = {tick: Game.time};
                    usedTerminals[destinationRoom] = {tick: Game.time + 500};
                    return true;
                }
            }

            const surplus = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER;
            if (surplus <= 0) return false;

            // Send half the energy gap to equalize, capped at our surplus
            const energyGap = terminal.room.energy - (Game.rooms[destinationRoom] ? Game.rooms[destinationRoom].energy : 0);
            const requestedAmount = Math.min(surplus, Math.max(0, Math.floor(energyGap / 2)));

            if (requestedAmount < 5000) return false;

            const transactionCost = Game.market.calcTransactionCost(requestedAmount, terminal.room.name, destinationRoom);
            if (transactionCost > requestedAmount * 0.5) return false;

            if (terminal.send(RESOURCE_ENERGY, requestedAmount, destinationRoom) === OK) {
                log.a(`Sent ${requestedAmount} ${RESOURCE_ENERGY} To ${roomLink(destinationRoom)} From ${roomLink(terminal.room.name)}`, "Market: ");
                usedTerminals[terminal.room.name] = {tick: Game.time};
                usedTerminals[destinationRoom] = {tick: Game.time + 500};
                return true;
            }
            return false;
        }
    }

    emergencyEnergy(terminal) {
        if (!terminal.energyState || !terminal.store[RESOURCE_ENERGY] || terminal.room.memory.dangerousAttack || INTEL[terminal.room.name].threatLevel || terminal.room.nukes.length) {
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

            if (netProfit <= 50) continue;

            if (haveMineral) {
                if (Game.market.deal(highestBuy.id, amount, terminal.room.name) === OK) {
                    log.w(`ARBITRAGE: Flipped ${amount} ${mineral} in ${terminal.room.name} for profit: ${netProfit.toFixed(2)}`, "Market: ");
                    return true;
                }
            } else if (Game.market.deal(lowestSell.id, amount, terminal.room.name) === OK) {
                log.w(`ARBITRAGE: Secured ${amount} ${mineral} for flip in ${terminal.room.name}. Est profit: ${netProfit.toFixed(2)}`, "Market: ");
                return true;
            }
        }

        // Look for incredibly cheap sell orders (dumpers) to buy up
        for (let mineral of shuffle(_.union(BASE_MINERALS, ALL_BOOSTS, ALL_COMMODITIES))) {
            let marketHistory = latestMarketHistory(mineral);
            if (!marketHistory.avg || marketHistory.entries < 50) continue;

            let bargainPrice = marketHistory.avg * 0.5; // Half of average

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
            let minPrice = marketHistory.avg ? marketHistory.avg * 0.8 : 1000; // Accept 80% of average, or 1000 default

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
            if (order.type === ORDER_SELL && !SELL_BOOSTS && ALL_BOOSTS.includes(order.resourceType)) {
                this.cancelOrder(order, 'Boost sales are disabled for this shard');
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

            // Cancel duplicate orders
            let duplicates = Object.values(myOrders).filter(o =>
                o.roomName === order.roomName && o.resourceType === order.resourceType && o.type === order.type && o.id !== order.id
            );
            if (duplicates.length) {
                this.cancelOrder(order, 'Duplicate order detected');
                duplicates.forEach(duplicateOrder => Game.market.cancelOrder(duplicateOrder.id));
                continue;
            }

            // Cancel energy orders if surplus detected
            if (order.resourceType === RESOURCE_ENERGY) {
                if (order.type === ORDER_BUY && _.find(MY_ROOMS, r => Game.rooms[r].terminal && Game.rooms[r].energyState > 1)) {
                    this.cancelOrder(order, 'Energy surplus detected');
                    continue;
                }
                if (order.type === ORDER_SELL && _.find(MY_ROOMS, r => Game.rooms[r].terminal && Game.rooms[r].energyState < 2)) {
                    this.cancelOrder(order, 'Energy shortage detected');
                    continue;
                }
                if (order.type === ORDER_SELL && !SELL_ENERGY) {
                    this.cancelOrder(order, 'We do not sell energy');
                    continue;
                }
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
                                    log.w(`Remaining spending account amount - ${Memory._banker.spendingAccount}`, "Market: ");
                                }
                            }
                        }
                    }
                }
            } else if (order.type === ORDER_BUY) {
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

            // Cancel if not enough resources for non-energy/battery orders
            if (order.resourceType !== RESOURCE_ENERGY && order.resourceType !== RESOURCE_BATTERY && !order.amount) {
                this.cancelOrder(order, 'Not enough resources in terminal');
                continue;
            }

            // Cancel energy sell orders if energy shortage
            if (order.resourceType === RESOURCE_ENERGY && Game.rooms[order.roomName].energyState < 2) {
                this.cancelOrder(order, 'Energy shortage in room');
                continue;
            }
        }
    }

    cancelOrder(order, reason) {
        if (Game.market.cancelOrder(order.id) === OK) {
            log.a(`Order Cancelled: ${order.id} - ${order.resourceType} - ${reason}`, 'MARKET: ');
        }
    }

    calculatePrice(orderType, resource, currentPrice = null) {
        const marketHistory = latestMarketHistory(resource);
        // Find competitors (ignore tiny dust orders < 10 to avoid baiting)
        const competitors = this.getGlobalOrders().filter(o =>
            o.resourceType === resource &&
            o.amount >= 10 &&
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
        if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource) || resource === RESOURCE_OPS || resource === RESOURCE_POWER) {
            return 0;
        }
        if (LAB_PEACE_PRIORITY.includes(resource) || LAB_WAR_PRIORITY.includes(resource)) return BOOST_AMOUNT(this.room) * 2;
        if (ALL_BOOSTS.includes(resource)) return BOOST_AMOUNT(this.room);
        if (resource === RESOURCE_BATTERY) return 1000;
        if (BASE_MINERALS.includes(resource)) return REACTION_AMOUNT;
        if (COMPRESSED_COMMODITIES.includes(resource)) return 1000;
        if (resource === RESOURCE_GHODIUM) return SAFE_MODE_COST + NUKER_GHODIUM_CAPACITY;
        if (this.room.nukes.length) return 0;
        return REACTION_AMOUNT; // Default reaction amount
    }
}

profiler.registerClass(TerminalControl, 'TerminalControl');
module.exports = TerminalControl;