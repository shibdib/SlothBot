/**
 * Created by Bob on 6/24/2017.
 */

const profiler = require('screeps-profiler');

function labControl() {
    let activeReactions = [
        RESOURCE_GHODIUM_OXIDE
    ];
    labs:
        for (let lab of _.values(Game.structures)) {
            if (lab.structureType === STRUCTURE_LAB) {
                //Initial reaction setup in memory
                if (!lab.room.memory.reactions) {
                    //Cache reaction
                    let cache = lab.room.memory.reactions || {};
                    cache['GH'] = {
                        input1: RESOURCE_HYDROGEN,
                        input2: RESOURCE_GHODIUM,
                        lab1: null,
                        lab2: null,
                        outputLab: null,
                        isActive: false
                    };
                    cache['GO'] = {
                        input1: RESOURCE_OXYGEN,
                        input2: RESOURCE_GHODIUM,
                        lab1: null,
                        lab2: null,
                        outputLab: null,
                        isActive: false
                    };
                    lab.room.memory.reactions = cache;
                }

                if (lab.room.memory.reactions) {
                    for (let i = 0; i < activeReactions.length; i++) {
                        let reaction = lab.room.memory.reactions[activeReactions[i]];
                        //Set initial labs
                        if (reaction.lab1 === null) {
                            reaction.lab1 = lab.id;
                            continue labs;
                        }
                        if (reaction.lab2 === null) {
                            reaction.lab2 = lab.id;
                            continue labs;
                        }
                        if (reaction.outputLab === null) {
                            reaction.outputLab = lab.id;
                            continue labs;
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