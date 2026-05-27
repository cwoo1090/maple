import { defineConfig, loadEnv } from "vite";
import chatHandler from "./api/chat.js";

function attachApiMiddleware(server) {
  server.middlewares.use("/api/chat", async (req, res) => {
    req.query = Object.fromEntries(new URL(req.url || "/", "http://localhost").searchParams);

    res.status = (statusCode) => {
      res.statusCode = statusCode;
      return res;
    };
    res.json = (payload) => {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      res.end(JSON.stringify(payload));
      return res;
    };

    try {
      await chatHandler(req, res);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: error.message || "Local chat API failed." }));
    }
  });
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [
      {
        name: "maple-public-wiki-api",
        configureServer: attachApiMiddleware,
        configurePreviewServer: attachApiMiddleware,
      },
    ],
  };
});
