import { redirect } from "next/navigation";
/** The account picker prevents an old notification link selecting another customer. */
export default function CustomerNotification(){redirect("/klant?view=notifications");}
