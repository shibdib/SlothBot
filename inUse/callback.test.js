"use strict";
const cb = require('callback');

// Create our callback function and store in our global context
global.callback_test = new cb.Callback();

function callback_test() {
    const cbfunc = function (item) {
        console.log("fired:", item);
    };

    global.callback_test.subscribe(cbfunc);
    global.callback_test.fire('event #1');
    global.callback_test.unsubscribe(cbfunc);
    global.callback_test.fire('event #2');
    global.callback_test.subscribe(cbfunc);
    global.callback_test.fire('event #3');
}

module.exports = {
    callback_test,
};
