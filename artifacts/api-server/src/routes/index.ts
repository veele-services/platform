import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhooksRouter from "./webhooks";
import paymentRemindersRouter from "./payment-reminders";
import customersRouter from "./customers";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);
router.use(paymentRemindersRouter);
router.use(customersRouter);

export default router;
