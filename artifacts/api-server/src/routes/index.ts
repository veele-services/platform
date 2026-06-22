import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhooksRouter from "./webhooks";
import paymentRemindersRouter from "./payment-reminders";
import expiredQuotesRouter from "./expired-quotes";
import customersRouter from "./customers";
import pushNotificationsRouter from "./push-notifications";
import emailNotificationsRouter from "./email-notifications";
import notificationWorkerRouter from "./notification-worker";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhooksRouter);
router.use(paymentRemindersRouter);
router.use(expiredQuotesRouter);
router.use(pushNotificationsRouter);
router.use(emailNotificationsRouter);
router.use(notificationWorkerRouter);
// customersRouter installs requireAuth for every route in that router, so keep
// it after public/admin routers to avoid treating ADMIN_API_SECRET as a JWT.
router.use(customersRouter);

export default router;
