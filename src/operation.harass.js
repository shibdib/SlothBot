/*
 * Copyright for Bob "Shibdib" Sardinia - See license file for more information,(c) 2023.
 */

const highCommand = require('military.highCommand');
Creep.prototype.harass = function () {
    // If no one remains to harass, border patrol
    if (!Memory.harassTargets || !Memory.harassTargets.length) {
        this.memory.operation = 'borderPatrol';
        return;
    }
    Game.map.visual.text(ICONS.nuke, this.pos, {color: '#FF0000', fontSize: 4});
    let sentence = ['MURDER', 'MODE', 'ACTIVATED', '--', 'DANGER', '--'];
    this.say(sentence[Game.time % sentence.length], true);
    if (this.room.name === this.memory.destination) {
        highCommand.generateThreat(this);
        // Handle combat
        if ((this.room.hostileCreeps.length || this.room.hostileStructures.length) && this.canIWin(50)) {
            if (!this.handleMilitaryCreep() && !this.scorchedEarth()) this.findDefensivePosition();
        } else {
            let visited = this.memory.other.visited || [];
            visited.push(this.room.name);
            this.memory.other.visited = visited;
            let target = _.min(_.filter(INTEL, (r) => !visited.includes(r.name) && !r.owner && Memory.harassTargets.includes(r.user)), function (r) {
                return findClosestOwnedRoom(r.name, true);
            }).name;
            if (target) {
                this.memory.destination = target;
                this.say('RE-TASKED', true);
                log.a('Re-tasking harasser ' + this.name + ' to ' + roomLink(target) + ' targeting ' + INTEL[target].user + ' from ' + roomLink(this.room.name), 'HARASS: ');
            } else if (this.memory.other.visited.length) {
                this.memory.other.visited = [];
            } else {
                this.idleFor(5);
            }
        }
    } else {
        if (this.room.hostileCreeps.length && this.canIWin(50)) return this.handleMilitaryCreep();
        return this.shibMove(new RoomPosition(25, 25, this.memory.destination), {range: 22});
    }
};