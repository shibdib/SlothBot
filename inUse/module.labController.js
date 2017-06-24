/**
 * Created by Bob on 6/24/2017.
 */

module.exports.labControl = function () {
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
                    lab.room.memory.reactions = cache;
                }
                for (let key of lab.room.memory.reactions) {
                    //Set initial labs
                    if (lab.room.memory.reactions[key].lab1 === null) {
                        lab.room.memory.reactions[key].lab1 = lab.id;
                        continue labs;
                    }
                    if (lab.room.memory.reactions[key].lab2 === null) {
                        lab.room.memory.reactions[key].lab2 = lab.id;
                        continue labs;
                    }
                    if (lab.room.memory.reactions[key].outputLab === null) {
                        lab.room.memory.reactions[key].outputLab = lab.id;
                        continue labs;
                    }

                    //if minerals are present, react!
                    let lab1 = Game.getObjectById(lab.room.memory.reactions[key].lab1);
                    let lab2 = Game.getObjectById(lab.room.memory.reactions[key].lab2);
                    let outputLab = Game.getObjectById(lab.room.memory.reactions[key].outputLab);
                    if ((lab1.mineralAmount > 0 && lab2.mineralAmount > 0) && outputLab.mineralAmount < outputLab.mineralCapacity * 0.75) {
                        lab.room.memory.reactions[key].isActive = outputLab.runReaction(lab1, lab2) === OK;
                    }
                }
            }
        }
};