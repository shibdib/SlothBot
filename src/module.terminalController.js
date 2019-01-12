/**
 * Created by rober on 6/21/2017.
 */

let reactionNeeds = REACTION_NEEDS;
let tradeAmount = TRADE_AMOUNT;
let energyAmount = ENERGY_AMOUNT;
let reactionAmount = REACTION_AMOUNT;

module.exports.terminalControl = function (room) {
    let globalOrders = Game.market.getAllOrders();
    let myOrders = Game.market.orders;
    let terminal = room.terminal;
    if (terminal && terminal.isActive()) {
        if (terminal.cooldown) return false;
        //Cleanup broken or old order
        orderCleanup(myOrders);
        //update prices every 30 ticks
        if (Game.time % 30 === 0) pricingUpdateSell(terminal, globalOrders, myOrders);
        //Disperse Minerals and Boosts
        if (balanceBoosts(terminal)) return;
        //fill buy
        if (fillBuyOrders(terminal, globalOrders)) return;
        //Extend/Place buy orders if we have enough buffer cash
        if (placeReactionOrders(terminal, globalOrders, myOrders)) return;
        //Sell off excess
        if (extendSellOrders(terminal, globalOrders, myOrders)) return;
        if (placeSellOrders(terminal, globalOrders, myOrders)) return;
        //Use extra creds to buy needed items for boosts
        if (onDemandReactionOrders(terminal, globalOrders)) return;
    }
};

function fillBuyOrders(terminal, globalOrders) {
    if (terminal.store[RESOURCE_ENERGY]) {
        for (const resourceType in terminal.store) {
            if (resourceType === RESOURCE_ENERGY) continue;
            let onHand = terminal.store[resourceType];
            let sellOffAmount = DUMP_AMOUNT;
            if (_.includes(END_GAME_BOOSTS, resourceType)) sellOffAmount = DUMP_AMOUNT * 3;
            if (onHand >= DUMP_AMOUNT) {
                let sellableAmount = terminal.store[resourceType] - reactionAmount * 1.2;
                if (!sellableAmount || sellableAmount < 0) continue;
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(sellableAmount, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
                if (buyOrder.id && buyOrder.remainingAmount >= sellableAmount) {
                    switch (Game.market.deal(buyOrder.id, sellableAmount, terminal.pos.roomName)) {
                        case OK:
                            log.w(" MARKET: Sell Off Completed - " + resourceType + " for " + buyOrder.price * sellableAmount + " credits");
                            return true;
                        case ERR_NOT_ENOUGH_RESOURCES:
                            Game.market.deal(buyOrder.id, 500, terminal.pos.roomName);
                            log.w(" MARKET: Sell Off Completed - " + resourceType + " for " + buyOrder.price * 500 + " credits");
                            return true;
                    }
                    return true;
                } else if (buyOrder.id && buyOrder.remainingAmount < sellableAmount) {
                    switch (Game.market.deal(buyOrder.id, buyOrder.remainingAmount, terminal.pos.roomName)) {
                        case OK:
                            log.w(" MARKET: Sell Off Completed - " + resourceType + " for " + buyOrder.price * sellableAmount + " credits");
                            return true;
                        case ERR_NOT_ENOUGH_RESOURCES:
                            Game.market.deal(buyOrder.id, 500, terminal.pos.roomName);
                            log.w(" MARKET: Sell Off Completed - " + resourceType + " for " + buyOrder.price * 500 + " credits");
                            return true;
                    }
                    return true;
                }
            }
        }
    }
}

function extendSellOrders(terminal, myOrders) {
    resource:
        for (const resourceType in terminal.store) {
            for (let key in myOrders) {
                if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && resourceType !== RESOURCE_ENERGY) {
                    let sellableAmount = terminal.store[resourceType] - SELL_OFF_AMOUNT;
                    if (sellableAmount > myOrders[key].remainingAmount && sellableAmount - myOrders[key].remainingAmount > 1000) {
                        if (Game.market.extendOrder(myOrders[key].id, sellableAmount - myOrders[key].remainingAmount) === OK) {
                            log.w(" MARKET: Extended sell order " + myOrders[key].id + " an additional " + sellableAmount - myOrders[key].remainingAmount + " " + resourceType);
                            return true;
                        }
                        continue resource;
                    }
                } else if (myOrders[key].resourceType === RESOURCE_ENERGY && myOrders[key].type === ORDER_SELL) {
                    let sellableAmount = terminal.store[resourceType] - ENERGY_AMOUNT * 3;
                    if (sellableAmount > myOrders[key].remainingAmount && sellableAmount - myOrders[key].remainingAmount > 1000) {
                        if (Game.market.extendOrder(myOrders[key].id, sellableAmount - myOrders[key].remainingAmount) === OK) {
                            log.w(" MARKET: Extended sell order " + myOrders[key].id + " an additional " + sellableAmount - myOrders[key].remainingAmount + " " + resourceType);
                            return true;
                        }
                        continue resource;
                    }
                }
            }
        }
}

function placeSellOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let resourceType in terminal.store) {
            if (terminal.store[resourceType] >= SELL_OFF_AMOUNT && resourceType !== RESOURCE_ENERGY) {
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL && myOrders[key].roomName === terminal.pos.roomName) {
                        continue resource;
                    }
                }
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 500 && order.roomName !== terminal.pos.roomName), 'price');
                let sellableAmount = terminal.store[resourceType] - SELL_OFF_AMOUNT;
                let salePrice;
                if (_.includes(END_GAME_BOOSTS, resourceType)) salePrice = END_GAME_SALE_MAX;
                if (_.includes(TIER_2_BOOSTS, resourceType)) salePrice = TIER_2_SALE_MAX;
                if (_.includes(TIER_1_BOOSTS, resourceType)) salePrice = TIER_1_SALE_MAX;
                if (_.includes(BASE_COMPOUNDS, resourceType)) salePrice = BASE_COMPOUNDS_SALE_MAX;
                if (resourceType === RESOURCE_GHODIUM) salePrice = GHODIUM_SALE_MAX;
                if (_.round((sellOrder.price - 0.001), 3) < salePrice) salePrice = _.round((sellOrder.price - 0.001), 3);
                if (sellOrder.id && sellableAmount >= 1000) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, salePrice, sellableAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: New Sell Order: " + resourceType + " at/per " + salePrice);
                        return true;
                    }
                }
            }
        }
}

function placeReactionOrders(terminal, globalOrders, myOrders) {
    resource:
        for (let i = 0; i < reactionNeeds.length; i++) {
            // Skip if you can procure yourself
            if (_.includes(Memory.ownedMineral, reactionNeeds[i])) continue;
            let storage = terminal.room.storage;
            if (!storage) return;
            let stored = terminal.store[reactionNeeds[i]] + storage.store[reactionNeeds[i]] || 0;
            let minerals = terminal.room.mineral[0];
            if ((minerals.resourceType === reactionNeeds[i] && minerals.mineralAmount > 0) || stored >= reactionAmount) continue;
            let activeOrder = _.filter(myOrders, (o) => o.roomName === terminal.pos.roomName && o.resourceType === reactionNeeds[i] && o.type === ORDER_BUY)[0];
            if (terminal.store[reactionNeeds[i]] < reactionAmount || !terminal.store[reactionNeeds[i]] && Game.market.credits > 500 && !activeOrder) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === reactionNeeds[i] &&
                    order.type === ORDER_BUY && order.remainingAmount >= 2000 && order.roomName !== terminal.pos.roomName), 'price');
                for (let key in myOrders) {
                    if (myOrders[key].resourceType === reactionNeeds[i] && myOrders[key].type === ORDER_BUY) {
                        let currentSupply;
                        if (isNaN(terminal.store[reactionNeeds[i]]) === true) {
                            currentSupply = myOrders[key].remainingAmount;
                        } else {
                            currentSupply = terminal.store[reactionNeeds[i]] + myOrders[key].remainingAmount;
                        }
                        if (Game.market.credits * 0.1 > (reactionAmount - currentSupply) * buyOrder.price) {
                            if (Game.market.extendOrder(myOrders[key].id, reactionAmount - currentSupply) === OK) {
                                log.w(" MARKET: Extended Reaction buy order " + myOrders[key].id + " an additional " + reactionAmount - currentSupply);
                                return true;
                            }
                        }
                        continue resource;
                    }
                }
                if (Game.market.credits * 0.1 > reactionAmount * buyOrder.price) {
                    if (Game.market.createOrder(ORDER_BUY, reactionNeeds[i], buyOrder.price + 0.001, reactionAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: Reaction Needs Buy Order: " + reactionNeeds[i] + " at/per " + (buyOrder.price) + " credits");
                        return true;
                    }
                }
            }
        }
}

function onDemandReactionOrders(terminal, globalOrders) {
    if (terminal.store[RESOURCE_ENERGY] > 500) {
        for (let i = 0; i < reactionNeeds.length; i++) {
            // Skip if you can procure yourself
            if (_.includes(Memory.ownedMineral, reactionNeeds[i])) continue;
            let storage = terminal.room.storage;
            if (!storage) return;
            let stored = terminal.store[reactionNeeds[i]] + storage.store[reactionNeeds[i]] || 0;
            let minerals = terminal.room.mineral[0];
            if (minerals.resourceType === reactionNeeds[i] || stored >= reactionAmount) continue;
            if (!terminal.store[reactionNeeds[i]] || terminal.store[reactionNeeds[i]] < reactionAmount * 0.5) {
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === reactionNeeds[i] &&
                    order.type === ORDER_SELL && order.remainingAmount >= reactionAmount * 2 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(reactionAmount * 2, terminal.room.name, order.roomName) < terminal.store[RESOURCE_ENERGY]), 'price');
                if (sellOrder.id) {
                    if (Game.market.deal(sellOrder.id, reactionAmount, terminal.pos.roomName) === OK) {
                        log.w(" MARKET: Bought " + reactionAmount + " " + reactionNeeds[i] + " for " + sellOrder.price * reactionAmount + " credits");
                        return true;
                    }
                }
            }
        }
    }
}

let lastPriceUpdate = Game.time;
function pricingUpdateSell(terminal, globalOrders, myOrders) {
    if (lastPriceUpdate === Game.time) return false;
    lastPriceUpdate = Game.time;
    for (const resourceType in terminal.store) {
        for (let key in myOrders) {
            if (myOrders[key].resourceType === resourceType && myOrders[key].type === ORDER_SELL) {
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.id !== myOrders[key].id), "price");
                let salePrice;
                if (_.includes(END_GAME_BOOSTS, resourceType)) salePrice = END_GAME_SALE_MAX;
                if (_.includes(TIER_2_BOOSTS, resourceType)) salePrice = TIER_2_SALE_MAX;
                if (_.includes(TIER_1_BOOSTS, resourceType)) salePrice = TIER_1_SALE_MAX;
                if (_.includes(BASE_COMPOUNDS, resourceType)) salePrice = BASE_COMPOUNDS_SALE_MAX;
                if (resourceType === RESOURCE_GHODIUM) salePrice = GHODIUM_SALE_MAX;
                if (_.round((sellOrder.price - 0.001), 3) < salePrice && _.round((sellOrder.price - 0.001), 3) >= salePrice * 0.2) salePrice = _.round((sellOrder.price - 0.001), 3);
                if (salePrice !== myOrders[key].price) {
                    if (Game.market.changeOrderPrice(myOrders[key].id, salePrice) === OK) {
                        log.w(" MARKET: Sell order price change " + myOrders[key].id + " new/old " + salePrice + "/" + myOrders[key].price + " Resource - " + resourceType);
                        return true;
                    }
                }
            }
        }
    }
}

function orderCleanup(myOrders) {
    for (let key in myOrders) {
        if (myOrders[key].type === ORDER_BUY) {
            if (Game.market.credits < 50) {
                if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                    log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " due to low credits");
                    return true;
                }
            }
            if (_.includes(Memory.ownedMineral, myOrders[key].resourceType)) {
                if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                    log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " we now have our own supply of " + myOrders[key].resourceType);
                    return true;
                }
            } else if (myOrders[key].resourceType !== RESOURCE_ENERGY) {
                if (myOrders[key].remainingAmount > tradeAmount) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " for exceeding the set trade amount (order amount/set limit) " + myOrders[key].remainingAmount + "/" + tradeAmount);
                        return true;
                    }
                }
            } else {
                if (myOrders[key].remainingAmount > energyAmount) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " for exceeding the set trade amount (order amount/set limit) " + myOrders[key].remainingAmount + "/" + energyAmount);
                        return true;
                    }
                }
            }
            if (myOrders[key].amount === 0) {
                if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                    log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " - Order Fulfilled.");
                    return true;
                }
            }
        } else {
            if (myOrders[key].resourceType !== RESOURCE_ENERGY) {
                if (myOrders[key].amount < 250) {
                    if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                        log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " - Not enough resources remaining in terminal.");
                        return true;
                    }
                }
            }
        }
        if (!Game.rooms[myOrders[key].roomName]) {
            if (Game.market.cancelOrder(myOrders[key].id) === OK) {
                log.e(" MARKET: Order Cancelled: " + myOrders[key].id + " we no longer own this room");
                return true;
            }
        }
    }
}

function balanceBoosts(terminal) {
    // Loop thru boosts
    let storedResources = Object.keys(terminal.store);
    for (let boost of _.shuffle(_.filter(storedResources, (r) => r !== RESOURCE_ENERGY))) {
        if (terminal.store[boost] >= TRADE_AMOUNT) {
            // Find needy terminals
            let needyTerminal = _.sample(_.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && s.room.name !== terminal.room.name && s.isActive() && s.store[boost] < TRADE_AMOUNT * 0.7));
            // If no needy terminals check if it's overfull and try to dump to allies
            if (!needyTerminal) {
                let dumpAmount = DUMP_AMOUNT * 1.5;
                if (_.includes(END_GAME_BOOSTS, boost)) dumpAmount = DUMP_AMOUNT * 4;
                if (boost !== RESOURCE_ENERGY && terminal.store[boost] >= dumpAmount) {
                    let alliedRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && _.includes(FRIENDLIES, r.user) && r.level >= 6));
                    let randomRoom = _.sample(_.filter(Memory.roomCache, (r) => r.user && r.user !== MY_USERNAME && !_.includes(FRIENDLIES, r.user) && r.level >= 6));
                    if (alliedRoom) {
                        alliedRoom = alliedRoom.name;
                        let allyName = Memory.roomCache[alliedRoom].user;
                        switch (terminal.send(boost, 2500, alliedRoom)) {
                            case OK:
                                log.a(' MARKET: Dumping to ally (' + allyName + ') ' + 2500 + ' ' + boost + ' To ' + alliedRoom + ' From ' + terminal.room.name + ' Current Amount - ' + terminal.store[boost]);
                                return true;
                        }
                    } else if (_.sum(terminal.store) >= terminal.storeCapacity * 0.95 && randomRoom) {
                        randomRoom = randomRoom.name;
                        let randomName = Memory.roomCache[randomRoom].user;
                        switch (terminal.send(boost, 2500, randomRoom)) {
                            case OK:
                                log.a(' MARKET: Dumping to random player (' + randomName + ') ' + 2500 + ' ' + boost + ' To ' + randomRoom + ' From ' + terminal.room.name + ' Current Amount - ' + terminal.store[boost]);
                                return true;
                        }
                    }
                }
                continue;
            }
            // Determine how much you can move
            let availableAmount = terminal.store[boost] - (TRADE_AMOUNT * 1.1);
            if (availableAmount <= 0) continue;
            // Determine how much is needed
            let storedAmount = 0;
            if (needyTerminal.store[boost]) storedAmount = needyTerminal.store[boost];
            let neededAmount = (TRADE_AMOUNT * 0.95) - storedAmount;
            if (neededAmount <= 0) continue;
            switch (terminal.send(boost, neededAmount, needyTerminal.room.name)) {
                case OK:
                    log.a(' MARKET: Balancing ' + neededAmount + ' ' + boost + ' To ' + needyTerminal.room.name + ' From ' + terminal.room.name + ' Current Amounts - ' + terminal.store[boost] + ' / ' + (storedAmount + neededAmount));
                    return true;
            }
        }
    }
    // Balance energy
    if (terminal.store[RESOURCE_ENERGY] >= ENERGY_AMOUNT * 1.5) {
        // Find needy terminals
        let needyTerminal = _.sample(_.filter(Game.structures, (s) => s.structureType === STRUCTURE_TERMINAL && s.room.name !== terminal.room.name && s.isActive() && s.store[RESOURCE_ENERGY] < terminal.store[RESOURCE_ENERGY] * 0.7));
        if (needyTerminal) {
            // Determine how much you can move
            let availableAmount = terminal.store[RESOURCE_ENERGY] - (ENERGY_AMOUNT * 1.25);
            if (availableAmount <= 0) return false;
            // Determine how much is needed
            let storedAmount = 0;
            if (needyTerminal.store[RESOURCE_ENERGY]) storedAmount = needyTerminal.store[RESOURCE_ENERGY];
            let neededAmount = (availableAmount * 0.95) - storedAmount;
            if (neededAmount <= 0) return false;
            switch (terminal.send(RESOURCE_ENERGY, neededAmount, needyTerminal.room.name)) {
                case OK:
                    log.a(' MARKET: Balancing ' + neededAmount + ' ' + RESOURCE_ENERGY + ' To ' + needyTerminal.room.name + ' From ' + terminal.room.name + ' Current Amounts - ' + terminal.store[RESOURCE_ENERGY] + ' / ' + (storedAmount + neededAmount));
                    return true;
            }
        }
    }
}