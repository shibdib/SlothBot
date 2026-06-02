const fs = require('fs');
const path = require('path');

module.exports = function (grunt) {
    // --host=xxx    private server hostname (omit for official server)
    // --port=xxx    private server port (default: 21025)
    // --email=xxx   account email
    // --pass=xxx    account password
    // --token=xxx   auth token (alternative to pass, official server only)
    const host = grunt.option('host');
    const email = grunt.option('email');
    const pass = grunt.option('pass');
    const token = grunt.option('token');
    const season = grunt.option('season');
    const port = Number(grunt.option('port')) || 21025;

    grunt.loadNpmTasks('grunt-screeps');
    grunt.renameTask('screeps', '_screeps');

    // Flatten all .js files from ./default/ into ./upload/ with no subdirectories
    clearDirectory('./upload/');
    moveFilesFlat('./default/', './upload/');

    const screepsOptions = season
        ? {email, token, branch: 'default', server: 'season'} :
        token
            ? {email, token, branch: 'default'} :
            {
            email,
            password: pass,
            branch: 'default',
            ...(host ? {server: {host, port, http: true}} : {ptr: false})
        };

    grunt.initConfig({
        _screeps: {
            options: screepsOptions,
            dist: {src: ['upload/*.js']}
        }
    });

    grunt.registerTask('clean-upload', function () {
        clearDirectory('./upload/');
        grunt.log.writeln('Upload directory cleaned.');
    });

    grunt.registerTask('screeps', ['_screeps', 'clean-upload']);
    grunt.registerTask('default', ['screeps']);
};

function moveFilesFlat(sourceDir, targetDir) {
    if (!fs.existsSync(sourceDir)) {
        console.error(`Source directory does not exist: ${sourceDir}`);
        return;
    }
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
    }
    for (const entry of fs.readdirSync(sourceDir, {withFileTypes: true})) {
        const sourcePath = path.join(sourceDir, entry.name);
        if (entry.isDirectory()) {
            moveFilesFlat(sourcePath, targetDir);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            fs.copyFileSync(sourcePath, path.join(targetDir, entry.name));
        }
    }
}

function clearDirectory(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            clearDirectory(entryPath);
            fs.rmdirSync(entryPath);
        } else {
            fs.unlinkSync(entryPath);
        }
    }
}
