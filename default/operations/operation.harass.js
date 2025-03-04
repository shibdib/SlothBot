/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

Creep.prototype.harass = function () {
    // Combat handling
    if (!this.canIWin(50)) return this.fleeHome();
    if (this.handleMilitaryCreep()) return;

    this.attackInRange();

    let sentence = ['MURDER', 'MODE', 'ACTIVATED', '--', 'DANGER', '--'];
    this.say(sentence[Game.time % sentence.length], true);

    if (this.room.name === this.memory.destination || !this.memory.destination) {
        // Handle visited tracking
        let visited = this.memory.other.visited || [];

        // Find the next harass target by considering threat level and user activity
        let target = _.min(
            _.filter(INTEL, (r) => {
                return (!visited.includes(r.name) && (!r.owner || !r.towers) && THREATS.includes(r.user)
                    && (!r.armedHostile || r.armedHostile + CREEP_LIFE_TIME < Game.time) && !r.safemode);
            }),
            (r) => findClosestOwnedRoom(r.name, true)
        );

        if (target && target.name) {
            visited.push(this.room.name);
            this.memory.other.visited = visited;
            this.memory.destination = target.name;
            this.say('RE-TASKED', true);
            log.a('Re-tasking harasser ' + this.name + ' to ' + roomLink(target.name) + ' targeting ' + INTEL[target.name].user + ' from ' + roomLink(this.room.name), 'HARASS: ');
        } else if (this.memory.other.visited.length) {
            this.memory.other.visited = [];
        } else {
            return this.fleeHome(true);
        }
    } else {
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};
