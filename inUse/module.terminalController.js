/**
 * Created by rober on 6/21/2017.
 */


module.exports.terminalControl = function () {
    for (let terminal of _.values(Game.structures)) {
        if (terminal.structureType === STRUCTURE_TERMINAL) {
            //if we have credits make sure we have energy
            if (Game.market.credits >= 100 && terminal.store[RESOURCE_ENERGY] < 2000 && terminal.store[RESOURCE_ENERGY] > 500) {
                buyEnergy(terminal);
            }

            //if low on credits fill buy orders
            if (Game.market.credits < 1000) {
                fillBuyOrders(terminal);
            }
        }
    }
};

function fillBuyOrders(terminal) {
    if (terminal.store[RESOURCE_ENERGY] >= 1000) {
        for (const resourceType in terminal.store) {
            if (terminal.store[resourceType] > 1000 && resourceType !== RESOURCE_ENERGY) {
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
    let sellOrder = _.min(Game.market.getAllOrders(order => order.resourceType === RESOURCE_ENERGY &&
    order.type === ORDER_SELL &&
    Game.market.calcTransactionCost(100 * order.price, terminal.pos.roomName, order.roomName) <= 500), 'price');
    if (sellOrder.id) {
        if (Game.market.deal(sellOrder.id, 100 * sellOrder.price, terminal.pos.roomName) === OK) {
            console.log('energyPurchased -' + 100 * sellOrder.price + ' for ' + sellOrder.price * 1000);
        }
    } else {
        let sellOrder = _.min(Game.market.getAllOrders(order => order.resourceType === RESOURCE_ENERGY &&
        order.type === ORDER_SELL &&
        Game.market.calcTransactionCost(100 * order.price, terminal.pos.roomName, order.roomName) <= 1000), 'price');
        if (sellOrder.id) {
            if (Game.market.deal(sellOrder.id, 100 * sellOrder.price, terminal.pos.roomName) === OK) {
                console.log('energyPurchased -' + 100 * sellOrder.price + ' for ' + sellOrder.price * 1000);
            }
        }
    }
}