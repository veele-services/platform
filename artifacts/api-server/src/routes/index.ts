import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhooksRouter from "./webhooks";
import paymentRemindersRouter from "./payment-reminders";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);
router.use(paymentRemindersRouter);

export default router;
