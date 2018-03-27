module.exports.diplomacyOverlord = function () {
    //Manage threats
    if (Game.time % 50 === 0 && Memory._badBoyList) threatManager();
};

function threatManager() {
    let newRating;
    Memory._badBoyArray = [];
    Memory._enemies = [];
    for (let key in Memory._badBoyList) {
        let threat = Memory._badBoyList[key];
        if (threat.lastAction + 100 < Game.time) {
            newRating = threat.threatRating - 1;
            if (newRating <= 0) {
                delete Memory._badBoyList[key];
                continue;
            } else {
                Memory._badBoyList[key].threatRating = newRating;
            }
        }
        if (Memory._badBoyList[key].threatRating > 10) {
            Memory._enemies.push(key);
        }
        let display = key + '-' + Memory._badBoyList[key].threatRating;
        Memory._badBoyArray.push(display);
    }
}