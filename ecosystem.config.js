// ecosystem.config.js
// This file is a configuration for PM2, a process manager for Node.js applications.
// It ensures that the backend server is started with the correct settings,
// especially the correct working directory, to prevent module resolution errors.

module.exports = {
  apps: [
    {
      // The name of the application to be displayed in PM2
      name: 'ppc-auto-backend',

      // The path to the script PM2 will execute to start the application.
      // It's relative to the location of this ecosystem file.
      script: 'backend/server.js',

      // Set to false to disable watching. Set to true to restart on file changes.
      watch: false,

      // By default, PM2 will use the directory of this config file as the
      // current working directory (CWD). This is crucial because our `node_modules`
      // folder is at the project root, and this ensures Node.js can find all the required packages.
      
      // Environment variables for the application
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
