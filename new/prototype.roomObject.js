/**
 * Generalized target locking function for actors with memory.
 *
 * Valid actors include creeps, flags, and structures if you assign them memory.
 *
 * The selector function picks all available candidates, but only runs during
 * the target selection phase. This is where your CPU heavy work should go.
 *
 * The validator function is ran for each candidate, and once per call to
 * ensure the target is still valid for use, so you want this function to be as
 * cheap as possible. The parameter is technically optional, with all values
 * being considered valid. But then why are you using this?
 *
 * The chooser function is ran once at the end of target selection, to pick
 * which of the valid candidates you want to use. This parameter is optional,
 * defaulting to the first item in the array if omitted. It expects a single
 * result so opt for a _.min or _.max over a sort.
 *
 * The prop parameter is the key used to store the target's id in memory. This
 * optionally allows us to have multiple target locks with different names.
 *
 * @param selector
 * @param validator
 * @param chooser
 * @param prop
 */
RoomObject.prototype.getTarget = function (selector, validator = _.identity, chooser = _.first, prop = 'tid') {
    let tid = this.memory[prop];
    let target = Game.getObjectById(tid);
    if (target === null || !validator(target)) {
        let candidates = _.filter(selector.call(this, this), validator);
        if (candidates && candidates.length)
            target = chooser(candidates, this);
        else
            target = null;
        if (target)
            this.memory[prop] = target.id;
        else
            delete this.memory[prop];
    }
    if (target)
        target.room.visual.line(this.pos, target.pos, {lineStyle: 'dashed', opacity: 0.5});
    return target;
};

/**
 * Similar to getTarget, but ensures no other actor is assigned to this target.
 *
 * @param selector
 * @param restrictor
 * @param validator
 * @param chooser
 * @param prop
 */
RoomObject.prototype.getUniqueTarget = function (selector, restrictor, validator = _.identity, chooser = _.first, prop = 'tid') {
    let tid = this.memory[prop];
    let target = Game.getObjectById(tid);
    if (target === null || !validator(target)) {
        this.clearTarget(prop);
        let invalid = restrictor.call(this, this) || [];
        let candidates = _.filter(selector.call(this, this), x => validator(x) && !invalid.includes(x.id));
        if (candidates && candidates.length)
            target = chooser(candidates, this);
        else
            target = null;
        if (target)
            this.memory[prop] = target.id;
        // console.log(`New target on tick ${Game.time}: ${target}`);
    }
    if (target)
        target.room.visual.line(this.pos, target.pos, {lineStyle: 'dashed', opacity: 0.5});
    return target;
};

RoomObject.prototype.clearTarget = function (prop = 'tid') {
    // delete this.memory[prop];
    this.memory[prop] = undefined;
};

Creep.prototype.getRepairTarget = function () {
    return this.getTarget(
        ({room, pos}) => room.find(FIND_STRUCTURES),
        (structure) => structure.hits < structure.hitsMax,
        (candidates) => _.min(candidates, 'hits')
    );
};

Creep.prototype.getLoadedContainerTarget = function () {
    return this.getTarget(
        ({room, pos}) => room.find(FIND_STRUCTURES, {filter: s => s.structureType === STRUCTURE_CONTAINER}),
        (container) => _.sum(container.store) > 0,
        (containers) => _.max(containers, c => _.sum(container.store))
    )
};