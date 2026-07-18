# Fieldgrid e-mail template variables

Deze lijst komt overeen met de centrale registry in `lib/db/src/email-templates.ts`.

| Template key | Verplicht | Optioneel |
| --- | --- | --- |
| `account_invite` | `recipientName`, `portalName`, `activationUrl`, `code` | - |
| `password_reset` | `recipientName`, `portalName`, `resetUrl`, `code` | - |
| `report_submitted` | `assignmentTitle`, `reportUrl` | `reporterName`, `assignmentId`, `reportId` |
| `leave_request_submitted` | `personnelName`, `leaveType`, `period`, `leaveUrl` | `reason` |
| `leave_request_decision` | `firstName`, `decision`, `decisionMessage`, `leaveType`, `period`, `leaveUrl` | - |
| `report_approved` | `firstName`, `assignmentTitle`, `reportsUrl` | `reportId` |
| `report_rejected` | `firstName`, `assignmentTitle`, `reason`, `reportsUrl` | `reportId` |
| `quote_expired` | `customerName`, `quoteNumber`, `amount`, `quotesUrl` | - |
| `quote_decision_received` | `customerName`, `quoteNumber`, `decision`, `quotesUrl` | `reason` |
| `quote_available` | `customerName`, `quoteNumber`, `amount`, `validityDate`, `quoteUrl` | `quoteId` |
| `invoice_available` | `customerName`, `invoiceNumber`, `totalAmount`, `dueDate`, `invoiceUrl` | `paymentUrl` |
| `invoice_payment_reminder` | `customerName`, `invoiceNumber`, `totalAmount`, `dueDate`, `invoiceUrl` | `invoiceId` |
| `notification_manual` | `notificationTitle`, `notificationBody` | `notificationPreheader`, `ctaUrl`, `ctaLabel` |
| `notification_test` | `notificationTypeLabel`, `notificationType` | - |
| `tenant_mail_settings_test` | - | - |
| `platform_email_test` | - | `triggeredAt` |

## Automatische variabelen

De renderer vult deze variabelen zelf:

- `brandName`: effectieve tenant- of platformmerknaam.
- `platformName`: `Fieldgrid`.

## URL-variabelen

Deze variabelen worden als CTA of link gebruikt en moeten een veilige URL bevatten:

- `activationUrl`
- `resetUrl`
- `reportUrl`
- `leaveUrl`
- `reportsUrl`
- `quotesUrl`
- `quoteUrl`
- `invoiceUrl`
- `paymentUrl`
- `ctaUrl`

Toegestaan: `https://...`, `http://...` en relatieve paden zoals `/facturen`. Niet toegestaan: `javascript:`, protocol-relative URL's zoals `//example.com`, of lege verplichte CTA's.
