import { randomUUID } from "node:crypto";
import net from "node:net";
import tls from "node:tls";

export type SmtpEncryption = "none" | "starttls" | "tls";

export type SmtpMailConfig = {
  host: string;
  port: number;
  encryption: SmtpEncryption;
  username: string | null;
  password: string | null;
  fromEmail: string;
  fromName: string | null;
  replyTo: string | null;
};

export type SmtpMailOptions = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{ filename: string; content: Buffer }>;
};

type SmtpResponse = {
  code: number;
  text: string;
};

class ResponseReader {
  private buffer = "";
  private waiters: Array<{
    resolve: (response: SmtpResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }> = [];

  constructor(private socket: net.Socket | tls.TLSSocket) {
    socket.on("data", this.handleData);
    socket.on("error", this.handleError);
    socket.on("close", this.handleClose);
  }

  read(timeoutMs = 30000): Promise<SmtpResponse> {
    const existing = this.extractResponse();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error("SMTP-server reageert niet op tijd."));
      }, timeoutMs);

      this.waiters.push({ resolve, reject, timer });
    });
  }

  dispose() {
    this.socket.off("data", this.handleData);
    this.socket.off("error", this.handleError);
    this.socket.off("close", this.handleClose);
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
    }
    this.waiters = [];
  }

  private handleData = (chunk: Buffer) => {
    this.buffer += chunk.toString("utf8");
    this.flush();
  };

  private handleError = (error: Error) => {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.waiters = [];
  };

  private handleClose = () => {
    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("SMTP-verbinding is gesloten."));
    }
    this.waiters = [];
  };

  private flush() {
    while (this.waiters.length > 0) {
      const response = this.extractResponse();
      if (!response) return;

      const waiter = this.waiters.shift()!;
      clearTimeout(waiter.timer);
      waiter.resolve(response);
    }
  }

  private extractResponse(): SmtpResponse | null {
    const lines = this.buffer.split(/\r?\n/u);
    for (let i = 0; i < lines.length; i += 1) {
      if (/^\d{3} /u.test(lines[i]!)) {
        const responseLines = lines.slice(0, i + 1);
        this.buffer = lines.slice(i + 1).join("\r\n");
        const code = Number(responseLines[0]!.slice(0, 3));
        return { code, text: responseLines.join("\n") };
      }
    }

    return null;
  }
}

function ensureCode(response: SmtpResponse, expected: number | number[], commandName: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) {
    throw new Error(`${commandName} mislukt: ${response.text}`);
  }
}

async function smtpCommand(
  socket: net.Socket | tls.TLSSocket,
  reader: ResponseReader,
  commandText: string,
  expected: number | number[],
  commandName = commandText.split(" ")[0] ?? "SMTP",
): Promise<SmtpResponse> {
  socket.write(`${commandText}\r\n`);
  const response = await reader.read();
  ensureCode(response, expected, commandName);
  return response;
}

function connectPlain(config: SmtpMailConfig): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(config.port, config.host);
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
    socket.setTimeout(30000, () => {
      socket.destroy(new Error("SMTP-verbinding time-out."));
    });
  });
}

function connectTls(config: SmtpMailConfig, socket?: net.Socket): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({
      host: socket ? undefined : config.host,
      port: socket ? undefined : config.port,
      socket,
      servername: config.host,
    });
    tlsSocket.once("secureConnect", () => resolve(tlsSocket));
    tlsSocket.once("error", reject);
    tlsSocket.setTimeout(30000, () => {
      tlsSocket.destroy(new Error("SMTP TLS-verbinding time-out."));
    });
  });
}

function normalizeRecipients(to: string | string[]): string[] {
  return (Array.isArray(to) ? to : [to])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function encodeHeader(value: string): string {
  return /^[\x20-\x7E]*$/u.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function messageIdDomain(fromEmail: string): string {
  const domain = fromEmail.split("@")[1]?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9.-]+\.[a-z]{2,}$/u.test(domain)) return "fieldgrid.nl";
  return domain;
}

function formatAddress(email: string, name?: string | null): string {
  if (!name) return `<${email}>`;
  const escapedName = encodeHeader(name.replace(/"/gu, ""));
  return `"${escapedName}" <${email}>`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/giu, "")
    .replace(/<script[\s\S]*?<\/script>/giu, "")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/giu, "\n")
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function foldBase64(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/.{1,76}/gu, "$&\r\n")
    .trimEnd();
}

function dotStuff(message: string): string {
  return message
    .replace(/\r?\n/gu, "\r\n")
    .split("\r\n")
    .map((line) => (line.startsWith(".") ? `.${line}` : line))
    .join("\r\n");
}

function buildMessage(config: SmtpMailConfig, options: SmtpMailOptions, recipients: string[]): string {
  const mixedBoundary = `fieldgrid-mixed-${randomUUID()}`;
  const alternativeBoundary = `fieldgrid-alt-${randomUUID()}`;
  const text = options.text?.trim() || htmlToText(options.html);
  const headers = [
    `From: ${formatAddress(config.fromEmail, config.fromName)}`,
    `To: ${recipients.map((recipient) => `<${recipient}>`).join(", ")}`,
    config.replyTo ? `Reply-To: <${config.replyTo}>` : null,
    `Subject: ${encodeHeader(options.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${randomUUID()}@${messageIdDomain(config.fromEmail)}>`,
    "Auto-Submitted: auto-generated",
    "X-Auto-Response-Suppress: All",
    "MIME-Version: 1.0",
  ].filter(Boolean);

  const alternativeParts = [
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    options.html,
    `--${alternativeBoundary}--`,
  ];

  if (!options.attachments?.length) {
    return [
      ...headers,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      "",
      ...alternativeParts,
    ].join("\r\n");
  }

  const parts = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    ...alternativeParts,
  ];

  for (const attachment of options.attachments) {
    parts.push(
      `--${mixedBoundary}`,
      "Content-Type: application/octet-stream",
      `Content-Disposition: attachment; filename="${attachment.filename.replace(/"/gu, "")}"`,
      "Content-Transfer-Encoding: base64",
      "",
      foldBase64(attachment.content),
    );
  }

  parts.push(`--${mixedBoundary}--`);

  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    ...parts,
  ].join("\r\n");
}

export async function sendSmtpMail(config: SmtpMailConfig, options: SmtpMailOptions): Promise<string | null> {
  const recipients = normalizeRecipients(options.to);
  if (recipients.length === 0) {
    throw new Error("Geen ontvanger opgegeven.");
  }

  let socket: net.Socket | tls.TLSSocket =
    config.encryption === "tls"
      ? await connectTls(config)
      : await connectPlain(config);

  let reader = new ResponseReader(socket);

  try {
    ensureCode(await reader.read(), 220, "SMTP-greeting");
    await smtpCommand(socket, reader, "EHLO fieldgrid.local", 250, "EHLO");

    if (config.encryption === "starttls") {
      await smtpCommand(socket, reader, "STARTTLS", 220, "STARTTLS");
      reader.dispose();
      socket = await connectTls(config, socket as net.Socket);
      reader = new ResponseReader(socket);
      await smtpCommand(socket, reader, "EHLO fieldgrid.local", 250, "EHLO");
    }

    if (config.username) {
      await smtpCommand(socket, reader, "AUTH LOGIN", 334, "AUTH LOGIN");
      await smtpCommand(
        socket,
        reader,
        Buffer.from(config.username, "utf8").toString("base64"),
        334,
        "SMTP-gebruikersnaam",
      );
      await smtpCommand(
        socket,
        reader,
        Buffer.from(config.password ?? "", "utf8").toString("base64"),
        235,
        "SMTP-wachtwoord",
      );
    }

    await smtpCommand(socket, reader, `MAIL FROM:<${config.fromEmail}>`, 250, "MAIL FROM");
    for (const recipient of recipients) {
      await smtpCommand(socket, reader, `RCPT TO:<${recipient}>`, [250, 251], "RCPT TO");
    }

    await smtpCommand(socket, reader, "DATA", 354, "DATA");
    socket.write(`${dotStuff(buildMessage(config, options, recipients))}\r\n.\r\n`);
    const accepted = await reader.read();
    ensureCode(accepted, 250, "DATA body");

    try {
      await smtpCommand(socket, reader, "QUIT", 221, "QUIT");
    } catch {
      // The mail was already accepted after DATA; QUIT failures are not actionable.
    }

    return accepted.text;
  } finally {
    reader.dispose();
    socket.end();
  }
}
