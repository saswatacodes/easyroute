import app, { websocket } from "./index";

const port = parseInt(process.env.PORT || "3000", 10);
console.log(`[EasyRoute] Starting server on port ${port}...`);
Bun.serve({
  fetch: app.fetch,
  port,
  websocket,
});
console.log(`[EasyRoute] Server running on http://0.0.0.0:${port}`);
