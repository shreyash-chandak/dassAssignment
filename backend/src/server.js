const http = require("http");
const app = require("./app");
const connectDatabase = require("./config/db");
const seedAdmin = require("./config/seedAdmin");
const env = require("./config/env");
const { initSocket } = require("./services/socketService");

const server = http.createServer(app);
initSocket(server);

async function bootstrap() {
  await connectDatabase();
  await seedAdmin();

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to bootstrap server", error);
  process.exit(1);
});
