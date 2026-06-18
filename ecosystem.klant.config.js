module.exports = {
  apps: [
    {
      name: "veele-klant",
      cwd: "/var/www/veele",
      script: "pnpm",
      args: "--filter @workspace/klant-pwa run start",
      env: {
        NODE_ENV: "production",
        PORT: "3003",
      },
    },
  ],
};
