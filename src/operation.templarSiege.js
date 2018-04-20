Creep.prototype.templarSiege = function () {
    if (!this.moveToStaging() || this.room.name === this.memory.targetRoom) {
        this.templarCombat();
    }
};