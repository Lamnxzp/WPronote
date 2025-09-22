import fetch from "node-fetch";
import { logger } from "./logger.js";
import { notificationConfig, appConfig } from "../../config.js";

/**
 * Builds an HTML-formatted message for Pushover.
 * @param {object} alertData - The structured data for the alert.
 * @returns {string} The formatted HTML message string.
 */
function buildPushoverMessage(alertData) {
  const bold = (text) => `<b>${text}</b>`;
  const code = (text) => `<code>${text}</code>`;
  const messageLines = [];

  messageLines.push(`${bold(alertData.title)} ${alertData.icon}`);
  messageLines.push(`- ${bold("📚 Matière :")} ${alertData.course.name}`);
  messageLines.push(`- ${bold("🗓️ Date :")} ${alertData.course.time}`);
  if (alertData.course.teacher) {
    messageLines.push(
      `- ${bold("🧑‍🏫 Professeur :")} ${alertData.course.teacher}`
    );
  }
  if (alertData.course.room) {
    messageLines.push(`- ${bold("📍 Salle :")} ${alertData.course.room}`);
  }

  if (alertData.type === "cancelled" && alertData.reason) {
    messageLines.push(`- ${bold("ℹ️ Motif :")} ${alertData.reason}`);
  }

  if (
    (alertData.type === "modified" || alertData.type === "restored") &&
    alertData.changes?.length > 0
  ) {
    messageLines.push("");
    messageLines.push(bold("Détails des changements :"));
    for (const change of alertData.changes) {
      if (change.isRestored) {
        messageLines.push(
          `- ✅ ${bold(`${change.field} :`)} Le cours est maintenant ${bold("maintenu")} (était annulé : ${code(change.oldValue)})`
        );
      } else {
        messageLines.push(
          `- ${change.icon} ${bold(`${change.field} :`)} ${code(change.oldValue)} → ${code(change.newValue)}`
        );
      }
    }
  }

  return messageLines.join("\n");
}

/**
 * Builds a plain text-formatted message for ntfy.
 * @param {object} alertData - The structured data for the alert.
 * @returns {string} The formatted plain text message string.
 */
function buildNtfyMessage(alertData) {
  // Markdown is only supported in the web app, see https://docs.ntfy.sh/publish/#markdown-formatting
  const messageLines = [];

  messageLines.push(`${alertData.title} ${alertData.icon}`);
  messageLines.push(`- 📚 Matière : ${alertData.course.name}`);
  messageLines.push(`- 🗓️ Date : ${alertData.course.time}`);
  if (alertData.course.teacher) {
    messageLines.push(`- 🧑‍🏫 Professeur : ${alertData.course.teacher}`);
  }
  if (alertData.course.room) {
    messageLines.push(`- 📍 Salle : ${alertData.course.room}`);
  }

  if (alertData.type === "cancelled" && alertData.reason) {
    messageLines.push(`- ℹ️ Motif : ${alertData.reason}`);
  }

  if (
    (alertData.type === "modified" || alertData.type === "restored") &&
    alertData.changes?.length > 0
  ) {
    messageLines.push("");
    messageLines.push("Détails des changements :");
    for (const change of alertData.changes) {
      if (change.isRestored) {
        messageLines.push(
          `- ✅ ${change.field} : Le cours est maintenant maintenu (était annulé : ${change.oldValue})`
        );
      } else {
        messageLines.push(
          `- ${change.icon} ${change.field} : ${change.oldValue} → ${change.newValue}`
        );
      }
    }
  }

  return messageLines.join("\n");
}

/**
 * Routes alert data to the correct message builder based on the provider.
 * @param {object} alertData - The structured data for the alert.
 * @param {'pushover' | 'ntfy'} provider - The notification provider.
 * @returns {string | null} The formatted message string or null if provider is unknown.
 */
function buildMessage(alertData, provider) {
  switch (provider) {
    case "pushover":
      return buildPushoverMessage(alertData);
    case "ntfy":
      return buildNtfyMessage(alertData);
    default:
      logger.warn(`Unknown provider "${provider}", cannot build message.`);
      return null;
  }
}

const sendPushoverMessage = async (message) => {
  try {
    const url = "https://api.pushover.net/1/messages.json";
    const body = new URLSearchParams();
    body.append(
      "token",
      notificationConfig.providers.pushover.credentials.apiToken
    );
    body.append(
      "user",
      notificationConfig.providers.pushover.credentials.userKey
    );
    body.append("message", message);
    body.append("html", "1");

    const response = await fetch(url, { method: "POST", body });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `Pushover Request not successful: ${response.status} ${errorText}`
      );
      return null;
    }

    return await response.json();
  } catch (err) {
    logger.error(`Pushover Request failed: ${err.message}`);
    return null;
  }
};

const sendNtfyMessage = async (message) => {
  try {
    const response = await fetch(notificationConfig.providers.ntfy.url, {
      method: "POST",
      body: message,
      headers: {
        Priority: notificationConfig.providers.ntfy.options.priority,
        Title: notificationConfig.providers.ntfy.options.title,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        `Ntfy Request not successful: ${response.status} ${errorText}`
      );
      return null;
    }

    return await response.json();
  } catch (err) {
    logger.error(`Ntfy Request failed: ${err.message}`);
    return null;
  }
};

export const sendCourseAlerts = async (allAlertData) => {
  let sentCount = 0;
  for (const alertData of allAlertData) {
    for (const provider of notificationConfig.enabledProviders) {
      const message = buildMessage(alertData, provider);

      if (!message) {
        continue; // Skip if the provider is unknown
      }

      if (provider === "pushover") {
        await sendPushoverMessage(message);
        sentCount++;
      } else if (provider === "ntfy") {
        await sendNtfyMessage(message);
        sentCount++;
      }
    }
  }
  return sentCount;
};

export const sendStatusAlert = async (message) => {
  if (!appConfig.enableStatusAlert) {
    return;
  }
  if (notificationConfig.enabledProviders.includes("pushover")) {
    await sendPushoverMessage(message);
  }
  if (notificationConfig.enabledProviders.includes("ntfy")) {
    await sendNtfyMessage(message);
  }
};
