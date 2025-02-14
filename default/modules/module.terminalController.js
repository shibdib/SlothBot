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

        if (Game.shard.name === 'shardSeason') {
            return this.balanceResources(this.room.terminal);
        }

        // Handle distribution first
        if (this.emergencyEnergy(this.room.terminal) || this.balanceResources(this.room.terminal) || this.balanceResources(this.room.terminal) || this.balanceEnergy(this.room.terminal)) return;

        // Handle market
        if (this.placeSellOrders(this.room.terminal, globalOrders, myOrders) || this.quickSell(this.room.terminal, globalOrders) || this.placeBuyOrders(this.room.terminal, globalOrders, myOrders)) return;
    }

    getGlobalOrders() {
        return this.globalOrders || (this.globalOrders = Game.market.getAllOrders());
    }

    updateSpendingMoney() {
        if (Memory._banker) {
            Memory._banker.spendingAccount = Game.market.credits - (CREDIT_BUFFER * 1.1);
        }
    }

    pricingUpdate(globalOrders, myOrders) {
        for (let key in myOrders) {
            let order = myOrders[key];

            // Initialize the tracker for this order if it doesn't exist
            if (!priceUpdateTracker[order.id]) {
                priceUpdateTracker[order.id] = {lastChange: 0};
            } else if (priceUpdateTracker[order.id].lastChange + 2000 > Game.time) {
                continue; // Avoid updating prices too often
            }

            // Determine the price adjustment strategy based on the order type
            let newPrice = this.calculatePrice(order.type, order.resourceType);
            let currentPrice = order.price;

            // Calculate the cost of changing the price (5% market fee)
            let cost = (newPrice - currentPrice) * order.remainingAmount * 0.05;
            let availableCash = Game.market.credits - CREDIT_BUFFER;

            // Only change the price if it's necessary and we can afford the cost
            if (currentPrice !== newPrice && cost <= availableCash) {
                if (Game.market.changeOrderPrice(order.id, newPrice)) {
                    priceUpdateTracker[order.id].lastChange = Game.time;
                    log.a(`${order.type === ORDER_SELL ? 'Sell' : 'Buy'} order price change ${order.id} new/old ${newPrice}/${currentPrice} Resource - ${order.resourceType}`, "Market: ");
                }
            }
        }
    }

    placeBuyOrders(terminal, globalOrders, myOrders) {
        // Iterate over minerals and handle orders
        for (let mineral of shuffle(BASE_MINERALS)) {
            if (mineral === RESOURCE_ENERGY || mineral === RESOURCE_BATTERY) continue;

            let target = REACTION_AMOUNT;
            let stored = getResourceTotal(mineral) + (getResourceTotal(Object.keys(COMMODITIES).find(key => COMMODITIES[key].components[mineral])) * 5) || 0;

            if (stored < target) {
                let buyAmount = Math.min(target - stored, REACTION_AMOUNT);
                let price;

                // On demand buy a small amount on mmo shards or buy a larger amount on private servers
                if (['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) || MY_MINERALS[mineral]) target = target * 0.5;

                // Buy orders
                const activeBuyOrder = _.find(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === mineral && o.type === ORDER_BUY)
                if (!activeBuyOrder && !MY_MINERALS[mineral]) {
                    price = this.calculatePrice(ORDER_BUY, mineral);
                    buyAmount = Math.min(buyAmount, REACTION_AMOUNT);
                    if (createBuyOrder(mineral, price, buyAmount)) break;
                }
                if (stored < target) {
                    const acceptableMarkup = getAcceptableMarkup(mineral, activeBuyOrder);
                    let sellOrder = _.min(globalOrders.filter(order => order.amount >= 50 && order.resourceType === mineral &&
                        order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName) && order.price < latestMarketHistory(mineral).avg * acceptableMarkup), 'price');

                    if (sellOrder.id && sellOrder.price * buyAmount > Memory._banker.spendingAccount) buyAmount = _.floor(Memory._banker.spendingAccount / sellOrder.price);

                    if (sellOrder.id && buyAmount >= 50) {
                        buyAmount = Math.min(buyAmount, sellOrder.amount);
                        if (Game.market.deal(sellOrder.id, buyAmount, terminal.room.name) === OK) {
                            log.w(`Bought ${buyAmount} ${mineral} for ${sellOrder.price * buyAmount} credits in ${roomLink(terminal.room.name)}`, "Market: ");
                            Memory._banker.spendingAccount -= (sellOrder.price * buyAmount);
                            log.w(`Remaining spending account amount - ${Memory._banker.spendingAccount}`, "Market: ");
                            break;
                        }
                    }
                }
            }
        }

        // If enough credits, handle boosts and energy buying
        if (Game.market.credits > BUY_ENERGY_CREDIT_BUFFER) {
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

            // Buy energy
            if (BUY_ENERGY && !_.find(MY_ROOMS, (r) => Game.rooms[r].terminal && Game.rooms[r].energyState > 1)) {
                if (!_.find(myOrders, (o) => o.resourceType === RESOURCE_ENERGY && o.roomName === terminal.room.name)) {
                    price = this.calculatePrice(ORDER_BUY, RESOURCE_ENERGY);
                    if (createBuyOrder(RESOURCE_ENERGY, price, 10000)) return true;
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
                const cooldown = ['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) ? 10000 : 500;
                markup = Math.min(1.0 + (timeElapsed / cooldown), 1.5);  // Maximum markup of 150% after cooldown
            }
            return markup;
        }
    }

    placeSellOrders(terminal, globalOrders, myOrders) {
        if (Game.market.credits <= 0) return false; // Exit if no credits available

        for (let resource of Object.keys(terminal.store)) {
            // Sell energy and battery only if we have a surplus
            if ((resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) &&
                (terminal.room.energyState < 2 || !_.find(MY_ROOMS, r => Game.rooms[r].terminal && !Game.rooms[r].energyState))) continue;

            // If already selling continue
            if (hasExistingSellOrder(myOrders, terminal, resource)) continue;

            // No selling boosts if set
            if (!SELL_BOOSTS && ALL_BOOSTS.includes(resource)) continue;

            const keepAmount = this.determineKeepAmount(resource);
            let sellAmount = terminal.room.store(resource) - keepAmount;
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

        for (let resourceType of sortedKeys) {
            if ((resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) &&
                (terminal.room.energyState < 2 || !_.find(MY_ROOMS, r => Game.rooms[r].terminal && Game.rooms[r].energyState < 2))) continue;

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

        function findBestBuyer(globalOrders, resourceType, sellAmount) {
            // Use a more advanced matching system with multiple offer matching and transaction cost optimization
            let orders = globalOrders.filter(order =>
                order.resourceType === resourceType && order.type === ORDER_BUY &&
                order.roomName !== terminal.pos.roomName &&
                calculateTransactionCost(sellAmount, order.roomName) < terminal.store[RESOURCE_ENERGY] &&
                (!INTEL[order.roomName] || !HOSTILES.includes(INTEL[order.roomName].user))
            );
            if (orders.length === 0) return null;
            // Select the best buyer dynamically considering distance, price, and availability
            let sortedOrders = orders.sort((a, b) => {
                let costA = calculateTransactionCost(sellAmount, a.roomName);
                let costB = calculateTransactionCost(sellAmount, b.roomName);
                return costA - costB;  // Prefer cheaper transaction cost
            });
            return sortedOrders[0];
        }

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
            let randomRoom = _.sample(_.filter(INTEL, (r) => r.user && r.user !== MY_USERNAME && r.level >= 6)) ||
                _.sample(_.filter(INTEL, (r) => r.user && r.user !== MY_USERNAME && r.level >= 6));
            if (randomRoom) {
                randomRoom = randomRoom.name;
                let transactionCost = calculateTransactionCost(sellAmount, randomRoom);
                if (transactionCost > terminal.store[RESOURCE_ENERGY]) {
                    sellAmount = _.floor(terminal.store[RESOURCE_ENERGY] / (1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, randomRoom) / 30)));
                }
                if (sellAmount > 1000) {
                    let result = terminal.send(resourceType, 1000, randomRoom);
                    if (result === OK) {
                        log.w(`${terminal.pos.roomName} Dumped - ${sellAmount} ${resourceType} to ${roomLink(randomRoom)} (OWNED BY- ${INTEL[randomRoom].user}) from ${roomLink(terminal.room.name)}`, "Market: ");
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
        // Sort by most to least
        let sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[b] - terminal.store[a]);
        for (let resource of sortedKeys) {
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;
            let keepAmount = this.determineKeepAmount(resource);
            if (terminal.room.store(resource) < keepAmount) continue;
            let available = Math.max(terminal.store[resource], 0);
            if (terminal.room.store(resource) - available < keepAmount) available = keepAmount - (terminal.room.store(resource) - available);

            if (available < 100) continue;

            let needyTerminal = _.find(Game.structures, r =>
                r.room.name !== terminal.room.name &&
                r.structureType === STRUCTURE_TERMINAL &&
                r.store.getFreeCapacity() &&
                r.room.store(resource) < terminal.room.store(resource) &&
                r.room.store(resource) < this.determineKeepAmount(resource) &&
                Game.market.calcTransactionCost(available, terminal.room.name, r.room.name) < terminal.room.energy * 0.01
            );

            if (needyTerminal) {
                if (sendResource(terminal, resource, available, needyTerminal.room.name, usedTerminals)) return true;
            }
        }
        return false;

        function sendResource(terminal, resource, available, destinationRoom, usedTerminals) {
            switch (terminal.send(resource, available, destinationRoom)) {
                case OK:
                    log.a(`Balancing ${available} ${resource} to ${roomLink(destinationRoom)} from ${roomLink(terminal.room.name)}`, "Market: ");
                    usedTerminals[destinationRoom] = {tick: Game.time};
                    usedTerminals[terminal.room.name] = {tick: Game.time};
                    return true;
            }
        }
    }

    balanceEnergy(terminal) {
        if (INTEL[terminal.room.name].threatLevel || terminal.room.nukes.length || terminal.room.energyState < 2) return;

        let needyTerminal = findNeedyTerminal(terminal);
        if (needyTerminal) {
            sendEnergyOrBattery(terminal, needyTerminal);
            return true;
        }
        return false;

        function findNeedyTerminal(terminal) {
            // First, try to find needy terminals within the same criteria
            let needyTerminal = _.find(Game.structures, (r) => r.structureType === STRUCTURE_TERMINAL &&
                r.room.name !== terminal.room.name &&
                !r.room.energyState &&
                (!usedTerminals[r.room.name] || usedTerminals[r.room.name].tick !== Game.time) &&
                r.store.getFreeCapacity() > 5000);
            return needyTerminal ? needyTerminal.room.name : null;
        }

        function sendEnergyOrBattery(terminal, destinationRoom) {
            let resource = RESOURCE_ENERGY;
            let availableAmount = terminal.store[resource] - TERMINAL_ENERGY_BUFFER;
            let requestedAmount = 15000;
            // If factory exists, prefer sending batteries
            if (terminal.room.factory && resource === RESOURCE_ENERGY) {
                resource = RESOURCE_BATTERY;
                availableAmount = terminal.store[RESOURCE_BATTERY];
                requestedAmount = 500;
            }
            if (requestedAmount > availableAmount) requestedAmount = availableAmount;
            if (requestedAmount > 0) {
                // Send the resource
                switch (terminal.send(resource, requestedAmount, destinationRoom)) {
                    case OK:
                        log.a(`Sent ${requestedAmount} ${resource} To ${roomLink(destinationRoom)} From ${roomLink(terminal.room.name)}`, "Market: ");
                        usedTerminals[terminal.room.name] = {tick: Game.time};
                        usedTerminals[destinationRoom] = {tick: Game.time};
                        return true;
                }
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
        return false;
    }

    sellPixels(terminal, globalOrders) {
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
                log.e(`Order Cancelled: ${order.id} - Room no longer exists.`, 'MARKET: ');
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
                        let cancelThreshold = 0.85;
                        if (currentPriceRatio < cancelThreshold && marketHistory.entries >= 20) {
                            this.cancelOrder(order, 'Price significantly below market average');
                        } else {
                            let potentialProfit = (marketHistory.avg - order.price) * availableAmount;
                            let cost = order.price * availableAmount * 0.05;
                            if (potentialProfit > cost && cost <= Memory._banker.spendingAccount * 0.1) {
                                if (Game.market.extendOrder(order.id, availableAmount) === OK) {
                                    Memory._banker.spendingAccount -= cost;
                                    log.w(`Extended sell order ${order.id} by ${availableAmount} ${order.resourceType} in ${roomLink(order.roomName)}`, "Market: ");
                                    log.w(`Remaining spending account amount - ${Memory._banker.spendingAccount}`, "Market: ");
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
            log.e(`Order Cancelled: ${order.id} - ${order.resourceType} - ${reason}`, 'MARKET: ');
        }
    }

    calculatePrice(orderType, resource) {
        let newPrice = 0;
        const marketHistory = latestMarketHistory(resource);
        // If we lack data, just use basic +/-
        if (marketHistory.entries >= 20) {
            let volatility = Math.abs(marketHistory.highest - marketHistory.lowest) / marketHistory.avg; // Volatility index
            if (orderType === ORDER_SELL) {
                const multi = marketHistory.trend > 0 ? 1.01 : 0.99;
                newPrice = parseFloat(marketHistory.lowest) * multi;
                if (newPrice === Infinity || newPrice === -Infinity) newPrice = marketHistory.avg;
                if (marketHistory.trend5 > 0) return Math.max(newPrice, marketHistory.trend5, 0.05);
                return Math.max(newPrice, marketHistory.avg * 0.8, 0.05);
            } else {
                if (volatility > 0.1) { // High volatility
                    newPrice = marketHistory.highest * 0.99; // Slightly below the peak to encourage quick sales
                } else {
                    if (marketHistory.trend5 > 0) newPrice = marketHistory.trend5 * 1.01; else newPrice = marketHistory.avg * 1.01;
                }
                if (newPrice === Infinity || newPrice === -Infinity) newPrice = marketHistory.avg;
                return Math.min(newPrice, marketHistory.lowest);
            }
        } else {
            const orders = this.getGlobalOrders();
            const lowestSell = _.min(orders.filter((o) => o.type === ORDER_SELL && o.resourceType === resource && !MY_ROOMS.includes(o.roomName)), 'price');
            const highestBuy = _.max(orders.filter((o) => o.type === ORDER_BUY && o.resourceType === resource && !MY_ROOMS.includes(o.roomName)), 'price');
            if (orderType === ORDER_SELL) {
                if (lowestSell && lowestSell.price) {
                    let price = lowestSell.price - 0.01;
                    if (price < highestBuy.price) price = highestBuy.price;
                    return Math.max(price, 0.05);
                } else if (highestBuy && highestBuy.price) {
                    return Math.max(highestBuy.price * 0.5, 0.05);
                }
                return 1;
            } else {
                if (highestBuy && highestBuy.price) {
                    return highestBuy.price + 0.01;
                }
                return 1;
            }
        }
    }

    determineKeepAmount(resource) {
        // Dynamically determine keepAmount based on resource type
        if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource) || resource === RESOURCE_OPS || resource === RESOURCE_POWER) {
            return 0;
        }
        if (LAB_PRIORITY.includes(resource)) return BOOST_AMOUNT(this.room) * 2;
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