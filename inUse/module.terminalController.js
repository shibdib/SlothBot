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
                        console.log('buyOrderFilled - 1000 ' + resourceType + ' for ' + buyOrder.price * 1000);
                    }
                } else {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= 1000), 'price');
                    if (buyOrder.id) {
                        if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                            console.log('buyOrderFilled - 1000 ' + resourceType + ' for ' + buyOrder.price * 1000);
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
            if (terminal.store[resourceType] < 10000 && resourceType === RESOURCE_ENERGY) {
                if (Game.market.orders[key].resourceType === RESOURCE_ENERGY && Game.market.orders[key].type === ORDER_BUY) {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName), "price");
                    if (buyOrder.id && (_.round(buyOrder.price, 2)) !== _.round(Game.market.orders[key].price, 2) && buyOrder.price < 0.05) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, buyOrder.price) === OK) {
                            console.log('Energy buy order price change ' + Game.market.orders[key].id + ' new/old ' + buyOrder.price + "/" + Game.market.orders[key].price);
                        }
                        return;
                    }
                    if (Game.market.orders[key].remainingAmount < 20000) {
                        if (Game.market.extendOrder(Game.market.orders[key].id, 20000) === OK) {
                            console.log('Extended energy buy order ' + Game.market.orders[key].id + ' an additional ' + 10000 - Game.market.orders[key].remainingAmount);
                        }
                        return;
                    }
                }
            }
        }
    }
}

function extendSellOrders(terminal) {
    for (const resourceType in terminal.store) {
        for (let key in Game.market.orders) {
            if (resourceType !== RESOURCE_ENERGY) {
                if (Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_SELL) {
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), "price");
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(Game.market.orders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) > _.round(buyOrder.price, 2)) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, (sellOrder.price - 0.01)) === OK) {
                            console.log('Sell order price change ' + Game.market.orders[key].id + ' new/old ' + (sellOrder.price - 0.01) + "/" + Game.market.orders[key].price);
                        }
                        return;
                    }
                    if (sellOrder.id && _.round(sellOrder.price - 0.01, 2) !== _.round(Game.market.orders[key].price, 2) && _.round(sellOrder.price - 0.01, 2) < _.round(buyOrder.price, 2)) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, (sellOrder.price - 0.01)) === OK) {
                            console.log('Sell order price change ' + Game.market.orders[key].id + ' new/old ' + (buyOrder.price + 0.01) + "/" + Game.market.orders[key].price);
                        }
                        return;
                    }
                    if (terminal.store[resourceType] > Game.market.orders[key].remainingAmount) {
                        if (Game.market.extendOrder(Game.market.orders[key].id, terminal.store[resourceType]) === OK) {
                            console.log('Extended sell order ' + Game.market.orders[key].id + ' an additional ' + terminal.store[resourceType]);
                        }
                    }
                }
            }
        }
    }
}

function placeSellOrders(terminal) {
    resource:
    for (const resourceType in terminal.store) {
        if (terminal.store[resourceType] >= 5000 && resourceType !== RESOURCE_ENERGY) {
            for (let key in Game.market.orders) {
                if (Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_SELL) {
                    continue resource;
                }
            }
            let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
            order.type === ORDER_SELL && order.remainingAmount >= 5000 && order.roomName !== terminal.pos.roomName &&
            Game.market.calcTransactionCost(terminal.store[resourceType], terminal.pos.roomName, order.roomName) <= 1000), 'price');
            if (sellOrder.id) {
                if (Game.market.createOrder(ORDER_SELL, resourceType, (sellOrder.price - 0.01), terminal.store[resourceType]) === OK) {
                    console.log('New Sell Order: ' + Game.market.orders[key].id + ' Price ' + (sellOrder.price - 0.01));
                }
            }
        }
    }
}

function extendBuyOrders(terminal) {
    for (const resourceType in terminal.store) {
        for (let key in Game.market.orders) {
            if (resourceType !== RESOURCE_ENERGY) {
                if (Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_BUY) {
                    let buyOrder = _.max(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    let sellOrder = _.min(globalOrders.filter(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                    if (buyOrder.id && (_.round(buyOrder.price, 2)) !== _.round(Game.market.orders[key].price, 2) && ((sellOrder.price -0.01) - buyOrder.price) > 0.02) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, (buyOrder.price)) === OK) {
                            console.log('Buy order price change ' + Game.market.orders[key].id + ' new/old ' + buyOrder.price + "/" + Game.market.orders[key].price);
                        }
                        return;
                    }
                    if (terminal.store[resourceType] + Game.market.orders[key].remainingAmount < 2000) {
                        if (Game.market.extendOrder(Game.market.orders[key].id, 2000 - (terminal.store[resourceType] + Game.market.orders[key].remainingAmount)) === OK) {
                            console.log('Extended Buy order ' + Game.market.orders[key].id + ' an additional ' + 2000 - (terminal.store[resourceType] + Game.market.orders[key].remainingAmount));
                        }
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
        RESOURCE_ZYNTHIUM];
    resource:
        for (let i=0; i<basicMinerals.length;i++) {
            if (terminal.store[basicMinerals[i]] < 2000) {
                for (let key in Game.market.orders) {
                    if (Game.market.orders[key].resourceType === basicMinerals[i] && Game.market.orders[key].type === ORDER_BUY) {
                        continue resource;
                    }
                }
                let buyOrder = _.max(globalOrders.filter(order => order.resourceType === basicMinerals[i] &&
                order.type === ORDER_BUY && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                let sellOrder = _.min(globalOrders.filter(order => order.resourceType === basicMinerals[i] &&
                order.type === ORDER_SELL && order.remainingAmount >= 10000 && order.roomName !== terminal.pos.roomName), 'price');
                if (buyOrder.id && ((sellOrder.price -0.01) - buyOrder.price) > 0.02) {
                    if (Game.market.createOrder(ORDER_BUY, basicMinerals[i], buyOrder.price, 2000, terminal.pos.roomName) === OK) {
                        console.log('New Buy Order: ' + basicMinerals[i] + ' at/per ' + (buyOrder.price));
                    }
                }
            }
        }
}