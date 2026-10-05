import { redirect } from "next/navigation";
/** Existing links enter the same selected-account customer workspace. */
export default function CustomerRequests(){redirect("/klant?view=requests");}
