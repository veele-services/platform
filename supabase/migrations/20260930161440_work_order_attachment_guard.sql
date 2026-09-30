DROP TRIGGER "attachments_snapshot_guard" ON "public"."attachments";

CREATE TRIGGER attachments_snapshot_guard
  BEFORE INSERT OR DELETE OR UPDATE ON public.attachments
  FOR EACH ROW
  EXECUTE FUNCTION private.work_order_report_source_guard();
