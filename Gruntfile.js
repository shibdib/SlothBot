module.exports = function (grunt) {
    // Var style - --force --host=xxx --email=xxx --pass=xxx
    let host = grunt.option('host');
    let email = grunt.option('email');
    let pass = grunt.option('pass');
    let token = grunt.option('token');
    let server = grunt.option('server') || "world";
    let port = grunt.option('port') || 21025;
    grunt.loadNpmTasks('grunt-screeps');

    if (!token) {
        grunt.initConfig({
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
                    src: ['src/*.js']
                }
            }
        });
    } else {
        console.log(server)
        grunt.initConfig({
            screeps: {
                options: {
                    email: email,
                    token: token,
                    branch: "default",
                    server: server
                },
                dist: {
                    src: ['src/*.js']
                }
            }
        });
    }
};