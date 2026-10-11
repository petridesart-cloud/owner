import "server-only";
import { env } from "@/lib/env";

// Twilio Programmable SMS. Swap this file to change SMS provider.
export async function sendSms(to: string, body: string): Promise<string> {
  const auth = Buffer.from(`${env.twilioSid}:${env.twilioToken}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.twilioSid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to.replace(/\s+/g, ""), From: env.twilioFrom!, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  return ((await res.json()) as { sid: string }).sid;
}
