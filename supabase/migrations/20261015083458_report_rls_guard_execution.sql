SET local check_function_bodies = off;

REVOKE ALL ON FUNCTION "private"."report_backoffice"(uuid) FROM "authenticated";

GRANT EXECUTE ON FUNCTION "private"."report_backoffice"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."report_storage_frozen"(text, text) FROM "authenticated";

GRANT EXECUTE ON FUNCTION "private"."report_storage_frozen"(text, text) TO "authenticated";

