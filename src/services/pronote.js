import * as pronote from "@blockshub/pawnote-lts";
import { v4 as uuid } from "uuid";
import { fileExists, dirExists, translateToWeekNumber } from "../utils.js";
import { sendCourseAlerts } from "../utils/alerts.js";
import { logger } from "../utils/logger.js";
import { input } from "@inquirer/prompts";
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
    this._sessionData = null;
    this._loginPromise = null;
    this._presenceTimer = null;
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
    if (this._session) return;
    if (!this._loginPromise) {
      this._loginPromise = this._login().finally(() => {
        this._loginPromise = null;
      });
    }
    await this._loginPromise;
  }

  async _login() {
    const sessionData = this._sessionData ?? (await this._loadSessionData());

    if (!sessionData?.token) {
      if (!this._headless) {
        logger.warning("Aucun token trouvé, authentification nécessaire");
        await this._authenticateWithQRCode();
      } else {
        throw new Error("Aucun token trouvé et mode headless activé");
      }
    } else {
      await this._establishSession(sessionData);
    }

    this._schedulePresence(this._session);

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

        this._sessionData = sessionData;
        this._session = handle;

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
    const session = pronote.createSessionHandle();
    const refresh = await pronote.loginToken(session, sessionData);

    // Keep the rotated credentials even if writing the cache fails.
    this._sessionData = { ...sessionData, ...refresh };
    this._session = session;
    try {
      await fs.writeFile(
        "./cache/pronote_session.json",
        JSON.stringify(this._sessionData, null, 2),
        "utf8"
      );
    } catch (error) {
      logger.warning(
        "Token non sauvegardé : la session reste active, mais un nouveau QR Code pourra être nécessaire au redémarrage.",
        error.message
      );
    }
  }

  _invalidateSession(session) {
    if (this._session !== session) return;
    clearTimeout(this._presenceTimer);
    this._presenceTimer = null;
    this._session = null;
  }

  _schedulePresence(session) {
    clearTimeout(this._presenceTimer);
    // The library's startPresenceInterval ignores rejected promises. Schedule
    // the next ping only after this one finishes, so slow requests cannot pile up.
    this._presenceTimer = setTimeout(async () => {
      if (this._session !== session) return;
      try {
        await pronote.presence(session);
      } catch (error) {
        if (this._session === session) {
          this._invalidateSession(session);
          logger.warning(
            "Session Pronote interrompue, reconnexion à la prochaine vérification.",
            error.message
          );
        }
        return;
      }
      if (this._session === session) this._schedulePresence(session);
    }, 120_000);
    this._presenceTimer.unref();
  }

  _requireSession() {
    if (!this._session) {
      throw new Error(
        "Session Pronote absente : appelez login() avant la vérification."
      );
    }
    return this._session;
  }

  async _getTimetable(weekNumber, retry = true) {
    const session = this._requireSession();
    let timetable;
    try {
      timetable = await pronote.timetableFromWeek(session, weekNumber);
    } catch (error) {
      // A failed request can also desynchronise the library's request counter.
      // Discard that handle; only expiration warrants an immediate retry.
      this._invalidateSession(session);
      if (retry && error instanceof pronote.SessionExpiredError) {
        logger.warning("Session Pronote expirée, reconnexion...");
        await this.login();
        return this._getTimetable(weekNumber, false);
      }
      throw error;
    }
    pronote.parseTimetable(session, timetable, {
      withSuperposedCanceledClasses: false,
      withCanceledClasses: true,
      withPlannedClasses: true,
    });
    return timetable;
  }

  _getImpact(newClasses, cancelledLesson) {
    const coursesForDay = newClasses.filter(
      (c) =>
        c.startDate?.toDateString() === cancelledLesson.startDate.toDateString()
    );

    const hasBefore = coursesForDay.some(
      (c) => c.startDate < cancelledLesson.startDate && !isCancelled(c.status)
    );
    const hasAfter = coursesForDay.some(
      (c) => c.startDate > cancelledLesson.startDate && !isCancelled(c.status)
    );

    if (!hasBefore && !hasAfter) {
      return {
        type: "whole-day",
      };
    } else if (!hasBefore) {
      // Find the next course after the cancelled lesson
      const nextCourse = coursesForDay
        .filter(
          (c) =>
            c.startDate > cancelledLesson.startDate && !isCancelled(c.status)
        )
        .sort((a, b) => a.startDate - b.startDate)[0];
      return {
        type: "late-start",
        startTime: `${nextCourse.startDate.getHours().toString().padStart(2, "0")}h${nextCourse.startDate
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
        oldStartTime: `${cancelledLesson.startDate.getHours().toString().padStart(2, "0")}h${cancelledLesson.startDate
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
      };
    } else if (!hasAfter) {
      // Find the previous course before the cancelled lesson
      const prevCourse = coursesForDay
        .filter(
          (c) =>
            c.startDate < cancelledLesson.startDate && !isCancelled(c.status)
        )
        .sort((a, b) => b.startDate - a.startDate)[0];
      return {
        type: "early-finish",
        endTime: `${prevCourse.endDate.getHours().toString().padStart(2, "0")}h${prevCourse.endDate
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
        oldEndTime: `${cancelledLesson.endDate.getHours().toString().padStart(2, "0")}h${cancelledLesson.endDate
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
      };
    } else {
      return {
        type: "mid-day-cancel",
        startTime: `${cancelledLesson.startDate.getHours().toString().padStart(2, "0")}h${cancelledLesson.startDate
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
        endTime: `${cancelledLesson.endDate.getHours().toString().padStart(2, "0")}h${cancelledLesson.endDate
          .getMinutes()
          .toString()
          .padStart(2, "0")}`,
      };
    }
  }

  _compareWeekClasses(newClasses, previousClasses) {
    const alertsToSend = [];
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

          const alertData = {
            type: "cancelled",
            title: "Cours annulé !",
            icon: "❌",
            course: {
              name: lessonName,
              time: lessonTime,
              teacher: lesson.teacherNames[0] ?? "Non spécifié",
              room: lesson.classrooms[0] ?? "Non spécifiée",
            },
            reason: newStatus,
            impact: this._getImpact(newClasses, lesson),
          };
          alertsToSend.push(alertData);
        } else {
          const changes = [];
          const logChanges = [];

          if (statusChanged) {
            changes.push({
              field: "Statut",
              oldValue: oldStatus || "Maintenu",
              newValue: newStatus || "Maintenu",
              isRestored: oldCancelled && !newCancelled,
              icon: oldCancelled && !newCancelled ? "✅" : "ℹ️",
            });

            if (oldCancelled && !newCancelled) {
              logChanges.push(`Cours rétabli (était: ${oldStatus})`);
            } else {
              logChanges.push(
                `Statut: ${oldStatus || "Maintenu"} → ${newStatus || "Maintenu"}`
              );
            }
          }
          if (teacherChanged) {
            changes.push({
              field: "Professeur",
              oldValue: oldLesson.teacherNames[0] || "N/A",
              newValue: lesson.teacherNames[0] || "N/A",
              icon: "🧑‍🏫",
            });
            logChanges.push(
              `Prof: ${oldLesson.teacherNames[0] || "N/A"} → ${lesson.teacherNames[0] || "N/A"}`
            );
          }
          if (roomChanged) {
            changes.push({
              field: "Salle",
              oldValue: oldLesson.classrooms[0] || "N/A",
              newValue: lesson.classrooms[0] || "N/A",
              icon: "📍",
            });
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

            const alertData = {
              type: changeType,
              title:
                changeType === "restored"
                  ? "Cours rétabli !"
                  : "Modification du cours !",
              icon: changeType === "restored" ? "✅" : "🔄",
              course: {
                name: lessonName,
                time: lessonTime,
              },
              changes,
            };
            alertsToSend.push(alertData);
          }
        }
      });

    return alertsToSend;
  }

  async checkTimetableChanges() {
    const session = this._requireSession();
    const currentWeekNumber = translateToWeekNumber(
      new Date(),
      session.instance.firstMonday
    );
    const weeksToCheck = [
      currentWeekNumber,
      currentWeekNumber + 1,
      currentWeekNumber + 2,
    ];

    PronoteLogging.logCheckStart(weeksToCheck);

    const allAlertsToSend = [];
    const updatedWeeks = { ...this._cache.timetable.weeks };

    for (const weekNumber of weeksToCheck) {
      logger.debug(`Récupération semaine ${weekNumber}...`);

      const timetable = await this._getTimetable(weekNumber);

      const newClasses = timetable.classes;
      const previousWeekData = this._cache.timetable.weeks[weekNumber];

      if (!previousWeekData) {
        logger.info(
          `Première vérification pour la semaine ${weekNumber}`,
          "Aucune alerte ne sera envoyée"
        );
      } else {
        const alertsForThisWeek = this._compareWeekClasses(
          newClasses,
          previousWeekData.classes
        );
        allAlertsToSend.push(...alertsForThisWeek);
      }

      updatedWeeks[weekNumber] = {
        weekNumber: weekNumber,
        lastFetch: new Date().toISOString(),
        classes: newClasses,
      };
    }

    // Keep the previous snapshot if any week fails, so its pending alerts are
    // still detected on the next successful check.
    this._cache.timetable.weeks = updatedWeeks;

    if (allAlertsToSend.length > 0) {
      const sentCount = await sendCourseAlerts(allAlertsToSend);
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

    PronoteLogging.logCheckEnd(allAlertsToSend.length);

    await writeCache(this._cache, {
      lastUpdate: new Date().toISOString(),
      timetable: this._cache.timetable,
    });
  }
}
