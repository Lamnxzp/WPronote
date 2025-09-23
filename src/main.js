import "dotenv/config";
import { Pronote } from "./services/pronote.js";
import { sendStatusAlert } from "./utils/alerts.js";
import { logger } from "./utils/logger.js";
import { appConfig } from "../config.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const instance = new Pronote(false);
await instance.init();

let isFailing = false;

while (true) {
  try {
    // TODO: Use a way to not relogin every time by keeping the session alive
    await instance.login();
    await instance.checkTimetableChanges();

    if (isFailing) {
      logger.success("Connecté de nouveau avec succès après une erreur.");

      sendStatusAlert(
        "[STATUS] Connecté de nouveau avec succès après une erreur."
      );
      isFailing = false;
    }
  } catch (error) {
    logger.error(
      "Une erreur est survenue lors de la vérification",
      error.message
    );
    if (!isFailing) {
      isFailing = true;
      sendStatusAlert(
        `[STATUS] Une erreur est survenue lors de la vérification: ${error.message}`
      );
    }
  }

  logger.info("En attente de la prochaine vérification...");
  await sleep(appConfig.checkInterval);
}
