# Récupérer les clés API Pushover

1. Connectez-vous à votre compte [Pushover](https://pushover.net/).
2. Trouvez votre **clé utilisateur (User Key)** sur la page d'accueil.
   <img src="/assets/pushover/screenshot1.png" alt="User Key"/>
3. Pour obtenir votre **clé d'application (API Token)**, créez une nouvelle application : descendez en bas de la page et cliquez sur "Create an Application/API Token".
   <img src="/assets/pushover/screenshot2.png" alt="Create an Application"/>
4. Configurez votre application comme vous le souhaitez puis cliquez sur "Create Application".
5. Vous serez ensuite redirigé vers la page de votre application. Sur cette page, vous trouverez votre **clé d'application (API Token)**.
   <img src="/assets/pushover/screenshot3.png" alt="API Key"/>
6. Ajoutez ensuite votre clé utilisateur `PUSHOVER_USER` et votre clé d'application `PUSHOVER_TOKEN` dans votre fichier `.env`.
