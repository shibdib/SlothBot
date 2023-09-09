/*
 * Copyright (c) 2020.
 * Github - Shibdib
 * Name - Bob Sardinia
 * Project - Overlord-Bot (Screeps)
 */

/**
 * Created by rober on 6/21/2017.
 */

let tradeAmount = MINERAL_TRADE_AMOUNT;
let reactionAmount = REACTION_AMOUNT;
let runOnce, globalOrders, lastPriceAdjust, spendingMoney, lastEnergyPurchase;
let tickTracker = {};
if (Memory._banker) spendingMoney = Memory._banker.spendingAccount; else spendingMoney = 0;

module.exports.terminalControl = function (room) {
    let lastRun = tickTracker[room.name] || 0;
    if (!room.terminal || room.terminal.cooldown || lastRun + 100 > Game.time) return;
    tickTracker[room.name] = Game.time;
    // Handle season stuff
    if (Game.shard.name === 'shardSeason') {
        balanceResources(room.terminal);
        return;
    }
    Memory.saleTerminal = Memory.saleTerminal || {};
    // If sale terminal has a nuke incoming clear it
    if (Memory.saleTerminal.room && Game.rooms[Memory.saleTerminal.room] && Game.rooms[Memory.saleTerminal.room].nukes.length) {
        log.a(roomLink(Memory.saleTerminal.room) + ' is no longer the primary market room due to an incoming nuke.');
        Memory.saleTerminal.room = undefined;
    }
    // Set saleTerminal
    if (!Memory.saleTerminal.room || Memory.saleTerminal.saleSet + 15000 < Game.time || !Game.rooms[Memory.saleTerminal.room]) {
        // Clear if no longer valid
        if (!Game.rooms[Memory.saleTerminal.room] || !INTEL[Memory.saleTerminal.room] || INTEL[Memory.saleTerminal.room].owner !== MY_USERNAME) Memory.saleTerminal = {};
        if (Memory.saleTerminal.room && Game.rooms[Memory.saleTerminal.room].controller.level === MAX_LEVEL) {
            return Memory.saleTerminal.saleSet = Game.time;
        }
        Memory.saleTerminal.room = _.sample(_.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && !s.room.memory.praiseRoom && s.room.level === MAX_LEVEL && !s.room.nukes.length && s.isActive() && _.sum(s.store) < s.store.getCapacity() * 0.9)).room.name;
        Memory.saleTerminal.saleSet = Game.time;
    }
    let myOrders = Game.market.orders;
    // Get global orders
    globalOrders = Game.market.getAllOrders();
    if (room.name === Memory.saleTerminal.room) {
        if (Memory._banker) {
            if (spendingMoney > Game.market.credits - CREDIT_BUFFER) spendingMoney = Game.market.credits - (CREDIT_BUFFER * 1.1);
            Memory._banker.spendingAccount = _.floor(spendingMoney, 1);
        }
        // Track profits
        profitCheck();
        // Check for diplomatic changes based on trade
        tradeDiplomacyTracker();
        // Sell pixels
        if (!!~['shard0', 'shard1', 'shard2', 'shard3'].indexOf(Game.shard.name)) sellPixels(globalOrders);
        // Update prices
        if ((lastPriceAdjust || 0) + 100 < Game.time) {
            pricingUpdate(globalOrders, myOrders);
            lastPriceAdjust = Game.time;
        }
        // Cleanup broken or old orders
        orderCleanup(myOrders);
        // Place sell orders
        if (!['swc', 'botarena'].includes(Game.shard.name)) placeSellOrders(room.terminal, globalOrders, myOrders);
        if (spendingMoney > 0) {
            // Buy resources being sold at below market value
            if (dealFinder(room.terminal, globalOrders)) return;
            // Buy Power
            if (buyPower(room.terminal, globalOrders)) return;
        }
        //Dump Excess
        if (fillBuyOrders(room.terminal, globalOrders)) return;
    }
    // Place buy orders
    if (placeBuyOrders(room.terminal, globalOrders, myOrders)) return;
    //Send energy to rooms under siege or struggling
    if (emergencyEnergy(room.terminal)) return;
    //Disperse Minerals and Boosts
    if (balanceResources(room.terminal)) return;
    //Disperse energy
    balanceEnergy(room.terminal)
};

function orderCleanup(myOrders) {
    let myRooms = _.filter(Game.rooms, (r) => r.energyAvailable && r.controller.owner && r.controller.owner.username === MY_USERNAME);
    for (let order of _.filter(myOrders)) {
        // Cancel inactive
        if (!order.active) {
            if (Game.market.cancelOrder(order.id) === OK) {
                log.e("Order Cancelled: " + order.id + " no longer active.", 'MARKET: ');
                continue;
            }
        }
        // Cancel non sale terminal
        if (order.roomName !== Memory.saleTerminal.room) {
            if (Game.market.cancelOrder(order.id) === OK) {
                log.e("Order Cancelled: " + order.id + " as it's not the sale terminal room.", 'MARKET: ');
                continue;
            }
        }
        if (order.type === ORDER_BUY) {
            // Only sale terminal room buys
            if (Memory.saleTerminal && order.roomName !== Memory.saleTerminal.room) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " as it is not the market room.", 'MARKET: ');
                    continue;
                }
            }
            // Super broke
            if (Game.market.credits < 50) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " due to low credits.", 'MARKET: ');
                    continue;
                }
            }
            // Remove duplicates for same resource
            let duplicate = _.filter(myOrders, (o) => o.roomName === order.roomName &&
                o.resourceType === order.resourceType && o.type === order.type && o.id !== order.id);
            if (duplicate.length) {
                log.e("Order Cancelled: " + order.id + " duplicate order.", 'MARKET: ');
                duplicate.forEach((duplicateOrder) => Game.market.cancelOrder(duplicateOrder.id))
            }
            if (order.resourceType !== RESOURCE_ENERGY) {
                if (order.remainingAmount > tradeAmount) {
                    if (Game.market.cancelOrder(order.id) === OK) {
                        log.e("Order Cancelled: " + order.id + " for exceeding the set trade amount (order amount/set limit) " + order.remainingAmount + "/" + tradeAmount, 'MARKET: ');
                        continue;
                    }
                }
            } else if (order.resourceType === RESOURCE_ENERGY) {
                if (_.find(myRooms, (r) => r.terminal && r.energy >= ENERGY_AMOUNT[r.level] * 2)) {
                    if (Game.market.cancelOrder(order.id) === OK) {
                        log.e("Order Cancelled: " + order.id + " we have a room with an energy surplus and do not need to purchase energy", 'MARKET: ');
                        continue;
                    }
                }
            }
            if (order.amount === 0) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " - Order Fulfilled.", 'MARKET: ');
                    continue;
                }
            }
        } else {
            // do no create sell orders on SWC or BA
            if (['swc', 'botarena'].includes(Game.shard.name)) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " - No selling in BA or SWC.", 'MARKET: ');
                    continue;
                }
            }
            if (Game.rooms[order.roomName].terminal.store[order.resourceType] - order.remainingAmount > 1500) {
                let amount = Game.rooms[order.roomName].terminal.store[order.resourceType] - order.remainingAmount;
                if (amount > 0) {
                    let cost = order.price * amount * 0.05;
                    if (cost > spendingMoney) amount = _.round(spendingMoney / (order.price * 0.05));
                    if (Game.market.extendOrder(order.id, amount) === OK) {
                        log.w("Extended sell order " + order.id + " an additional " + amount + " " + order.resourceType + " in " + roomLink(order.roomName), "Market: ");
                        spendingMoney -= (order.price * amount * 0.05);
                        log.w("Remaining spending account amount - " + spendingMoney, "Market: ");
                    }
                }
            }
            if (order.resourceType !== RESOURCE_ENERGY && order.resourceType !== RESOURCE_BATTERY) {
                if (!order.amount) {
                    if (Game.market.cancelOrder(order.id) === OK) {
                        log.e("Order Cancelled: " + order.id + " - Not enough resources remaining in terminal.", 'MARKET: ');
                        continue;
                    }
                }
            } else if (Game.rooms[order.roomName].energyState < 2) {
                if (Game.market.cancelOrder(order.id) === OK) {
                    log.e("Order Cancelled: " + order.id + " - Cancel sale of energy as we have a shortage in the room.", 'MARKET: ');
                    continue;
                }
            }
        }
        if (!Game.rooms[order.roomName]) {
            if (Game.market.cancelOrder(order.id) === OK) {
                log.e("Order Cancelled: " + order.id + " we no longer own this room", 'MARKET: ');
            }
        }
    }
}

let priceUpdateTracker = {};
function pricingUpdate(globalOrders, myOrders) {
    for (let key in myOrders) {
        let order = myOrders[key];
        if (!priceUpdateTracker[order.id]) priceUpdateTracker[order.resourceType] = {};
        else if (priceUpdateTracker[order.id].lastChange + 2000 > Game.time) continue;
        if (order.type === ORDER_SELL) {
            let currentPrice = order.price;
            let newPrice = currentPrice;
            // Pricing
            if (latestMarketHistory(order.resourceType)) {
                newPrice = latestMarketHistory(order.resourceType)['avgPrice'];
            } else {
                let competitorOrder = _.min(globalOrders.filter(order => !_.includes(MY_ROOMS, order.roomName) && order.resourceType === order.resourceType && order.type === ORDER_SELL), 'price');
                if (competitorOrder.id) {
                    newPrice = competitorOrder.price - 0.001;
                }
            }
            let cost = 0;
            if (currentPrice < newPrice) {
                cost = (newPrice - currentPrice) * order.remainingAmount * 0.05;
            }
            let availableCash = Game.market.credits - CREDIT_BUFFER;
            if (currentPrice !== newPrice && cost <= availableCash) {
                if (Game.market.changeOrderPrice(order.id, newPrice)) {
                    priceUpdateTracker[order.id].lastChange = Game.time;
                    log.w("Sell order price change " + order.id + " new/old " + newPrice + "/" + order.price + " Resource - " + order.resourceType, "Market: ");
                }
            }
        } else {
            let currentPrice = order.price;
            let newPrice = currentPrice;
            let averagePrice;
            if (latestMarketHistory(order.resourceType)) averagePrice = latestMarketHistory(order.resourceType)['avgPrice'] + 0.001;
            let competitorOrder = _.max(globalOrders.filter(o => !_.includes(MY_ROOMS, o.roomName) && o.resourceType === order.resourceType && o.type === ORDER_BUY), 'price');
            if (competitorOrder.id) {
                newPrice = competitorOrder.price + 0.001;
            } else if (averagePrice) newPrice = averagePrice;
            // Do not buy over average price
            if (averagePrice < newPrice) newPrice = averagePrice;
            let cost = 0;
            if (currentPrice < newPrice) {
                cost = (newPrice - currentPrice) * order.remainingAmount * 0.05;
            }
            let availableCash = Game.market.credits - CREDIT_BUFFER;
            if (currentPrice !== newPrice && cost <= availableCash) {
                if (Game.market.changeOrderPrice(order.id, newPrice)) {
                    priceUpdateTracker[order.id].lastChange = Game.time;
                    log.w("Buy order price change " + order.id + " new/old " + newPrice + "/" + order.price + " Resource - " + order.resourceType, "Market: ");
                }
            }
        }
    }
}

function placeSellOrders(terminal, globalOrders, myOrders) {
    for (let resourceType of Object.keys(terminal.store)) {
        let sellAmount = 0;
        if (Game.market.credits <= 0) return false;
        // Avoid Duplicates
        if (_.filter(myOrders, (o) => o.roomName === terminal.pos.roomName && o.resourceType === resourceType && o.type === ORDER_SELL).length) continue;
        // Energy
        if (resourceType === RESOURCE_ENERGY && terminal.room.energyState > 2) sellAmount = terminal.room.energy - ENERGY_AMOUNT[terminal.room.level] * 2; else if (resourceType === RESOURCE_ENERGY && terminal.room.energyState <= 2) continue;
        if (resourceType === RESOURCE_BATTERY && terminal.room.energyState > 2) sellAmount = terminal.room.store(resourceType) - 2000; else if (resourceType === RESOURCE_BATTERY && terminal.room.energyState <= 2) continue;
        // Handle minerals (don't sell base minerals if there's a factory)
        if (BASE_MINERALS.includes(resourceType) && terminal.room.factory) continue;
        if (_.includes(_.union(BASE_MINERALS, BASE_COMPOUNDS, BASE_COMMODITIES), resourceType)) {
            sellAmount = terminal.room.store(resourceType) - REACTION_AMOUNT;
        }
        // Handle commodities
        if (_.includes(ALL_COMMODITIES, resourceType)) {
            if (COMPRESSED_COMMODITIES.includes(resourceType)) sellAmount = terminal.room.store(resourceType) - REACTION_AMOUNT;
            else if (REGIONAL_0_COMMODITIES.includes(resourceType)) {
                if (!_.find(terminal.room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_FACTORY && s.effects)) sellAmount = terminal.room.store(resourceType);
                else sellAmount = terminal.room.store(resourceType) - (REACTION_AMOUNT * 0.5);
            } else if (BASE_COMMODITIES.includes(resourceType)) sellAmount = terminal.room.store(resourceType) - (REACTION_AMOUNT * 0.5);
            else sellAmount = terminal.room.store(resourceType);
        }
        // Handle boosts
        if (_.includes(_.union(TIER_1_BOOSTS, TIER_2_BOOSTS, TIER_3_BOOSTS, [RESOURCE_POWER]), resourceType)) sellAmount = terminal.room.store(resourceType) - BOOST_TRADE_AMOUNT;
        // Power
        if (resourceType === RESOURCE_POWER) sellAmount = terminal.room.store(resourceType) - (POWER_SPAWN_POWER_CAPACITY * 2);
        if (sellAmount > terminal.store[resourceType]) sellAmount = terminal.store[resourceType];
        if (sellAmount < 100) continue;
        // Pricing
        let price = 5;
        if (latestMarketHistory(resourceType)) {
            price = latestMarketHistory(resourceType)['avgPrice'];
        } else {
            let competitorOrder = _.min(globalOrders.filter(order => !_.includes(MY_ROOMS, order.roomName) && order.resourceType === resourceType && order.type === ORDER_SELL), 'price');
            if (competitorOrder.id) {
                price = competitorOrder.price - 0.001;
            }
        }
        let cost = price * sellAmount * 0.05;
        if (cost > Game.market.credits) sellAmount = _.round(Game.market.credits / (price * 0.05));
        if (sellAmount > 0) {
            if (Game.market.createOrder({
                type: ORDER_SELL,
                resourceType: resourceType,
                price: price,
                totalAmount: sellAmount,
                roomName: terminal.pos.roomName
            }) === OK) {
                log.w("New Sell Order: " + resourceType + " at/per " + price + ' in ' + roomLink(terminal.room.name), "Market: ");
            }
        }
    }
}

function placeBuyOrders(terminal, globalOrders, myOrders) {
    for (let mineral of shuffle(BASE_MINERALS)) {
        // Don't buy minerals you can mine
        if (Memory.harvestableMinerals && Memory.harvestableMinerals.includes(mineral)) continue;
        let target = reactionAmount;
        let stored = getResourceTotal(mineral) + (getResourceTotal(Object.keys(COMMODITIES).find(key => COMMODITIES[key].components[mineral])) * 5) || 0;
        if (stored < target) {
            let buyAmount = target - stored;
            // If not on mmo just buy it
            if (!['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) {
                let sellOrder = _.min(globalOrders.filter(order => order.amount >= 50 && order.resourceType === mineral && order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName)), 'price');
                if (sellOrder.price * buyAmount > spendingMoney) buyAmount = _.floor(spendingMoney / sellOrder.price);
                if (sellOrder.id && buyAmount >= 50) {
                    if (buyAmount > sellOrder.amount) buyAmount = sellOrder.amount;
                    if (buyAmount > 2500) buyAmount = 2500;
                    if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
                        log.w("Bought " + buyAmount + " " + mineral + " for " + (sellOrder.price * buyAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                        spendingMoney -= (sellOrder.price * buyAmount);
                        log.w("Remaining spending account amount - " + spendingMoney, "Market: ");
                        break;
                    }
                }
            } else {
                // Avoid Duplicates
                if (_.filter(myOrders, (o) => o.resourceType === mineral && o.type === ORDER_BUY).length) continue;
                let price = 0.5;
                let averagePrice;
                if (latestMarketHistory(mineral)) {
                    averagePrice = latestMarketHistory(mineral)['avgPrice'] + 0.001;
                }
                let competitorOrder = _.min(globalOrders.filter(order => !_.includes(MY_ROOMS, order.roomName) && order.resourceType === mineral && order.type === ORDER_BUY), 'price');
                if (competitorOrder.id) {
                    price = competitorOrder.price + 0.001;
                } else if (averagePrice) price = averagePrice;
                // Do not buy over average price
                if (averagePrice < price) price = averagePrice;
                if (buyAmount > tradeAmount) buyAmount = tradeAmount;
                if (Game.market.createOrder({
                    type: ORDER_BUY,
                    resourceType: mineral,
                    price: price,
                    totalAmount: buyAmount,
                    roomName: terminal.pos.roomName
                }) === OK) {
                    log.w("New Buy Order: " + mineral + " at/per " + price + ' in ' + roomLink(terminal.room.name), "Market: ");
                    break;
                }
            }
        }
    }
    if (Game.market.credits > BUY_ENERGY_CREDIT_BUFFER) {
        // Buy boosts
        if (BUY_THESE_BOOSTS && BUY_THESE_BOOSTS.length) {
            for (let mineral of shuffle(BUY_THESE_BOOSTS)) {
                let stored = getResourceTotal(mineral) || 0;
                if (stored < BOOST_AMOUNT * (_.size(MY_ROOMS))) {
                    let buyAmount = BOOST_AMOUNT - stored;
                    if (buyAmount > tradeAmount) buyAmount = tradeAmount;
                    // Avoid Duplicates
                    if (_.filter(myOrders, (o) => o.resourceType === mineral && o.type === ORDER_BUY).length) continue;
                    let price = 0.5;
                    let averagePrice;
                    if (latestMarketHistory(mineral)) {
                        averagePrice = latestMarketHistory(mineral)['avgPrice'] + 0.001;
                    }
                    let competitorOrder = _.min(globalOrders.filter(order => !_.includes(MY_ROOMS, order.roomName) && order.resourceType === mineral && order.type === ORDER_BUY), 'price');
                    if (competitorOrder.id) {
                        price = competitorOrder.price + 0.001;
                    } else if (averagePrice) price = averagePrice;
                    // Do not buy over average price
                    if (averagePrice < price) price = averagePrice;
                    if (Game.market.createOrder({
                        type: ORDER_BUY,
                        resourceType: mineral,
                        price: price,
                        totalAmount: buyAmount,
                        roomName: terminal.pos.roomName
                    }) === OK) {
                        log.w("New Buy Order: " + mineral + " at/per " + price + ' in ' + roomLink(terminal.room.name), "Market: ");
                    }
                }
            }
        }
        // Buy energy
        if (BUY_ENERGY) {
            if (!terminal.room.energyState && !_.find(myOrders, (o) => o.resourceType === RESOURCE_ENERGY && o.roomName === terminal.room.name)) {
                let price = 0.5;
                let averagePrice;
                if (latestMarketHistory(RESOURCE_ENERGY)) {
                    averagePrice = latestMarketHistory(RESOURCE_ENERGY)['avgPrice'] + 0.001;
                }
                let competitorOrder = _.max(globalOrders.filter(order => !_.includes(MY_ROOMS, order.roomName) && order.resourceType === RESOURCE_ENERGY && order.type === ORDER_BUY), 'price');
                if (competitorOrder.id) {
                    price = competitorOrder.price + 0.001;
                } else if (averagePrice) price = averagePrice;
                // Do not buy over average price
                if (averagePrice < price) price = averagePrice;
                if (Game.market.createOrder({
                    type: ORDER_BUY,
                    resourceType: RESOURCE_ENERGY,
                    price: price,
                    totalAmount: 10000,
                    roomName: terminal.pos.roomName
                }) === OK) {
                    log.w("New Buy Order: " + RESOURCE_ENERGY + " at/per " + price + ' in ' + roomLink(terminal.room.name), "Market: ");
                    return true;
                }
            }
        }
    }
}

function buyPower(terminal, globalOrders) {
    let stored = terminal.store[RESOURCE_POWER] + terminal.room.storage.store[RESOURCE_POWER] || 0;
    if (stored >= POWER_SPAWN_POWER_CAPACITY) return;
    let buyAmount = reactionAmount - stored;
    if (buyAmount >= 1000) {
        let orders = globalOrders.filter(order => order.resourceType === RESOURCE_POWER && order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName));
        let maxPrice = _.min(orders, 'price').price;
        let filteredOrders = orders.filter(o => o.price >= maxPrice * 0.9);
        let seller = _.min(filteredOrders, function (o) {
            return Game.market.calcTransactionCost(1000, terminal.room.name, o.roomName);
        })
        if (seller.id) {
            if (Game.market.deal(seller.id, buyAmount, terminal.pos.roomName) === OK) {
                log.w("Bought " + buyAmount + " POWER for " + (seller.price * buyAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                spendingMoney -= (seller.price * buyAmount);
                log.w("Remaining spending account amount - " + spendingMoney, "Market: ");
                return true;
            }
        }
    }
}

function buyEnergy(terminal, globalOrders) {
    if (!terminal.room.energyState) {
        let orders = globalOrders.filter(order => order.resourceType === RESOURCE_ENERGY && order.type === ORDER_SELL && !_.includes(MY_ROOMS, order.roomName));
        let maxPrice = _.min(orders, 'price').price;
        console.log(maxPrice)
        let filteredOrders = orders.filter(o => o.price >= maxPrice * 0.9);
        let seller = _.min(filteredOrders, function (o) {
            return Game.market.calcTransactionCost(_.floor(spendingMoney / o.price), terminal.room.name, o.roomName);
        })
        if (seller.price) {
            let buyAmount = _.floor(spendingMoney / seller.price);
            if (buyAmount > seller.amount) buyAmount = seller.amount;
            if (Game.market.deal(seller.id, buyAmount, terminal.pos.roomName) === OK) {
                lastEnergyPurchase = Game.time;
                log.w("Bought " + buyAmount + " " + seller.resourceType + " for " + (seller.price * buyAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                spendingMoney -= (seller.price * buyAmount);
                log.w("Remaining spending account amount - " + spendingMoney, "Market: ");
                return true;
            }
        }
    }
}

function fillBuyOrders(terminal, globalOrders) {
    let sortedKeys = Object.keys(terminal.store).sort(function (a, b) {
        return terminal.store[a] - terminal.store[b]
    });
    for (let resourceType of sortedKeys) {
        if (resourceType === RESOURCE_ENERGY || resourceType === RESOURCE_BATTERY) continue;
        let keepAmount = DUMP_AMOUNT;
        // Sell commodities (fill buys on privates at a lower threshold)
        if (_.includes(ALL_COMMODITIES, resourceType)) {
            if (COMPRESSED_COMMODITIES.includes(resourceType)) keepAmount = REACTION_AMOUNT;
            else if (REGIONAL_0_COMMODITIES.includes(resourceType)) {
                if (!_.find(terminal.room.impassibleStructures, (s) => s.my && s.structureType === STRUCTURE_FACTORY && s.effects)) keepAmount = 0;
                else keepAmount = REACTION_AMOUNT * 0.5;
            } else if (BASE_COMMODITIES.includes(resourceType)) keepAmount = REACTION_AMOUNT * 0.5;
            else keepAmount = 0;
            if (Game.market.credits < CREDIT_BUFFER) keepAmount = 0;
        }
        // Get amount
        let sellAmount = terminal.room.store(resourceType) - keepAmount;
        if (sellAmount > terminal.store[resourceType]) sellAmount = terminal.store[resourceType];
        if (sellAmount > 0) {
            // Find cheapest buyer within 10% of max price
            let orders = globalOrders.filter(order => order.resourceType === resourceType && order.type === ORDER_BUY && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(500, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY] && (!INTEL[order.roomName] || !HOSTILES.includes(INTEL[order.roomName].user)));
            let maxPrice = _.max(orders, 'price').price;
            let filteredOrders = orders.filter(o => o.price >= maxPrice * 0.9);
            let buyer = _.min(filteredOrders, function (o) {
                return Game.market.calcTransactionCost(sellAmount, terminal.room.name, o.roomName);
            });
            if (buyer.id) {
                if (buyer.remainingAmount < sellAmount) sellAmount = buyer.remainingAmount;
                if (Game.market.calcTransactionCost(sellAmount, terminal.room.name, buyer.roomName) > terminal.store[RESOURCE_ENERGY]) sellAmount = _.floor(terminal.store[RESOURCE_ENERGY] / (1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, buyer.roomName) / 30)));
                if (sellAmount * buyer.price >= 5) {
                    switch (Game.market.deal(buyer.id, sellAmount, terminal.pos.roomName)) {
                        case OK:
                            if (sellAmount * buyer.price > 250) log.w(terminal.pos.roomName + " Sell Off Completed - " + sellAmount + " " + resourceType + " for " + (buyer.price * sellAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                            spendingMoney += ((buyer.price * sellAmount) * 0.75);
                            if (sellAmount * buyer.price > 250) log.w("New spending account amount - " + spendingMoney, "Market: ");
                            return true;
                    }
                }
            }
            // Offload if we're overflowing
            else if (sellAmount >= keepAmount * 2) {
                let randomRoom = _.sample(_.filter(INTEL, (r) => r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && r.level >= 6)) || _.sample(_.filter(INTEL, (r) => r.user && r.user !== MY_USERNAME && r.level >= 6));
                if (randomRoom) {
                    randomRoom = randomRoom.name;
                    if (Game.market.calcTransactionCost(sellAmount, terminal.room.name, randomRoom) > terminal.store[RESOURCE_ENERGY]) sellAmount = _.floor(terminal.store[RESOURCE_ENERGY] / (1 - Math.exp(-Game.map.getRoomLinearDistance(terminal.room.name, randomRoom) / 30)));
                    if (sellAmount > 1000) {
                        switch (terminal.send(resourceType, 1000, randomRoom)) {
                            case OK:
                                log.w(terminal.pos.roomName + " Dumped - " + sellAmount + ' ' + resourceType + " to " + roomLink(randomRoom) + " (OWNED BY- " + INTEL[randomRoom].user + ") from " + roomLink(terminal.room.name), "Market: ");
                                return true;
                        }
                    }
                }
            }
        }
    }
}

let usedTerminals = {};
function balanceResources(terminal) {
    // Season, locate closest to collector room
        // Loop resources
    let sortedKeys = Object.keys(terminal.store).sort(function (a, b) {
            return terminal.store[b] - terminal.store[a]
        });
    for (let resource of sortedKeys) {
        // Energy balance handled elsewhere
        if (resource === RESOURCE_ENERGY) continue;
        let keepAmount = reactionAmount;
        let needyTerminal;
        // Send all of these to the sale room
        if ((ALL_COMMODITIES.includes(resource) && !COMPRESSED_COMMODITIES.includes(resource)) || resource === RESOURCE_OPS || resource === RESOURCE_POWER) {
            keepAmount = 0;
            if (terminal.room.name !== Memory.saleTerminal.room) {
                if (Game.rooms[Memory.saleTerminal.room].terminal.store.getFreeCapacity()) needyTerminal = Memory.saleTerminal.room; else continue;
            } else continue;
        }
        // Keep boost amount
        if (ALL_BOOSTS.includes(resource)) keepAmount = BOOST_AMOUNT;
        // Keep 1000 batteries
        if (resource === RESOURCE_BATTERY) keepAmount = 1000;
        // Keep reaction amount
        if (BASE_MINERALS.includes(resource)) keepAmount = REACTION_AMOUNT;
        // Keep 1000 compressed
        if (COMPRESSED_COMMODITIES.includes(resource)) keepAmount = 1000;
        // Ghodium special case, always have SAFE_MODE_COST and NUKER_GHODIUM_CAPACITY
        if (resource === RESOURCE_GHODIUM) keepAmount = SAFE_MODE_COST + NUKER_GHODIUM_CAPACITY;
        if (terminal.room.nukes.length) keepAmount = 0;
        // Next resource if we don't have enough to send
        let available = terminal.room.store(resource) - keepAmount;
        if (available > terminal.store[resource]) available = terminal.store[resource];
        if (available <= keepAmount * 0.1 || available < 100) continue;
        // Find room in need
        if (!needyTerminal) {
            if (terminal.room.energyState) {
                needyTerminal = _.find(Game.structures, (r) => r.structureType === STRUCTURE_TERMINAL && !r.room.nukes.length && r.room.name !== terminal.room.name && r.room.store(resource) < keepAmount && Game.market.calcTransactionCost(5000, terminal.room.name, r.room.name) < terminal.room.energy * 0.01
                    && r.store.getFreeCapacity());
            }
            // If no needy terminal check for allied needs
            if (!needyTerminal && _.size(ALLY_HELP_REQUESTS)) {
                for (let ally of _.sortBy(_.filter(ALLY_HELP_REQUESTS), 'priority')) {
                    needyTerminal = _.find(ally, (r) => r.requestType === 0 && r.resourceType === resource);
                    if (needyTerminal) {
                        needyTerminal = needyTerminal.roomName;
                        break;
                    }
                }
            } else if (needyTerminal) {
                needyTerminal = needyTerminal.room.name;
            }
        }
        if (needyTerminal) {
            let neededAmount = 5000;
            if (neededAmount < available) available = neededAmount;
            if (available <= 25) continue;
            switch (terminal.send(resource, available, needyTerminal)) {
                case OK:
                    log.a('Balancing ' + available + ' ' + resource + ' To ' + roomLink(needyTerminal) + ' From ' + roomLink(terminal.room.name), "Market: ");
                    usedTerminals[needyTerminal] = {tick: Game.time};
                    usedTerminals[terminal.room.name] = {tick: Game.time};
                    return true;
            }
        } else if (terminal.room.name !== Memory.saleTerminal.room && Game.rooms[Memory.saleTerminal.room].terminal.store.getFreeCapacity()) {
            switch (terminal.send(resource, available, Memory.saleTerminal.room)) {
                case OK:
                    log.a('Sent ' + available + ' ' + resource + ' To ' + roomLink(Memory.saleTerminal.room) + ' From ' + roomLink(terminal.room.name) + ' to stockpile.', "Market: ");
                    usedTerminals[terminal.room.name] = {tick: Game.time};
                    return true;
            }
        }
    }
}

function balanceEnergy(terminal) {
    // Balance Energy
    if (!INTEL[terminal.room.name].threatLevel && !terminal.room.nukes.length && terminal.room.energyState) {
        // Find needy terminals
        let needyTerminal = _.find(Game.structures, (r) => r.room.name !== terminal.room.name && !r.room.energyState && r.structureType === STRUCTURE_TERMINAL && (!r.room.store[RESOURCE_BATTERY] || !r.room.factory) &&
            (!usedTerminals[r.room.name] || usedTerminals[r.room.name].tick !== Game.time) && r.store.getFreeCapacity() && Game.market.calcTransactionCost(15000, terminal.room.name, r.room.name) < 1500);
        // If no needy terminal check for allied needs
        if (!needyTerminal && _.sortBy(_.filter(ALLY_HELP_REQUESTS), 'priority')) {
            for (let ally of _.filter(ALLY_HELP_REQUESTS)) {
                needyTerminal = _.find(ally, (r) => r.requestType === 0 && r.resourceType === RESOURCE_ENERGY);
                if (needyTerminal) {
                    needyTerminal = needyTerminal.roomName;
                    break;
                }
            }
        } else if (needyTerminal) {
            needyTerminal = needyTerminal.room.name;
        }
        if (needyTerminal) {
            let requestedAmount, resource;
            // Send batteries if possible
            if (terminal.room.factory && Game.rooms[needyTerminal] && Game.rooms[needyTerminal].factory) {
                // Determine how much you can move
                resource = RESOURCE_BATTERY;
                let availableAmount = terminal.store[RESOURCE_BATTERY];
                requestedAmount = 500;
                if (requestedAmount > availableAmount) requestedAmount = availableAmount;
            } else {
                // Determine how much you can move
                resource = RESOURCE_ENERGY;
                let availableAmount = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER;
                requestedAmount = 15000;
                if (requestedAmount > availableAmount) requestedAmount = availableAmount;
            }
            if (requestedAmount) {
                switch (terminal.send(resource, requestedAmount, needyTerminal)) {
                    case OK:
                        log.a('Balancing ' + requestedAmount + ' ' + resource + ' To ' + roomLink(needyTerminal) + ' From ' + roomLink(terminal.room.name), "Market: ");
                        usedTerminals[needyTerminal] = {tick: Game.time};
                        usedTerminals[terminal.room.name] = {tick: Game.time};
                        return true;
                }
            }
        } else if (terminal.room.energyState > 2 && terminal.room.name !== Memory.saleTerminal.room && Game.rooms[Memory.saleTerminal.room].terminal.store.getFreeCapacity()) {
            let requestedAmount, resource;
            // Send batteries if possible
            if (terminal.room.factory) {
                // Determine how much you can move
                resource = RESOURCE_BATTERY;
                let availableAmount = terminal.store[RESOURCE_BATTERY];
                requestedAmount = 500;
                if (requestedAmount > availableAmount) requestedAmount = availableAmount;
            } else {
                // Determine how much you can move
                resource = RESOURCE_ENERGY;
                let availableAmount = terminal.store[RESOURCE_ENERGY] - TERMINAL_ENERGY_BUFFER;
                requestedAmount = 15000;
                if (requestedAmount > availableAmount) requestedAmount = availableAmount;
            }
            if (requestedAmount) {
                switch (terminal.send(resource, requestedAmount, Memory.saleTerminal.room)) {
                    case OK:
                        log.a('Sent ' + requestedAmount + ' ' + resource + ' To ' + roomLink(Memory.saleTerminal.room) + ' From ' + roomLink(terminal.room.name) + ' to stockpile.', "Market: ");
                        usedTerminals[terminal.room.name] = {tick: Game.time};
                        return true;
                }
            }
        }
    }
}

function emergencyEnergy(terminal) {
    // Balance energy
    if (terminal.room.energy > ENERGY_AMOUNT[terminal.room.level] * 0.75 && terminal.store[RESOURCE_ENERGY] && !INTEL[terminal.room.name].requestingSupport && !INTEL[terminal.room.name].threatLevel && !terminal.room.nukes.length) {
        // Find needy terminals
        let responseNeeded = _.filter(MY_ROOMS, (r) => r !== terminal.room.name && INTEL[r] && INTEL[r].threatLevel >= 3 && Game.rooms[r].terminal && !Game.rooms[r].energyState);
        if (responseNeeded.length) {
            let lowestEnergy = _.min(responseNeeded, (r) => Game.rooms[r].energy);
            let needyTerminal = Game.rooms[lowestEnergy].terminal;
            // Determine how much you can move
            let availableAmount = terminal.store[RESOURCE_ENERGY] * 0.2;
            if (availableAmount <= 0) return false;
            switch (terminal.send(RESOURCE_ENERGY, availableAmount, needyTerminal.room.name)) {
                case OK:
                    log.a('Emergency Supplies ' + availableAmount + ' ' + RESOURCE_ENERGY + ' To ' + roomLink(needyTerminal.room.name) + ' From ' + roomLink(terminal.room.name), "Market: ");
                    return true;
            }
        }
    }
}

function dealFinder(terminal, globalOrders) {
    if (terminal.store.getFreeCapacity()) {
        let sellOrder = _.min(globalOrders.filter(order => order.type === ORDER_SELL && latestMarketHistory(order.resourceType) && order.price <= latestMarketHistory(order.resourceType)['avgPrice'] * 0.5 &&
            (!order.roomName || Game.market.calcTransactionCost(order.amount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY] * 0.5)), 'price');
        let buyAmount = sellOrder.amount;
        if (sellOrder.price * buyAmount > spendingMoney * 0.1) buyAmount = _.round(buyAmount * ((spendingMoney * 0.1) / (sellOrder.price * buyAmount)));
        if (sellOrder.id && buyAmount >= 100) {
            log.w("DEAL DEAL DEAL " + sellOrder.resourceType + " for " + sellOrder.price + " credits. Average sale price - " + latestMarketHistory(sellOrder.resourceType)['avgPrice'], "Market: ");
             if (Game.market.deal(sellOrder.id, buyAmount, terminal.pos.roomName) === OK) {
                 log.w("Bought " + buyAmount + ' ' + sellOrder.resourceType + " for " + (sellOrder.price * buyAmount) + " credits in " + roomLink(terminal.room.name), "Market: ");
                spendingMoney -= (sellOrder.price * buyAmount);
                log.w("Remaining spending account amount - " + spendingMoney, "Market: ");
                return true;
             }
        }
    }
    return false;
}

function sellPixels(globalOrders) {
    let sellAmount = Game.resources[PIXEL] - PIXEL_BUFFER;
    if (sellAmount >= 10) {
        let buyer = _.max(globalOrders.filter(order => order.resourceType === PIXEL && order.type === ORDER_BUY && order.price >= latestMarketHistory(PIXEL)['avgPrice'] * 0.8), 'price');
        if (buyer.id) {
            if (buyer.remainingAmount < sellAmount) sellAmount = buyer.remainingAmount;
            switch (Game.market.deal(buyer.id, sellAmount)) {
                case OK:
                    log.w("Pixel Sell Off Completed - For " + (buyer.price * sellAmount) + " credits.", "Market: ");
                    spendingMoney += buyer.price * sellAmount;
                    log.w("New spending account amount - " + spendingMoney, "Market: ");
                    return true;
            }
        }
    }
}

function latestMarketHistory(resource) {
    let history = Game.market.getHistory(resource);
    if (_.size(history)) {
        return history[_.size(history) - 1]
    } else {
        return false;
    }
}

function profitCheck(force = false) {
    let hourlyTick = EST_TICKS_PER_MIN * 60;
    let fiveMinuteTick = EST_TICKS_PER_MIN * 5;
    let profitTracking = Memory._banker || {};
    if (force || profitTracking.lastData + hourlyTick < Game.time || !profitTracking.lastData) {
        profitTracking.lastData = Game.time;
        //let hourlyProfits = profitTracking.hourArray || [];
        let lastCredit = profitTracking.lastTotalAmount || Game.market.credits;
        profitTracking.lastTotalAmount = Game.market.credits;
        let hourChange = Game.market.credits - lastCredit;
        // Private servers spending is anything greater than the buffer
        if (!['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) {
            spendingMoney = Game.market.credits - CREDIT_BUFFER;
            log.w("New spending account amount (HOURLY UPDATE) - " + spendingMoney, "Market: ");
        }
        // Spending account is capped at 150k
        else if (Game.market.credits > 150000 && spendingMoney > 150000) {
            spendingMoney = 150000;
            log.w("New spending account amount (HOURLY UPDATE) - " + spendingMoney, "Market: ");
        }
        // Add 80% of profits for the hour to spending account
        else if (hourChange > 0) {
            spendingMoney += (hourChange * 0.8);
            log.w("New spending account amount (HOURLY UPDATE) - " + spendingMoney, "Market: ");
        } else {
            spendingMoney += hourChange;
            log.w("New spending account amount (HOURLY UPDATE) - " + spendingMoney, "Market: ");
        }
        /**
         // Track profits
         if (hourlyProfits.length < 240) {
            hourlyProfits.push(hourChange)
        } else {
            hourlyProfits.shift();
            hourlyProfits.push(hourChange);
        }**/
        // Clear old
        profitTracking.hourArray = undefined;
    } else if (profitTracking.lastInflux + fiveMinuteTick < Game.time || !profitTracking.lastInflux) {
        profitTracking.lastInflux = Game.time;
        if (Game.market.credits > CREDIT_BUFFER && Math.random() > 0.5 && spendingMoney < 1000) {
            let bankersCut = (Game.market.credits - CREDIT_BUFFER) * 0.8;
            spendingMoney += (bankersCut * 0.1);
            log.w("New spending account amount (RANDOM INFLUX) - " + spendingMoney, "Market: ");
        }
    }
    Memory._banker = profitTracking;
}

let lastCheckedIncoming = Game.time;

function tradeDiplomacyTracker() {
    if (!['shard0', 'shard1', 'shard2', 'shard3'].includes(Game.shard.name)) return false;
    let incoming = _.filter(Game.market.incomingTransactions, (t) => t && t.time > lastCheckedIncoming);
    if (incoming.length) {
        for (let trade of incoming) {
            if (trade.sender && trade.sender.username) {
                let multi = 1000;
                if (_.includes(TIER_1_BOOSTS, trade.resourceType) || _.includes(COMPRESSED_COMMODITIES, trade.resourceType)) multi = 750;
                else if (_.includes(TIER_2_BOOSTS, trade.resourceType)) multi = 500;
                else if (_.includes(TIER_3_BOOSTS, trade.resourceType) || trade.resourceType === RESOURCE_POWER) multi = 200;
                let increase = trade.amount / multi;
                if (Memory._userList[trade.sender.username]) {
                    Memory._userList[trade.sender.username].standing += increase;
                    if (Memory._userList[trade.sender.username].standing > 50) Memory._userList[trade.sender.username].standing = 50;
                    Memory._userList[trade.sender.username].lastChange = Game.time;
                } else {
                    let cache = Memory._userList || {};
                    cache[trade.sender.username] = {};
                    cache[trade.sender.username]['standing'] = increase;
                    cache[trade.sender.username]['lastChange'] = Game.time;
                    log.w(trade.sender.username + ' is now considered a friend due to trade.');
                    Memory._userList = cache;
                }
            }
        }
        lastCheckedIncoming = _.max(incoming, 'time').time;
    }
}