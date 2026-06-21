import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhooksRouter from "./webhooks";
import paymentRemindersRouter from "./payment-reminders";
import expiredQuotesRouter from "./expired-quotes";
import customersRouter from "./customers";
import pushNotificationsRouter from "./push-notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);
router.use(paymentRemindersRouter);
router.use(expiredQuotesRouter);
router.use(customersRouter);
router.use(pushNotificationsRouter);

export default router;
