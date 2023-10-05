/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

/**
 * Created by Bob on 7/12/2017.
 */

module.exports.role = function (creep) {
    switch (creep.memory.operation) {
        case 'drain':
            creep.drainRoom();
            break;
    }
};