Creep.prototype.drainRoom = function () {
    let sentence = ['Gimme', 'That', 'Energy', 'Please'];
    let word = Game.time % sentence.length;
    this.say(sentence[word], true);
    this.heal(this);
    this.borderHump();
};