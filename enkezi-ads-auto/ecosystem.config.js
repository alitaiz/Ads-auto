// ecosystem.config.js
// This file is a configuration for PM2, a process manager for Node.js applications.
// It ensures that the backend server is started with the correct settings.

module.exports = {
  apps: [
    {
      // The name of the application to be displayed in PM2
      name: 'ppc-auto-backend-enkezi',

      // We instruct PM2 to run the `npm` command.
      script: 'npm',
      
      // We pass the arguments 'run server:start' to npm.
      // This executes the "server:start" script from our root package.json.
      // This is a more robust method than running 'node backend/server.js' directly,
      // as it guarantees that Node.js runs with the project root as its
      // working directory, correctly locating the node_modules folder.
      args: 'run server:start',

      // Disable watching for file changes in production.
      watch: false,

      // Environment variables for the application
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};