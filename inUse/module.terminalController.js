/**
 * Created by rober on 6/21/2017.
 */

let globalOrders = Game.market.getAllOrders();

module.exports.terminalControl = function () {
    for (let terminal of _.values(Game.structures)) {
        if (terminal.structureType === STRUCTURE_TERMINAL) {
            //if we have credits make sure we have energy
            buyEnergy(terminal);

            //extend old orders first
            extendSellOrders(terminal);

            //Try to put up a sell, otherwise fill buy
            placeSellOrders(terminal);
            fillBuyOrders(terminal);

            //Extend/Place buy orders
            extendBuyOrders(terminal);
            placeBuyOrders(terminal);
        }
    }
};

function fillBuyOrders(terminal) {
    if (terminal.store[RESOURCE_ENERGY] >= 1000) {
        for (const resourceType in terminal.store) {
            if (terminal.store[resourceType] >= 2500 && resourceType !== RESOURCE_ENERGY) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= 500), 'price');
                if (buyOrder.id) {
                    if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + "</font>");
                    }
                } else {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= 1000), 'price');
                    if (buyOrder.id) {
                        if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                            console.log("<font color='#adff2f'>MARKET: buyOrderFilled - 1000 " + resourceType + " for " + buyOrder.price * 1000 + "</font>");
                        }
                    }
                }
            }
        }
    }
}

function buyEnergy(terminal) {
    for (let key in Game.market.orders) {
        for (const resourceType in terminal.store) {
            if (terminal.store[resourceType] < 10000 && resourceType === RESOURCE_ENERGY && Game.market.orders[key].resourceType === RESOURCE_ENERGY && Game.market.orders[key].type === ORDER_BUY) {
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName), "price");
                if (buyOrder.id && (_.round(buyOrder.price, 2)) !== _.round(Game.market.orders[key].price, 2) && buyOrder.price < 0.05) {
                    if (Game.market.changeOrderPrice(Game.market.orders[key].id, buyOrder.price) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Energy buy order price change " + Game.market.orders[key].id + " new/old " + buyOrder.price + "/" + Game.market.orders[key].price + "</font>");
                    }
                    return;
                }
                if (Game.market.orders[key].remainingAmount < 20000) {
                    if (Game.market.extendOrder(Game.market.orders[key].id, Game.market.orders[key].remainingAmount - (20000 - terminal.store[resourceType])) === OK) {
                        console.log("<font color='#adff2f'>MARKET: Extended energy buy order " + Game.market.orders[key].id + " an additional " + Game.market.orders[key].remainingAmount - (20000 - terminal.store[resourceType]) + "</font>");
                    }
                    return;
                }
            }
        }
    }
}

function extendSellOrders(terminal) {
    resource:
        for (const resourceType in terminal.store) {
            for (let key in Game.market.orders) {
                if (resourceType !== RESOURCE_ENERGY && Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_SELL) {
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), "price");
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(Game.market.orders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) > _.round(buyOrder.price, 2)) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, (sellOrder.price - 0.01)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Sell order price change " + Game.market.orders[key].id + " new/old " + (sellOrder.price - 0.01) + "/" + Game.market.orders[key].price   + " Resource - " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(Game.market.orders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) < _.round(buyOrder.price, 2)) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, (sellOrder.price - 0.01)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Sell order price change " + Game.market.orders[key].id + " new/old " + (sellOrder.price - 0.01) + "/" + Game.market.orders[key].price  + " Resource - " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                    if (terminal.store[resourceType] > Game.market.orders[key].remainingAmount) {
                        if (Game.market.extendOrder(Game.market.orders[key].id, terminal.store[resourceType]) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Extended sell order " + Game.market.orders[key].id + " an additional " + terminal.store[resourceType]  + " " + resourceType + "</font>");
                        }
                    }
                }
            }
        }
}

function placeSellOrders(terminal) {
    resource:
        for (const resourceType in terminal.store) {
            if (resourceType !== RESOURCE_ENERGY) {
                for (let key in Game.market.orders) {
                    if (Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_SELL && Game.market.orders[key].roomName === terminal.pos.roomName) {
                        continue resource;
                    }
                }
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                order.type === ORDER_SELL && order.remainingAmount >= 7500 && order.roomName !== terminal.pos.roomName), 'price');
                if (sellOrder.id) {
                    if (Game.market.createOrder(ORDER_SELL, resourceType, (sellOrder.price - 0.01), terminal.store[resourceType], terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Sell Order: " + resourceType + " at/per " + (sellOrder.price - 0.01) + "</font>");
                    }
                }
            }
        }
}

function extendBuyOrders(terminal) {
    resource:
        for (const resourceType in terminal.store) {
            for (let key in Game.market.orders) {
                if (resourceType !== RESOURCE_ENERGY && Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_BUY) {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    if (buyOrder.id && (_.round(buyOrder.price, 2)) !== _.round(Game.market.orders[key].price, 2) && ((sellOrder.price - 0.01) - buyOrder.price) > 0.02) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, (buyOrder.price)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Buy order price change " + Game.market.orders[key].id + " new/old " + buyOrder.price + "/" + Game.market.orders[key].price  + " Resource - " + resourceType + "</font>");
                        }
                        continue resource;
                    }
                    if (terminal.store[resourceType] + Game.market.orders[key].remainingAmount < 2000 && ((sellOrder.price - 0.01) - buyOrder.price) > 0.02) {
                        if (Game.market.extendOrder(Game.market.orders[key].id, 2000 - (terminal.store[resourceType] + Game.market.orders[key].remainingAmount)) === OK) {
                            console.log("<font color='#adff2f'>MARKET: Extended Buy order " + Game.market.orders[key].id +  " an additional " + 2000 - (terminal.store[resourceType] + Game.market.orders[key].remainingAmount + " " + resourceType + "</font>"));
                        }
                    }
                }
            }
        }
}

function placeBuyOrders(terminal) {
    let basicMinerals = [RESOURCE_HYDROGEN,
        RESOURCE_OXYGEN,
        RESOURCE_UTRIUM,
        RESOURCE_KEANIUM,
        RESOURCE_LEMERGIUM,
        RESOURCE_ZYNTHIUM,
        RESOURCE_CATALYST,
        RESOURCE_POWER];
    resource:
        for (let i = 0; i < basicMinerals.length; i++) {
            if (terminal.store[basicMinerals[i]] < 2000 || !terminal.store[basicMinerals[i]]) {
                for (let key in Game.market.orders) {
                    if (Game.market.orders[key].resourceType === basicMinerals[i] && Game.market.orders[key].type === ORDER_BUY) {
                        continue resource;
                    }
                }
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === basicMinerals[i] &&
                order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === basicMinerals[i] &&
                order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id && ((sellOrder.price - 0.01) - buyOrder.price) > 0.02) {
                    if (Game.market.createOrder(ORDER_BUY, basicMinerals[i], buyOrder.price, 2000, terminal.pos.roomName) === OK) {
                        console.log("<font color='#adff2f'>MARKET: New Buy Order: " + basicMinerals[i] + " at/per " + (buyOrder.price) + "</font>");
                    }
                }
            }
        }
}