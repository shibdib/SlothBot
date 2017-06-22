/**
 * Created by rober on 6/21/2017.
 */


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
        }
    }
};

function fillBuyOrders(terminal) {
    if (terminal.store[RESOURCE_ENERGY] >= 1000) {
        for (const resourceType in terminal.store) {
            if (terminal.store[resourceType] >= 1000 && resourceType !== RESOURCE_ENERGY) {
                let buyOrder = _.max(Game.market.getAllOrders(order => order.resourceType === resourceType &&
                order.type === ORDER_BUY && order.remainingAmount >= 1000 &&
                Game.market.calcTransactionCost(1000, terminal.pos.roomName, order.roomName) <= 500), 'price');
                if (buyOrder.id) {
                    if (Game.market.deal(buyOrder.id, 1000, terminal.pos.roomName) === OK) {
                        console.log('buyOrderFilled - 1000 ' + resourceType + ' for ' + buyOrder.price * 1000);
                    }
                } else {
                    let buyOrder = _.max(Game.market.getAllOrders(order => order.resourceType === resourceType &&
                    order.type === ORDER_BUY && order.remainingAmount >= 1000 &&
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
                    if (Game.market.orders[key].remainingAmount < 10000) {
                        if (Game.market.extendOrder(Game.market.orders[key].id, 10000 - Game.market.orders[key].remainingAmount) === OK) {
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
            if (terminal.store[resourceType] >= 100 && resourceType !== RESOURCE_ENERGY) {
                if (Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_SELL) {
                    let sellOrder = _.min(Game.market.getAllOrders(order => order.resourceType === resourceType &&
                    order.type === ORDER_SELL && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
                    Game.market.calcTransactionCost(terminal.store[resourceType], terminal.pos.roomName, order.roomName) <= 1000), 'price');
                    if (sellOrder.id && (sellOrder.price - 0.01) !== Game.market.orders[key].price) {
                        if (Game.market.changeOrderPrice(Game.market.orders[key].id, (sellOrder.price - 0.01)) === OK) {
                            console.log('Sell order price change ' + Game.market.orders[key].id + ' new/old ' + (sellOrder.price - 0.01) + "/" + Game.market.orders[key].price);
                        }
                    }
                    if (Game.market.extendOrder(Game.market.orders[key].id, terminal.store[resourceType]) === OK) {
                        console.log('Extended sell order ' + Game.market.orders[key].id + ' an additional ' + terminal.store[resourceType]);
                    }
                }
            }
        }
    }
}

function placeSellOrders(terminal) {
    resource:
    for (const resourceType in terminal.store) {
        if (terminal.store[resourceType] >= 1000 && resourceType !== RESOURCE_ENERGY) {
            for (let key in Game.market.orders) {
                if (Game.market.orders[key].resourceType === resourceType && Game.market.orders[key].type === ORDER_SELL) {
                    break resource;
                }
            }
            let sellOrder = _.min(Game.market.getAllOrders(order => order.resourceType === resourceType &&
            order.type === ORDER_SELL && order.remainingAmount >= 1000 && order.roomName !== terminal.pos.roomName &&
            Game.market.calcTransactionCost(terminal.store[resourceType], terminal.pos.roomName, order.roomName) <= 1000), 'price');
            if (sellOrder.id) {
                if (Game.market.createOrder(ORDER_SELL, resourceType, (sellOrder.price - 0.01), terminal.store[resourceType]) === OK) {
                    console.log('New Sell Order: ' + Game.market.orders[key].id + ' Price ' + (sellOrder.price - 0.01));
                }
            }
        }
    }
}