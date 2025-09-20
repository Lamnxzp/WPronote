import * as pronote from "pawnote";
import { v4 as uuid } from "uuid";
import { fileExists, dirExists, translateToWeekNumber } from "../utils.js";
import { sendPushoverMessage } from "../utils/pushover.js";
import { logger } from "../utils/logger.js";
import { input } from "@inquirer/prompts";
import config from "../../config.js";
import fs from "fs/promises";

const CANCELLED_STATUSES = [
  "Cours annulé",
  "Prof. absent",
  "Classe absente",
  "Prof./pers. absent",
  "Sortie pédagogique",
];

async function writeCache(cache, newCache) {
  cache =
    cache && typeof cache === "object" ? { ...cache, ...newCache } : newCache;
  await fs.writeFile(
    "./cache/pronote_data.json",
    JSON.stringify(cache, null, 2),
    "utf8"
  );
}

const isCancelled = (status) => {
  return CANCELLED_STATUSES.includes(status);
};

const buildLessonKey = (lesson) => {
  return `${new Date(lesson.startDate).toISOString()}|${new Date(
    lesson.endDate
  ).toISOString()}|${lesson.subject?.name ?? lesson.title ?? "???"}`;
};

class PronoteLogging {
  static logCourseChange(type, courseName, time, details = {}) {
    const typeConfigs = {
      cancelled: { color: "red", prefix: "❌" },
      restored: { color: "green", prefix: "✅" },
      modified: { color: "blue", prefix: "🔄" },
    };

    const config = typeConfigs[type] || { color: "white", prefix: "📚" };
    const allDetails = [`📅 ${time}`];

    if (details.reason) {
      allDetails.push(`💬 ${details.reason}`);
    }
    if (details.changes && details.changes.length > 0) {
      details.changes.forEach((change) => {
        allDetails.push(`• ${change}`);
      });
    }

    logger.custom({
      label: "COURS",
      color: config.color,
      prefix: config.prefix,
      message: courseName,
      details: allDetails,
    });
  }
  static logCheckStart(weeks) {
    logger.raw(
      `\n🔄 Vérification des emplois du temps (semaines ${weeks.join(", ")})...`,
      "cyan"
    );
  }
  static logCheckEnd(changesCount) {
    if (changesCount > 0) {
      logger.raw(
        `\n✨ Vérification terminée - ${changesCount} changement(s) détecté(s)\n`,
        "green"
      );
    } else {
      logger.raw(`\n💤 Aucun changement détecté\n`, "dim");
    }
  }
}

export class Pronote {
  constructor(headless = true) {
    this._session = null;
    this._cache = null;
    this._headless = headless;
  }

  async init() {
    if (!(await dirExists("./cache"))) {
      await fs.mkdir("./cache", { recursive: true });
      logger.info("Dossier cache créé");
    }

    if (await fileExists("./cache/pronote_data.json")) {
      const fileContent = await fs.readFile(
        "./cache/pronote_data.json",
        "utf8"
      );
      this._cache = JSON.parse(fileContent);
      logger.debug("Cache Pronote chargé");
    } else {
      this._cache = {
        lastUpdate: null,
        timetable: {
          weeks: {},
        },
      };
      await writeCache(null, this._cache);
      logger.info("Nouveau cache Pronote initialisé");
    }

    if (!this._cache.timetable) {
      this._cache.timetable = { weeks: {} };
    }
    if (!this._cache.timetable.weeks) {
      this._cache.timetable.weeks = {};
    }
  }

  async login() {
    let sessionData = await this._loadSessionData();

    if (!sessionData?.token) {
      if (!this._headless) {
        logger.warning("Aucun token trouvé, authentification nécessaire");
        sessionData = await this._authenticateWithQRCode();
      } else {
        throw new Error("Aucun token trouvé et mode headless activé");
      }
    }

    await this._establishSession(sessionData);

    logger.success("Connexion Pronote réussie");
    logger.info(
      `Informations utilisateur:`,
      `Classe: ${this._session.user.resources[0].className}\nÉtablissement: ${this._session.user.resources[0].establishmentName}`
    );
  }

  async _loadSessionData() {
    if (!(await fileExists("./cache/pronote_session.json"))) {
      return null;
    }

    try {
      return JSON.parse(
        await fs.readFile("./cache/pronote_session.json", "utf8")
      );
    } catch {
      logger.warning("Impossible de parser 'pronote_session.json'");
      return null;
    }
  }

  async _authenticateWithQRCode() {
    logger.info(
      "Authentification via QR Code. Veuillez en générer un sur Pronote."
    );

    while (true) {
      try {
        const pin = await input({
          message: "Code PIN du QR Code :",
          validate: (value) => {
            if (/^\d{4}$/.test(value)) {
              return true;
            }
            return "Le code PIN doit être un nombre à 4 chiffres.";
          },
        });
        const qrData = await input({
          message: "Données du QR Code (JSON) :",
          validate: (value) => {
            try {
              const parsed = JSON.parse(value);
              if (!parsed.url || !parsed.jeton || !parsed.login) {
                return "Le QR Code doit contenir les champs 'url', 'jeton' et 'login'.";
              }

              return true;
            } catch {
              return "Le QR Code doit être une chaîne JSON valide.";
            }
          },
        });

        const qrDataJson = JSON.parse(qrData);

        const handle = pronote.createSessionHandle();
        const deviceUUID = uuid();

        const refresh = await pronote.loginQrCode(handle, {
          deviceUUID: deviceUUID,
          pin: pin,
          qr: qrDataJson,
        });

        const sessionData = {
          ...refresh,
          deviceUUID,
        };

        await fs.writeFile(
          "./cache/pronote_session.json",
          JSON.stringify(sessionData, null, 2),
          "utf8"
        );

        logger.success("Authentification QR Code réussie");
        return sessionData;
      } catch (error) {
        // Catch CTRL + C
        if (error.name === "ExitPromptError") {
          logger.info("Fermé par l'utilisateur.");
          process.exit(0);
        }
        logger.error(
          "L'authentification a échoué. Le QR Code ou le PIN est peut-être invalide.",
          `Détail de l'erreur: ${error.message}`
        );
        logger.info("Veuillez réessayer.");
      }
    }
  }

  async _establishSession(sessionData) {
    this._session = pronote.createSessionHandle();
    const refresh = await pronote.loginToken(this._session, {
      kind: sessionData.kind,
      url: sessionData.url,
      username: sessionData.username,
      token: sessionData.token,
      deviceUUID: sessionData.deviceUUID,
    });

    sessionData.token = refresh.token;
    await fs.writeFile(
      "./cache/pronote_session.json",
      JSON.stringify(sessionData, null, 2),
      "utf8"
    );
  }

  _compareWeekClasses(newClasses, previousClasses) {
    const messagesToSend = [];
    const prevLessonMap = new Map(
      previousClasses
        .filter((l) => l.startDate && l.endDate)
        .map((l) => [buildLessonKey(l), l])
    );

    newClasses
      .filter((lesson) => lesson.startDate && lesson.endDate)
      .forEach((lesson) => {
        const key = buildLessonKey(lesson);
        const oldLesson = prevLessonMap.get(key);

        if (!oldLesson) return;

        // TODO: check => is: 'activity'

        const statusChanged = oldLesson.status !== lesson.status;
        const teacherChanged =
          oldLesson.teacherNames?.[0] !== lesson.teacherNames?.[0];
        const roomChanged =
          oldLesson.classrooms?.[0] !== lesson.classrooms?.[0];

        if (!statusChanged && !teacherChanged && !roomChanged) return;

        const lessonName =
          lesson.subject?.name ?? lesson.title ?? "Cours inconnu";
        const lessonTime = `${lesson.startDate.toLocaleDateString("fr-FR", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })} de ${lesson.startDate.getHours().toString().padStart(2, "0")}:${lesson.startDate
          .getMinutes()
          .toString()
          .padStart(
            2,
            "0"
          )} à ${lesson.endDate.getHours().toString().padStart(2, "0")}:${lesson.endDate
          .getMinutes()
          .toString()
          .padStart(2, "0")}`;

        const oldStatus = oldLesson.status;
        const newStatus = lesson.status;
        const oldCancelled = oldStatus && isCancelled(oldStatus);
        const newCancelled = newStatus && isCancelled(newStatus);

        if (!oldCancelled && newCancelled) {
          PronoteLogging.logCourseChange("cancelled", lessonName, lessonTime, {
            reason: newStatus,
            teacher: lesson.teacherNames[0] ?? "Non spécifié",
            room: lesson.classrooms[0] ?? "Non spécifiée",
          });

          const message = `<b>Cours annulé !</b> ❌
- <b>📚 Matière :</b> ${lessonName}
- <b>🗓️ Date :</b> ${lessonTime}
- <b>🧑‍🏫 Professeur :</b> ${lesson.teacherNames[0] ?? "Non spécifié"}
- <b>📍 Salle :</b> ${lesson.classrooms[0] ?? "Non spécifiée"}
- <b>ℹ️ Motif :</b> ${newStatus}`;
          messagesToSend.push({ type: "cancelled", message: message.trim() });
        } else {
          const changes = [];
          const logChanges = [];

          if (statusChanged) {
            if (oldCancelled && !newCancelled) {
              changes.push(
                `- ✅ <b>Statut :</b> Le cours est maintenant <b>maintenu</b> (était annulé : <code>${oldStatus}</code>)`
              );
              logChanges.push(`Cours rétabli (était: ${oldStatus})`);
            } else {
              changes.push(
                `- ℹ️ <b>Statut :</b> \`${oldStatus || "Maintenu"}\` → \`${newStatus || "Maintenu"}\``
              );
              logChanges.push(
                `Statut: ${oldStatus || "Maintenu"} → ${newStatus || "Maintenu"}`
              );
            }
          }
          if (teacherChanged) {
            changes.push(
              `- 🧑‍🏫 <b>Professeur :</b> \`${oldLesson.teacherNames[0] || "N/A"}\` → \`${lesson.teacherNames[0] || "N/A"}\``
            );
            logChanges.push(
              `Prof: ${oldLesson.teacherNames[0] || "N/A"} → ${lesson.teacherNames[0] || "N/A"}`
            );
          }
          if (roomChanged) {
            changes.push(
              `- 📍 <b>Salle :</b> \`${oldLesson.classrooms[0] || "N/A"}\` → \`${lesson.classrooms[0] || "N/A"}\``
            );
            logChanges.push(
              `Salle: ${oldLesson.classrooms[0] || "N/A"} → ${lesson.classrooms[0] || "N/A"}`
            );
          }

          if (changes.length > 0) {
            const changeType =
              oldCancelled && !newCancelled ? "restored" : "modified";
            PronoteLogging.logCourseChange(changeType, lessonName, lessonTime, {
              changes: logChanges,
            });

            const header =
              oldCancelled && !newCancelled
                ? "<b>Cours rétabli !</b> ✅"
                : "<b>Modification du cours !</b> 🔄";
            const message = `${header}
- <b>📚 Matière :</b> ${lessonName}
- <b>🗓️ Date :</b> ${lessonTime}

<b>Détails des changements :</b>
${changes.join("\n")}`;
            messagesToSend.push({ type: changeType, message: message.trim() });
          }
        }
      });

    return messagesToSend;
  }

  async checkTimetableChanges() {
    const currentWeekNumber = translateToWeekNumber(
      new Date(),
      this._session.instance.firstMonday
    );
    const weeksToCheck = [
      currentWeekNumber,
      currentWeekNumber + 1,
      currentWeekNumber + 2,
    ];

    PronoteLogging.logCheckStart(weeksToCheck);

    const allMessagesToSend = [];

    for (const weekNumber of weeksToCheck) {
      logger.debug(`Récupération semaine ${weekNumber}...`);

      const timetable = await pronote.timetableFromWeek(
        this._session,
        weekNumber
      );
      pronote.parseTimetable(this._session, timetable, {
        withSuperposedCanceledClasses: false,
        withCanceledClasses: true,
        withPlannedClasses: true,
      });

      const newClasses = timetable.classes;
      const previousWeekData = this._cache.timetable.weeks[weekNumber];

      if (!previousWeekData) {
        logger.info(
          `Première vérification pour la semaine ${weekNumber}`,
          "Aucune alerte ne sera envoyée"
        );
      } else {
        const messagesForThisWeek = this._compareWeekClasses(
          newClasses,
          previousWeekData.classes
        );
        allMessagesToSend.push(...messagesForThisWeek);
      }

      this._cache.timetable.weeks[weekNumber] = {
        weekNumber: weekNumber,
        lastFetch: new Date().toISOString(),
        classes: newClasses,
      };
    }

    if (allMessagesToSend.length > 0) {
      let sentCount = 0;
      for (const { type, message } of allMessagesToSend) {
        if (config.alerts[type]) {
          await sendPushoverMessage(message);
          sentCount++;
        }
      }
      if (sentCount > 0) {
        logger.success(`${sentCount} notification(s) envoyée(s)`);
      }
    }

    const cachedWeekKeys = Object.keys(this._cache.timetable.weeks).map(Number);
    const weeksToClean = cachedWeekKeys.filter(
      (weekKey) => weekKey < currentWeekNumber
    );

    if (weeksToClean.length > 0) {
      logger.debug(
        `Nettoyage de ${weeksToClean.length} semaine(s) obsolète(s)`
      );
      for (const weekKey of weeksToClean) {
        delete this._cache.timetable.weeks[weekKey];
      }
    }

    PronoteLogging.logCheckEnd(allMessagesToSend.length);

    await writeCache(this._cache, {
      lastUpdate: new Date().toISOString(),
      timetable: this._cache.timetable,
    });
  }
}
