import express, { type Express, type Request, type Response } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

// Extend Express Request to carry the raw body buffer for webhook signature verification
declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
    }
  }
}

function captureRawBody(_req: Request, _res: Response, buf: Buffer): void {
  _req.rawBody = buf;
}

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ verify: captureRawBody }));
app.use(express.urlencoded({ extended: true, verify: captureRawBody }));

app.use("/api", router);

export default app;
