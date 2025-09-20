import fetch from "node-fetch";
import { logger } from "./logger.js";

export async function sendPushoverMessage(message) {
  try {
    const url = "https://api.pushover.net/1/messages.json";

    const body = new URLSearchParams();
    body.append("token", process.env["PUSHOVER_TOKEN"]);
    body.append("user", process.env["PUSHOVER_USER"]);
    body.append("message", message);
    body.append("html", "1");

    const response = await fetch(url, {
      method: "POST",
      body,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `Pushover Request not successful: ${response.status} ${errorText}`
      );
      return null;
    }

    const data = await response.json();
    return data;
  } catch (err) {
    logger.error(`Pushover Request failed: ${err.message}`);
    return null;
  }
}
