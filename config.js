export default {
  alerts: {
    // Activer/desactiver les alertes (notifications push avec Pushover) pour chaque type de changement
    cancelled: true, // Cours annulés (prof absent, sortie pédagogique...)
    restored: true, // Cours rétablis (un cours annulé qui est finalement maintenu)
    modified: true, // Cours modifiés (changement de professeur, de salle...)
  },
  checkInterval: 5 * 60 * 1000, // Vérification de l'emploi du temps toutes les 5 minutes
};
