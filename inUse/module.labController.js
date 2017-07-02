/**
 * Created by Bob on 6/24/2017.
 */

const profiler = require('screeps-profiler');
let _ = require('lodash');

function labControl() {
    for (let lab of _.values(Game.structures)) {
        if (lab.structureType === STRUCTURE_LAB) {
            //Initial reaction setup in memory
            cacheReactions(lab);
            const labs = lab.pos.findInRange(FIND_MY_STRUCTURES, 2, {filter: (s) => s.structureType === STRUCTURE_LAB});
            if (labs.length >= 3 && (_.includes(lab.room.memory.reactions.hubs, labs[0]) === false || _.includes(lab.room.memory.reactions.hubs, labs[1]) === false || _.includes(lab.room.memory.reactions.hubs, labs[2]) === false)) {
                createLabHub(labs);
                continue;
            }
            if (lab.room.memory.reactions.hubs.length !== lab.room.memory.reactionHubCount) {
                lab.room.memory.reactionHubCount = lab.room.memory.reactions.hubs.length;
                cacheReactions(lab, true);
            }
            if (lab.room.memory.reactions.hubs) {
                let hubs;
                for (let keys in lab.room.memory.reactions.hubs) {
                    hubs = lab.room.memory.reactions.hubs[keys];
                    let reaction;
                    for (let key in lab.room.memory.reactions) {
                        if (key === 'current' || key === 'currentAge') {
                            continue;
                        }
                        reaction = lab.room.memory.reactions[key];
                        //Set initial labs
                        if ((!reaction.assignedHub || _.includes(lab.room.memory.reactions.hubs, reaction.assignedHub) === false) && _.includes(lab.room.memory.reactions, hubs.hub) === false) {
                            reaction.assignedHub = hubs.hub;
                            reaction.lab1 = hubs.lab1;
                            reaction.lab2 = hubs.lab2;
                            reaction.outputLab = hubs.lab3;
                        }

                        //if minerals are present, react!
                        let lab1 = Game.getObjectById(reaction.lab1);
                        let lab2 = Game.getObjectById(reaction.lab2);
                        let outputLab = Game.getObjectById(reaction.outputLab);
                        if ((lab1.mineralAmount > 0 && lab2.mineralAmount > 0) && outputLab.mineralAmount < outputLab.mineralCapacity * 0.75) {
                            reaction.isActive = outputLab.runReaction(lab1, lab2) === OK;
                        }
                    }
                }
            }
        }
    }
}
module.exports.labControl = profiler.registerFN(labControl, 'labControl');

function cacheReactions(lab, force = false) {
    //Cache reaction
    let cache = lab.room.memory.reactions || {};
    if (!lab.room.memory.reactions[RESOURCE_KEANIUM_OXIDE] || !lab.room.memory.reactions[RESOURCE_KEANIUM_OXIDE].output || force) {
        cache[RESOURCE_KEANIUM_OXIDE] = {
            input1: RESOURCE_OXYGEN,
            input2: RESOURCE_KEANIUM,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_KEANIUM_OXIDE,
            isActive: false
        };
    }
    if (!lab.room.memory.reactions['GO'] || !lab.room.memory.reactions['GO'].output || force) {
        cache['GO'] = {
            input1: RESOURCE_OXYGEN,
            input2: RESOURCE_GHODIUM,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_GHODIUM_OXIDE,
            isActive: false
        };
    }
    if (!lab.room.memory.reactions['GH'] || !lab.room.memory.reactions['GH'].output || force) {
        cache['GH'] = {
            input1: RESOURCE_HYDROGEN,
            input2: RESOURCE_GHODIUM,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_GHODIUM_HYDRIDE,
            isActive: false
        };
    }
    if (!lab.room.memory.reactions[RESOURCE_GHODIUM_ALKALIDE] || !lab.room.memory.reactions[RESOURCE_GHODIUM_ALKALIDE].output || force) {
        cache[RESOURCE_GHODIUM_ALKALIDE] = {
            input1: RESOURCE_GHODIUM_OXIDE,
            input2: RESOURCE_HYDROXIDE,
            lab1: null,
            lab2: null,
            outputLab: null,
            output: RESOURCE_GHODIUM_ALKALIDE,
            isActive: false
        };
    }
    lab.room.memory.reactions = cache;
}

function createLabHub(labs) {
    let cache = labs[0].room.memory.reactions.hubs || {};
    let key = labs[0].id.slice(-2).concat(labs[0].id.slice(-2), labs[0].id.slice(-2));
    cache[key] = {
        hub: key,
        lab1: labs[0].id,
        lab2: labs[1].id,
        lab3: labs[2].id,
    };
    labs[0].room.memory.reactions.hubs = cache;
}