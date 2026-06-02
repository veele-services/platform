module.exports = {
  apps: [
    {
      name: "veele-staging-personeel",
      cwd: "/var/www/veele-staging",
      script: "pnpm",
      args: "--filter @workspace/personeel-pwa run start",
      env: {
        NODE_ENV: "production",
        PORT: "3004",
      },
    },
  ],
};
