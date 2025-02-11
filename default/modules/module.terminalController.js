/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const profiler = require("tools.profiler");
/**
 * Created by rober on 6/21/2017.
 */
let lastPriceAdjust = 0;
let diplomacyTracker = 0;
const priceUpdateTracker = {};
const usedTerminals = {};
const lastRun = {};

class TerminalControl {
    constructor() {
        this.reactionAmount = REACTION_AMOUNT;
    }

    run(room) {
        if (!room.terminal || !_.size(MY_MINERALS) || (lastRun[room.name] && lastRun[room.name] + 25 > Game.time)) return;

        lastRun[room.name] = Game.time;

        if (Game.shard.name === 'shardSeason') {
            return this.balanceResources(room.terminal);
        }

        this.initializeSaleTerminal();

        const myOrders = Game.market.orders;
        const globalOrders = this.getGlobalOrders();

        if (room.name === Memory.saleTerminal.room) {
            this.handleSaleTerminal(room, room.terminal, myOrders, globalOrders);
        } else {
            if (this.placeBuyOrders(room.terminal, globalOrders, myOrders)) return;
        }

        if (this.emergencyEnergy(room.terminal)) return;
        if (this.balanceResources(room.terminal)) return;
        this.balanceEnergy(room.terminal);
    }

    initializeSaleTerminal() {
        Memory.saleTerminal = Memory.saleTerminal || {};
        if (Memory.saleTerminal.room && Game.rooms[Memory.saleTerminal.room].nukes.length) {
            log.a(`${roomLink(Memory.saleTerminal.room)} is no longer the primary market room due to an incoming nuke.`);
            Memory.saleTerminal.room = undefined;
        }
        this.updateSaleTerminalRoom();
    }

    updateSaleTerminalRoom() {
        if (!Memory.saleTerminal.room || Memory.saleTerminal.saleSet + 15000 < Game.time || !Game.rooms[Memory.saleTerminal.room]) {
            this.clearInvalidSaleTerminal();
            if (!this.setPrimaryMarketRoom()) return;
        }
    }

    clearInvalidSaleTerminal() {
        const roomData = Game.rooms[Memory.saleTerminal.room];
        if (!roomData || !INTEL[Memory.saleTerminal.room] || INTEL[Memory.saleTerminal.room].owner !== MY_USERNAME) {
            Memory.saleTerminal = {};
        }
    }

    setPrimaryMarketRoom() {
        const availableRooms = MY_ROOMS.filter(s =>
            Game.rooms[s].terminal
        );

        if (availableRooms.length) {
            Memory.saleTerminal.room = _.max(availableRooms, function (r) {
                return Game.rooms[r].level;
            });
            Memory.saleTerminal.saleSet = Game.time;
            return true;
        }
        return false;
    }

    getGlobalOrders() {
        return this.globalOrders || (this.globalOrders = Game.market.getAllOrders());
    }

    handleSaleTerminal(room, terminal, myOrders, globalOrders) {
        this.updateSpendingMoney();
        this.profitCheck();
        this.tradeDiplomacyTracker();

        if (['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name) && SELL_PIXELS) {
            this.sellPixels(terminal, globalOrders);
        }

        if (lastPriceAdjust + 100 < Game.time) {
            this.pricingUpdate(globalOrders, myOrders);
            lastPriceAdjust = Game.time;
        }

        this.orderCleanup(myOrders);
        if (!['swc', 'botarena'].includes(Game.shard.name)) {
            this.placeSellOrders(terminal, globalOrders, myOrders);
        }

        if (Memory._banker.spendingAccount > 0) {
            if (this.dealFinder(terminal, globalOrders)) return;
        }

        if (this.fillBuyOrders(terminal, globalOrders)) return;

        this.placeBuyOrders(terminal, globalOrders, myOrders)
    }

    updateSpendingMoney() {
        if (Memory._banker) {
            const maxSpending = Math.min(Memory._banker.spendingAccount, Game.market.credits - (CREDIT_BUFFER * 1.1));
            Memory._banker.spendingAccount = _.floor(maxSpending, 1);
            Memory._banker.spendingAccount = Memory._banker.spendingAccount;
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
                    log.w(`${order.type === ORDER_SELL ? 'Sell' : 'Buy'} order price change ${order.id} new/old ${newPrice}/${currentPrice} Resource - ${order.resourceType}`, "Market: ");
                }
            }
        }
    }

    placeSellOrders(terminal, globalOrders, myOrders) {
        if (Game.market.credits <= 0) return false; // Exit if no credits available

        for (let resourceType of Object.keys(terminal.store)) {
            // Sell energy and battery only if we have a surplus
            if ((resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) &&
                (terminal.room.energyState < 2 || !_.find(MY_ROOMS, r => Game.rooms[r].terminal && !Game.rooms[r].energyState))) continue;

            // No selling boosts if set
            if (!SELL_BOOSTS && ALL_BOOSTS.includes(resourceType)) continue;

            let sellAmount = getSellAmount(terminal, resourceType);
            // Skip if no valid sell amount or if there's already an existing sell order
            if (sellAmount < 100 || hasExistingSellOrder(myOrders, terminal, resourceType)) continue;

            let price = this.calculatePrice(ORDER_SELL, resourceType);
            let cost = price * sellAmount * 0.05;

            // Adjust sell amount based on available credits, ensuring we're not overspending
            if (cost > Game.market.credits) {
                sellAmount = Math.floor(Game.market.credits / (price * 0.05));
            }

            // Sell smarter based on the market price and profit margins
            if (sellAmount > 0) {
                createSellOrder(terminal, resourceType, price, sellAmount);
            }
        }

        function getSellAmount(terminal, resourceType) {
            let sellAmount = terminal.store[resourceType];
            // Energy and battery are handled separately
            if (resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) {
                _.min(terminal.room.store(resourceType), 10000);
            } else
            // Handle base minerals and commodities
            if (_.includes(BASE_MINERALS.concat(BASE_COMMODITIES, BASE_COMPOUNDS), resourceType)) {
                sellAmount = terminal.room.store(resourceType) - REACTION_AMOUNT;
            } else if (_.includes(ALL_COMMODITIES, resourceType)) {
                if (COMPRESSED_COMMODITIES.includes(resourceType)) {
                    sellAmount = terminal.room.store(resourceType) - REACTION_AMOUNT;
                } else if (REGIONAL_0_COMMODITIES.includes(resourceType)) {
                    sellAmount = handleRegionalCommodity(resourceType, terminal);
                } else {
                    sellAmount = terminal.room.store(resourceType);
                }
            }

            // Handle boosts and power
            if (_.includes(_.uniq(ALL_BOOSTS, [RESOURCE_POWER]), resourceType)) {
                sellAmount = terminal.room.store(resourceType) - BOOST_AMOUNT(terminal.room) * 1.2;
            }

            if (resourceType === RESOURCE_POWER) {
                sellAmount = terminal.room.store(resourceType) - (POWER_SPAWN_POWER_CAPACITY * 2);
            }

            return sellAmount > terminal.store[resourceType] ? terminal.store[resourceType] : sellAmount;
        }

        function handleRegionalCommodity(resourceType, terminal) {
            if (!terminal.room.impassibleStructures.some(s => s.my && s.structureType === STRUCTURE_FACTORY && s.effects)) {
                return terminal.room.store(resourceType);
            } else {
                return terminal.room.store(resourceType) - (REACTION_AMOUNT * 0.5);
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

    placeBuyOrders(terminal, globalOrders, myOrders) {
        // Iterate over minerals and handle orders
        for (let mineral of shuffle(BASE_MINERALS)) {
            if (MY_MINERALS[mineral] || mineral === RESOURCE_ENERGY || mineral === RESOURCE_BATTERY) continue;

            let target = this.reactionAmount;
            let stored = getResourceTotal(mineral) + (getResourceTotal(Object.keys(COMMODITIES).find(key => COMMODITIES[key].components[mineral])) * 5) || 0;

            if (stored < target) {
                let buyAmount = Math.min(target - stored, 2500);
                let price;

                const activeBuyOrder = _.find(myOrders, (o) => o.roomName === terminal.room.name && o.resourceType === mineral && o.type === ORDER_BUY)
                // Buy orders
                if (!activeBuyOrder) {
                    price = this.calculatePrice(ORDER_BUY, mineral);
                    buyAmount = Math.min(buyAmount, MINERAL_TRADE_AMOUNT);

                    if (createBuyOrder(mineral, price, buyAmount)) break;
                }

                // On demand buy a small amount on mmo shards or buy a larger amount on private servers
                if (['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) target = target * 0.25;
                if (stored < target) {
                    const acceptableMarkup = getAcceptableMarkup(mineral, activeBuyOrder);
                    let sellOrder = _.min(globalOrders.filter(order => order.amount >= 50 && order.resourceType === mineral &&
                        order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName) && order.price < latestMarketHistory(mineral).avg * acceptableMarkup), 'price');

                    if (sellOrder.id && sellOrder.price * buyAmount > Memory._banker.spendingAccount) buyAmount = _.floor(Memory._banker.spendingAccount / sellOrder.price);

                    if (sellOrder.id && buyAmount >= 50) {
                        buyAmount = Math.min(buyAmount, sellOrder.amount, target * 0.3);
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

    fillBuyOrders(terminal, globalOrders) {
        let spareSpace = terminal.store.getFreeCapacity() + terminal.room.storage.store.getFreeCapacity();
        // Dynamically adjust credit buffer based on current market condition
        let dynamicBuffer = Math.max(CREDIT_BUFFER, Game.market.credits * 0.05);  // 5% of credits as buffer
        const spendingAccount = Memory._banker.spendingAccount || 0;
        if (spareSpace > STORAGE_CAPACITY * 0.2 && spendingAccount > dynamicBuffer * 5) return false;

        // Sort resources and filter based on relevance
        let sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[a] - terminal.store[b]);

        for (let resourceType of sortedKeys) {
            if ((resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) &&
                (terminal.room.energyState < 2 || !_.find(MY_ROOMS, r => Game.rooms[r].terminal && Game.rooms[r].energyState < 2))) continue;

            let keepAmount = determineKeepAmount(resourceType);
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

        function determineKeepAmount(resourceType) {
            // Dynamically adjust based on market conditions and resource needs
            let keepAmount = DUMP_AMOUNT;
            // If its energy or battery, keep a buffer
            if (_.includes(ALL_COMMODITIES, resourceType)) {
                keepAmount = getDynamicKeepAmount(resourceType);
            }
            return keepAmount;
        }

        function getDynamicKeepAmount(resourceType) {
            // Implement smarter logic for determining keepAmount based on the current market trend, etc.
            if (COMPRESSED_COMMODITIES.includes(resourceType)) return REACTION_AMOUNT;
            if (REGIONAL_0_COMMODITIES.includes(resourceType)) return terminal.room.factory && terminal.room.factory.effects ? REACTION_AMOUNT * 0.5 : 0;
            if (BASE_COMMODITIES.includes(resourceType)) return terminal.room.factory ? REACTION_AMOUNT * 0.5 : 0;
        }

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
            // Get the linear distance between the two rooms
            let distance = Game.map.getRoomLinearDistance(roomName1, terminal.room.name);

            // Calculate the transaction cost using the formula
            let cost = Math.ceil(amount * (1 - Math.exp(-distance / 30)));

            return cost;
        }
    }

    balanceResources(terminal) {
        // Sort by most to least
        let sortedKeys = Object.keys(terminal.store).sort((a, b) => terminal.store[b] - terminal.store[a]);
        for (let resource of sortedKeys) {
            // Skip energy and handle it separately
            if (resource === RESOURCE_ENERGY || resource === RESOURCE_BATTERY) continue;

            let keepAmount = determineKeepAmount(resource);
            if (terminal.room.store(resource) < keepAmount) continue;
            let available = Math.max(terminal.store[resource], 0);

            // Skip if available amount is too low
            if (available < 100) continue;

            let needyTerminal = findNeedyTerminal(terminal, resource, available);

            // If a needy terminal is found, send the resource
            if (needyTerminal) {
                if (sendResource(terminal, resource, available, needyTerminal, usedTerminals)) return true;
            } else if (terminal.room.name !== Memory.saleTerminal.room && Game.rooms[Memory.saleTerminal.room].terminal.store.getFreeCapacity()) {
                // Fallback to sending to the sale terminal if no needy terminal
                if (sendResource(terminal, resource, available, Memory.saleTerminal.room, usedTerminals)) return true;
            }
        }
        return false;


        function determineKeepAmount(resource) {
            // Dynamically determine keepAmount based on resource type
            if (ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource) || resource === RESOURCE_OPS || resource === RESOURCE_POWER) {
                return 0;
            }
            if (LAB_PRIORITY.includes(resource)) return BOOST_AMOUNT(terminal.room) * 2;
            if (ALL_BOOSTS.includes(resource)) return BOOST_AMOUNT(terminal.room);
            if (resource === RESOURCE_BATTERY) return 1000;
            if (BASE_MINERALS.includes(resource)) return REACTION_AMOUNT;
            if (COMPRESSED_COMMODITIES.includes(resource)) return 1000;
            if (resource === RESOURCE_GHODIUM) return SAFE_MODE_COST + NUKER_GHODIUM_CAPACITY;
            if (terminal.room.nukes.length) return 0;
            return this.reactionAmount; // Default reaction amount
        }

        function findNeedyTerminal(terminal, resource, available) {
            let needyTerminal = null;

            if (terminal.room.energyState) {
                needyTerminal = _.find(Game.structures, r =>
                    r.room.name !== terminal.room.name &&
                    r.structureType === STRUCTURE_TERMINAL &&
                    r.store.getFreeCapacity() &&
                    r.room.store(resource) < terminal.room.store(resource) &&
                    r.room.store(resource) < determineKeepAmount(resource) * 0.8 &&
                    Game.market.calcTransactionCost(5000, terminal.room.name, r.room.name) < terminal.room.energy * 0.01
                );
            }

            // If no needy terminal found, check for allied requests
            if (!needyTerminal && _.size(ALLY_HELP_REQUESTS)) {
                for (let ally of _.sortBy(_.filter(ALLY_HELP_REQUESTS), 'priority')) {
                    needyTerminal = _.find(ally, (r) => r.requestType === 0 && r.resourceType === resource);
                    if (needyTerminal) {
                        needyTerminal = needyTerminal.roomName;
                        break;
                    }
                }
            }

            // Return the room name of the needy terminal, if any
            return needyTerminal ? needyTerminal.room.name : null;
        }

        function sendResource(terminal, resource, available, destinationRoom, usedTerminals) {
            let neededAmount = 5000;  // Standard max amount to send
            available = Math.min(available, neededAmount);

            if (available > 25) {
                // Send the resource and log the transaction
                switch (terminal.send(resource, available, destinationRoom)) {
                    case OK:
                        log.a(`Balancing ${available} ${resource} to ${roomLink(destinationRoom)} from ${roomLink(terminal.room.name)}`, "Market: ");
                        usedTerminals[destinationRoom] = {tick: Game.time};
                        usedTerminals[terminal.room.name] = {tick: Game.time};
                        return true;
                }
            }
            return false;
        }
    }

    balanceEnergy(terminal) {
        // Check if it's a good time to balance energy
        if (INTEL[terminal.room.name].threatLevel || terminal.room.nukes.length || terminal.room.energyState < 2) return;

        // Attempt to find a needy terminal in the room
        let needyTerminal = findNeedyTerminal(terminal);

        if (!needyTerminal) {
            // If no needy terminal is found, check if we should send to the sale terminal
            if (shouldSendToSaleTerminal(terminal)) {
                sendEnergyOrBattery(terminal, Memory.saleTerminal.room);
                return true;
            }
        } else {
            // If a needy terminal is found, send energy or batteries
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

            if (!needyTerminal) {
                // If no needy terminal found, check for allied needs
                for (let ally of _.filter(ALLY_HELP_REQUESTS)) {
                    needyTerminal = _.find(ally, (r) => r.requestType === 0 && r.resourceType === RESOURCE_ENERGY);
                    if (needyTerminal) {
                        needyTerminal = needyTerminal.roomName;
                        break;
                    }
                }
            }

            return needyTerminal ? needyTerminal.room.name : null;
        }

        function shouldSendToSaleTerminal(terminal) {
            return terminal.room.energyState > 1 && terminal.room.name !== Memory.saleTerminal.room &&
                Game.rooms[Memory.saleTerminal.room].terminal.store.getFreeCapacity();
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
        // Only proceed if the terminal has energy and isn't already in a critical state
        if (terminal.energyState <= 1 || !terminal.store[RESOURCE_ENERGY] || INTEL[terminal.room.name].requestingSupport || INTEL[terminal.room.name].threatLevel || terminal.room.nukes.length) {
            return false;
        }

        // Identify rooms in urgent need of energy, focusing on those with a threat level of 3 or higher
        let responseNeeded = _.filter(MY_ROOMS, (r) => r !== terminal.room.name && INTEL[r] && INTEL[r].threatLevel >= 3 && Game.rooms[r].terminal && Game.rooms[r].energyState < 2);
        if (responseNeeded.length === 0) return false;

        // Find the room with the lowest energy
        let lowestEnergyRoom = _.min(responseNeeded, (r) => Game.rooms[r].energy);
        let needyTerminal = Game.rooms[lowestEnergyRoom].terminal;

        // Calculate the amount of energy to send (20% of available energy)
        let availableAmount = Math.max(terminal.store[RESOURCE_ENERGY] * 0.2, 1);  // Ensure at least 1 energy is sent if possible
        if (availableAmount <= 0) return false;

        // Send energy to the needy terminal
        if (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name) === OK) {
            log.a(`Emergency Supplies: Sent ${availableAmount} ${RESOURCE_ENERGY} to ${roomLink(needyTerminal.room.name)} from ${roomLink(terminal.room.name)}`, "Market: ");
            return true;
        }

        return false;
    }

    dealFinder(terminal, globalOrders) {
        const FLIP_MARGIN_THRESHOLD = (resourceType) => {
            switch (resourceType) {
                case RESOURCE_ENERGY:
                    return 0.2; // 20% margin for energy
                case RESOURCE_GHODIUM:
                    return 0.5; // 50% margin for niche resources
                default:
                    return 0.3; // Default 30% for most resources
            }
        };

        const MIN_PROFIT_MARGIN = (resourceType) => {
            switch (resourceType) {
                case RESOURCE_ENERGY:
                    return 500; // Minimum profit of 500 for energy flips
                case RESOURCE_GHODIUM:
                    return 1000; // Minimum profit of 1000 for ghodium flips
                default:
                    return 500; // Default 500 for other resources
            }
        };

        if (terminal.store.getFreeCapacity() <= 0) return false;  // Early exit if terminal is full

        // Filter and sort sell orders by price, considering transaction cost and margin for flipping
        let validSellOrders = globalOrders.filter(order =>
            order.type === ORDER_SELL &&
            latestMarketHistory(order.resourceType) &&
            order.price <= latestMarketHistory(order.resourceType).avg * (1 - FLIP_MARGIN_THRESHOLD) &&
            (!order.roomName || Game.market.calcTransactionCost(order.amount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY] * 0.5)
        );

        if (validSellOrders.length === 0) return false;  // Early exit if no valid orders found

        // Find the sell order with the lowest price
        let sellOrder = _.min(validSellOrders, 'price');
        if (!sellOrder) return false;  // Early exit if no valid sell order found

        // Profit Estimation: calculate potential profit margin after transaction costs
        let buyAmount = sellOrder.amount;
        let maxSpendAmount = Memory._banker.spendingAccount * 0.1;

        // Adjust buyAmount based on available spending money
        if (sellOrder.price * buyAmount > maxSpendAmount) {
            buyAmount = _.round(buyAmount * (maxSpendAmount / (sellOrder.price * buyAmount)));
        }

        // Skip if the profit margin isn't worth it
        let transactionCost = Game.market.calcTransactionCost(buyAmount, terminal.room.name, sellOrder.roomName);
        let potentialProfit = buyAmount * sellOrder.price - transactionCost;
        if (potentialProfit < MIN_PROFIT_MARGIN) return false;  // Don't execute deal if profit margin is too low

        // Log the deal details
        log.w(`DEAL DEAL DEAL: Buying ${buyAmount} ${sellOrder.resourceType} for ${sellOrder.price} credits. Estimated profit: ${potentialProfit} credits. Average price: ${latestMarketHistory(sellOrder.resourceType).avg}`, "Market: ");

        // Attempt the deal
        if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
            log.w(`Bought ${buyAmount} ${sellOrder.resourceType} for ${sellOrder.price * buyAmount} credits in ${roomLink(terminal.room.name)}`, "Market: ");
            Memory._banker.spendingAccount -= (sellOrder.price * buyAmount);  // Deduct from the spending money account
            log.w(`Remaining spending account: ${Memory._banker.spendingAccount}`, "Market: ");

            // Now look to sell the item for profit
            let sellOrderList = globalOrders.filter(order =>
                order.type === ORDER_BUY &&
                order.resourceType === sellOrder.resourceType &&
                order.price >= sellOrder.price * (1 + FLIP_MARGIN_THRESHOLD) &&
                Game.market.calcTransactionCost(buyAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY] * 0.5
            );

            let sellOrderForProfit = _.max(sellOrderList, 'price');
            if (sellOrderForProfit && sellOrderForProfit.id) {
                let sellAmount = Math.min(buyAmount, sellOrderForProfit.amount);
                let transactionCostForSale = Game.market.calcTransactionCost(sellAmount, terminal.room.name, sellOrderForProfit.roomName);
                if (transactionCostForSale <= terminal.store[RESOURCE_ENERGY]) {
                    switch (Game.market.deal(sellOrderForProfit.id, sellAmount, terminal.pos.roomName)) {
                        case OK:
                            log.w(`Flipped ${sellAmount} ${sellOrder.resourceType} for ${sellOrderForProfit.price * sellAmount} credits. Profit: ${sellAmount * (sellOrderForProfit.price - sellOrder.price)} credits`, "Market: ");
                            Memory._banker.spendingAccount += sellAmount * sellOrderForProfit.price;
                            log.w(`Updated spending account: ${Memory._banker.spendingAccount}`, "Market: ");
                            return true;
                    }
                }
            }
        }
        return false;  // No deal executed
    }

    sellPixels(terminal, globalOrders) {
        let sellAmount = Game.resources[PIXEL] - PIXEL_BUFFER;
        if (sellAmount >= 10) {
            // Determine the optimal price based on market trends
            let averagePrice = latestMarketHistory(PIXEL).avg;  // Get the latest market average price for PIXEL
            let priceMargin = 1.2;  // Add a 20% profit margin over the market average (adjust as needed)
            let sellPrice = averagePrice * priceMargin;

            // Determine if the sell price is too low or unrealistic
            if (sellPrice < 0.1) {
                log.w("Calculated sell price for Pixel is too low, not placing an order.", "Market: ");
                return false;
            }

            // Place a new sell order at the determined price
            let orderResult = Game.market.createOrder({
                resourceType: PIXEL,
                amount: sellAmount,
                price: sellPrice,
                type: ORDER_SELL,
                roomName: terminal.room.name
            });

            if (orderResult === OK) {
                log.w(`Placed Sell Order for ${sellAmount} Pixels at ${sellPrice} credits each.`, "Market: ");
                Memory._banker.spendingAccount += sellPrice * sellAmount;  // Update the spending account
                log.w("New spending account amount - " + Memory._banker.spendingAccount, "Market: ");
                return true;
            } else {
                log.w("Failed to place Sell Order for Pixels.", "Market: ");
                return false;
            }
        }
        return false;
    }

    profitCheck(force = false) {
        const hourlyTick = EST_TICKS_PER_MIN * 60;
        const fiveMinuteTick = EST_TICKS_PER_MIN * 5;
        let profitTracking = Memory._banker || {};

        // If forced or hourly check is due
        if (force || profitTracking.lastData + hourlyTick < Game.time || !profitTracking.lastData) {
            profitTracking.lastData = Game.time;

            // Last known market credits for the hourly change calculation
            const lastCredit = profitTracking.lastTotalAmount || Game.market.credits;
            profitTracking.lastTotalAmount = Game.market.credits;

            let hourChange = Game.market.credits - lastCredit;

            // Private server handling (excluding shard0-3)
            if (!['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) {
                // Reinvest credits more aggressively when we're not on the public shard
                profitTracking.spendingAccount = Math.max(Game.market.credits - CREDIT_BUFFER, 0); // Ensure spendingMoney is not negative
                log.w(`New spending account amount (HOURLY UPDATE) - ${profitTracking.spendingAccount}`, "Market: ");
            }
            // Cap spending money on official servers
            else if (Game.market.credits > 150000 && profitTracking.spendingAccount > 150000) {
                profitTracking.spendingAccount = 150000;
                log.w(`New spending account amount (HOURLY UPDATE) - ${profitTracking.spendingAccount}`, "Market: ");
            }
            // Add 90% of the profit to spending account for the hour to aggressively reinvest
            else if (hourChange > 0) {
                profitTracking.spendingAccount += hourChange * 0.9; // Keep more profit for re-investment
                log.w(`New spending account amount (HOURLY UPDATE) - ${profitTracking.spendingAccount}`, "Market: ");
            } else {
                profitTracking.spendingAccount += hourChange; // If no profit, just adjust with the change
                log.w(`New spending account amount (HOURLY UPDATE) - ${profitTracking.spendingAccount}`, "Market: ");
            }

            // Track resources for profitable buys
            if (hourChange > 0) {
                const buyingThreshold = 0.7;  // Buy when price is 30% lower than average
                const globalOrders = this.getGlobalOrders();

                // Look for commodities with big price dips
                globalOrders.forEach(order => {
                    if (order.type === ORDER_BUY && order.price <= latestMarketHistory(order.resourceType).avg * buyingThreshold) {
                        let availableAmount = order.amount;

                        // Only buy when there's enough available funds to avoid excess spending
                        if (availableAmount * order.price <= hourChange * 0.25) {
                            let buyAmount = Math.min(availableAmount, Math.floor(hourChange / order.price));
                            log.w(`Buying ${buyAmount} ${order.resourceType} for ${order.price} credits each.`, "Market: ");
                            if (Game.market.deal(order.id, buyAmount) === OK) {
                                hourChange -= buyAmount * order.price;  // Deduct the purchase from the profit
                                profitTracking.spendingAccount -= buyAmount * order.price;  // Deduct the purchase from the spending account
                                log.w(`Bought ${buyAmount} ${order.resourceType} for ${buyAmount * order.price} credits. New spending account amount - ${profitTracking.spendingAccount}`, "Market: ");
                            }
                        }
                    }
                });
            }

            // Clear any old hourly profit tracking
            profitTracking.hourArray = undefined;
        }
        // If a random influx is due
        else if (profitTracking.lastInflux + fiveMinuteTick < Game.time || !profitTracking.lastInflux) {
            profitTracking.lastInflux = Game.time;

            // Random influx when spending money is low
            if (Game.market.credits > CREDIT_BUFFER && Math.random() > 0.5 && profitTracking.spendingAccount < 1000) {
                const bankersCut = (Game.market.credits - CREDIT_BUFFER) * 0.9; // Keep 90% of the influx for buying
                profitTracking.spendingAccount += bankersCut * 0.1; // Allocate 10% for more flexible spending
                log.w(`New spending account amount (RANDOM INFLUX) - ${profitTracking.spendingAccount}`, "Market: ");
            }
        }

        Memory._banker = profitTracking;  // Store the updated profit tracking data
    }

    tradeDiplomacyTracker() {
        // Return early if we're not on the main shard
        if (!['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) return;

        // Fetch incoming transactions and filter by time
        let incoming = Game.market.incomingTransactions.filter(t => t && t.time > diplomacyTracker);

        if (incoming.length > 0) {
            // Iterate over incoming trades
            for (let trade of incoming) {
                // Ensure the sender has a username
                if (trade.sender && trade.sender.username) {
                    let multi = getTradeMultiplier(trade.resourceType);
                    let increase = trade.amount / multi;

                    // Process the user's standing
                    this.processUserStanding(trade.sender.username, increase);
                }
            }
            // Update the lastCheckedIncoming timestamp
            diplomacyTracker = Math.max(...incoming.map(t => t.time));
        }

        function getTradeMultiplier(resourceType) {
            if (_.includes(TIER_1_BOOSTS, resourceType) || _.includes(COMPRESSED_COMMODITIES, resourceType)) {
                return 750;
            } else if (_.includes(TIER_2_BOOSTS, resourceType)) {
                return 500;
            } else if (_.includes(TIER_3_BOOSTS, resourceType) || resourceType === RESOURCE_POWER) {
                return 200;
            }
            return 1000; // Default multiplier for other resources
        }
    }

    processUserStanding(username, increase) {
        if (!Memory._userList) {
            Memory._userList = {};  // Initialize user list if it doesn't exist
        }

        let user = Memory._userList[username];

        // If the user exists, update their standing
        if (user) {
            user.standing += increase;
            user.standing = Math.min(user.standing, 50);  // Cap the standing at 50
            user.lastChange = Game.time;
        } else {
            // If the user doesn't exist, create a new entry and log it
            Memory._userList[username] = {
                standing: increase,
                lastChange: Game.time,
            };
            log.w(`${username} is now considered a friend due to trade.`);
        }
    }

    orderCleanup(myOrders) {
        // Ensure myOrders is an object and contains valid order data
        if (typeof myOrders !== 'object' || Object.keys(myOrders).length === 0) {
            return;
        }

        const currentCredits = Game.market.credits;
        const marketPriceChangeThreshold = 0.15; // 15% change in price is considered significant

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

            // Check if order is in the sale terminal room
            if (order.type === ORDER_SELL && order.roomName !== Memory.saleTerminal.room) {
                this.cancelOrder(order, 'Not in the sale terminal room');
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
                        let cancelThreshold = 0.85; // Cancel if price is 15% below average

                        if (currentPriceRatio < cancelThreshold) {
                            // If the price is significantly below market average, cancel the order
                            this.cancelOrder(order, 'Price significantly below market average');
                        } else {
                            // If not too far below average, consider extending if it's profitable
                            let profitMargin = 1.05; // Expect at least 5% profit margin
                            let potentialProfit = (marketHistory.avg - order.price) * availableAmount;
                            let cost = order.price * availableAmount * 0.05; // 5% fee for extending order

                            if (potentialProfit > cost && cost <= Memory._banker.spendingAccount * 0.1) {
                                // Extend only if profitable and we have funds
                                if (Game.market.extendOrder(order.id, availableAmount) === OK) {
                                    Memory._banker.spendingAccount -= cost;
                                    log.w(`Extended sell order ${order.id} by ${availableAmount} ${order.resourceType} in ${roomLink(order.roomName)}`, "Market: ");
                                    log.w(`Remaining spending account amount - ${Memory._banker.spendingAccount}`, "Market: ");
                                }
                            }
                        }
                    } else {
                        // No market history available, consider canceling or keeping current strategy
                        //this.cancelOrder(order, 'No recent market history for pricing decision');
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
                if (marketHistory.trend5 > 0) return Math.max(newPrice, marketHistory.trend5);
                return Math.max(newPrice, marketHistory.avg * 0.8);
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
                    return Math.min((lowestSell.price - 0.01), (highestBuy.price - 0.01))
                }
                return 1;
            } else {
                if (highestBuy && highestBuy.price) {
                    return Math.max((highestBuy.price + 0.01), (highestBuy.price + 0.01))
                }
                return 1;
            }
        }
    }
}

profiler.registerClass(TerminalControl, 'TerminalControl');
module.exports = TerminalControl;