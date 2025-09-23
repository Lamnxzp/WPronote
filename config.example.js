// =============================
// Configuration de l'application
// =============================
export const appConfig = {
  // Intervalle entre les vérifications (en millisecondes)
  // Ici 5 minutes : 5 * 60 * 1000 ms
  checkInterval: 5 * 60 * 1000,
  // Activer/désactiver les alertes de statut
  enableStatusAlert: true,
};

// =============================
// Configuration des notifications
// =============================
export const notificationConfig = {
  // Liste des services de notification activés
  // Vous pouvez activer un ou plusieurs services : "pushover", "ntfy"
  enabledProviders: ["pushover", "ntfy"],

  // Paramètres spécifiques à chaque service
  providers: {
    // -----------------------------
    // Pushover
    // -----------------------------
    pushover: {
      credentials: {
        userKey: process.env.PUSHOVER_USER_KEY,
        apiToken: process.env.PUSHOVER_API_TOKEN,
      },
      options: {
        // Priorité du message (-2 à 2)
        priority: 0,
      },
    },

    // -----------------------------
    // NTFY
    // -----------------------------
    ntfy: {
      // URL de votre topic NTFY
      // Modifiez cette URL pour qu'elle corresponde à votre propre topic
      url: "https://ntfy.sh/your-topic-here",
      options: {
        // Priorité du message (1 à 5), voir https://docs.ntfy.sh/publish/?h=priority#message-priority
        priority: 3,
        // Titre de la notification
        title: "WPronote",
      },
    },
  },
};
