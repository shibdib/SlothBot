/**
 * Created by Bob on 6/24/2017.
 */

const profiler = require('screeps-profiler');

function labControl() {
    labs:
        for (let lab of _.values(Game.structures)) {
            if (lab.structureType === STRUCTURE_LAB) {
                const labs = _.filter(Game.structures, (s) => s.room.name  === lab.room.name && s.structureType === STRUCTURE_LAB);
                if (labs.length >= 3) {
                    //Initial reaction setup in memory
                    cacheReactions(lab);
                    if (lab.room.memory.reactions) {
                        let reaction;
                        for (let key in lab.room.memory.reactions) {
                            if (key === 'current' || key === 'currentAge') {
                                continue;
                            }
                            reaction = lab.room.memory.reactions[key];
                            //Set initial labs
                            if ((!reaction.lab1 || !Game.getObjectById(reaction.lab1)) && reaction.lab2 !== lab.id && reaction.outputLab !== lab.id) {
                                reaction.lab1 = lab.id;
                                continue labs;
                            }
                            if ((!reaction.lab2 || !Game.getObjectById(reaction.lab2)) && reaction.lab1 !== lab.id && reaction.outputLab !== lab.id) {
                                reaction.lab2 = lab.id;
                                continue labs;
                            }
                            if ((!reaction.outputLab || !Game.getObjectById(reaction.outputLab)) && reaction.lab1 !== lab.id && reaction.lab2 !== lab.id) {
                                reaction.outputLab = lab.id;
                                continue labs;
                            }
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
module.exports.labControl = profiler.registerFN(labControl, 'labControl');

function cacheReactions(lab) {
    //Cache reaction
    let cache = lab.room.memory.reactions || {};
    if (!lab.room.memory.reactions['GH'] || !lab.room.memory.reactions['GH'].output) {
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
    if (!lab.room.memory.reactions['GO'] || !lab.room.memory.reactions['GO'].output) {
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
    if (!lab.room.memory.reactions[RESOURCE_GHODIUM_ALKALIDE] || !lab.room.memory.reactions[RESOURCE_GHODIUM_ALKALIDE].output) {
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
    if (!lab.room.memory.reactions[RESOURCE_KEANIUM_OXIDE] || !lab.room.memory.reactions[RESOURCE_KEANIUM_OXIDE].output) {
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
    lab.room.memory.reactions = cache;
}