const fs = require('fs');
const path = require('path');

module.exports = async function (grunt) {
    // --force --host=xxx --email=xxx --pass=xxx
    let host = grunt.option('host');
    let email = grunt.option('email');
    let pass = grunt.option('pass');
    let token = grunt.option('token');
    let server = grunt.option('server') || "world";
    let port = grunt.option('port') || 21025;
    grunt.loadNpmTasks('grunt-screeps');

    clearDirectory('./upload/')
    moveFilesRecursively('./default/', './upload/');

    if (!token) {
        await grunt.initConfig({
            screeps: {
                options: {
                    server: {
                        host: host,
                        port: port,
                        http: true
                    },
                    email: email,
                    password: pass,
                    branch: "default",
                    ptr: false
                },
                dist: {
                    src: ['upload/*.js']
                }
            }
        });
    } else {
        await grunt.initConfig({
            screeps: {
                options: {
                    email: email,
                    token: token,
                    branch: "default",
                    server: server
                },
                dist: {
                    src: ['upload/*.js']
                }
            }
        });
    }
    clearDirectory('./upload/')
};

// Function to move files recursively
function moveFilesRecursively(sourceDir, targetDir) {
    // Check if source directory exists
    if (!fs.existsSync(sourceDir)) {
        console.error('Source directory does not exist.');
        return;
    }

    // Create target directory if it doesn't exist
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, {recursive: true});
    }

    // Read the contents of the directory
    const entries = fs.readdirSync(sourceDir, {withFileTypes: true});

    for (let entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            // If it's a directory, recursively move its contents
            moveFilesRecursively(sourcePath, targetDir);
        } else {
            // If it's a file, move it
            fs.copyFileSync(sourcePath, targetPath);
            console.log(`Moved file: ${sourcePath} to ${targetPath}`);
        }
    }
}

function clearDirectory(dir) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, {withFileTypes: true});

    for (let entry of entries) {
        const entryPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Recursively remove directories
            clearDirectory(entryPath);
            fs.rmdirSync(entryPath);
        } else {
            // Remove files
            fs.unlinkSync(entryPath);
        }
    }
}