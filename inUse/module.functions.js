/**
 * Created by Bob on 5/23/2017.
 */

module.exports.convertPath = function (path)
{
    const result = [];
    for (let i = 0; i + 1 < path.length; i++) {
        const pos = path[i];
        const rel = path[i + 1];
        let dir = pos.getDirectionTo(rel);
        if (pos.roomName !== rel.roomName) {
            dir = (dir + 4) & 7;
        }
        result.push({
            x: pox.x,
            y: pos.y,
            dir,
        });
    }
    return result;
};