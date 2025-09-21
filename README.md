<h1 align="center">WPronote</h1>
<p align="center">
  <i>Alertes pour cours annulés sur Pronote</i>
  <br/><br/>
  <img width="130" alt="Logo" src="/assets/logo-rounded.png"/>
  <br/><br/>
  <b><a href="#a-propos">À propos</a></b> | 
  <b><a href="#installation">Installation</a></b> | 
  <b><a href="#roadmap">Roadmap</a></b>
  <br/><br/>
  <a href="https://nodejs.org/"><img alt="Node.js" src="https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white"></a>
  <img alt="ESM" src="https://img.shields.io/badge/ESM-Module-4FC08D?style=flat">
  <br/><br/>
  <img src="/assets/screenshot.png" alt="WPronote" width="90%"/>
</p>

---

<h2 id="a-propos">🎯 À propos</h2>

WPronote est une application Node.js qui se connecte automatiquement à votre compte Pronote et vous prévient sur votre téléphone avec des **notifications push** (grâce à [Pushover](https://pushover.net/)) lorsqu’un changement est détecté dans votre emploi du temps.

Toutes les 5 minutes, le programme vérifie votre emploi du temps et vous envoie une notification dès qu’un de ces changements est détecté :

- ❌ **Cours annulés** (prof absent, sortie pédagogique...)
- ✅ **Cours rétablis** (un cours annulé qui est finalement maintenu)
- 🔄 **Modifications** (changement de salle, de professeur...)

<h2 id="installation">🛠️ Installation</h2>

### 1. Prérequis

- [Node.js](https://nodejs.org/fr/download) 18 ou plus récent
- Un compte [Pushover](https://pushover.net/) avec une [licence active](https://pushover.net/licensing) _(30 jours gratuits, puis une license à vie de 4,99$)_

### 2. Téléchargement - Installation des dépendances

```bash
git clone https://github.com/Lamnxzp/WPronote.git
cd WPronote
npm install
```

### 3. Configuration

Créez un fichier `.env` à la racine du projet :

```env
# Clés API Pushover
PUSHOVER_TOKEN=votre_token_application
PUSHOVER_USER=votre_cle_utilisateur
```

Pour récupérer vos clés API Pushover, suivez les instructions dans le fichier [docs/pushover.md](docs/pushover.md).

### 4. Lancement

```bash
node src/main.js
```

Lors du premier démarrage, vous devrez vous authentifier avec un QR Code Pronote, ce qui créera un fichier `pronote_session.json` dans le dossier `cache`.  
Une fois ce fichier présent, vous pouvez relancer le programme et la connexion se fera automatiquement.

## ⛶ Authentification avec QR Code

1. **Génération du QR Code dans Pronote**
   - Connectez-vous à Pronote depuis un ordinateur.
   - Cliquez sur le bouton avec un icône de QR Code situé à côté de votre nom dans le bandeau supérieur.
   - Dans la fenêtre qui s’ouvre, saisissez un code éphémère à 4 chiffres de votre choix (PIN). Un QR Code sera alors généré.

2. **Authentification**
   - Entrez le code PIN choisi dans le programme.
   - Il vous sera ensuite demandé de fournir les données du QR Code.
     - Pour les récupérer, faites une capture d’écran du QR Code.
     - Rendez-vous sur [ce site](https://scanbot.io/qr-code-scanner-online/) et cliquez sur **Scan from image**.
     - Importez votre capture, puis cliquez sur **Copy text** et collez le contenu directement dans votre terminal.

> [!TIP]
> Une fois l'authentification réussie, le fichier `pronote_session.json` créé dans le dossier `cache` peut être transféré sur un autre système (VPS, serveur...) pour éviter de refaire l'authentification. Le programme se connectera automatiquement sans nouvelle saisie.

> [!NOTE]
> L'authentification via un ENT ou avec ses identifiants Pronote n'est pas supportée. Seule l'authentification par QR Code est disponible.

<h2 id="roadmap">🚀 Roadmap</h2>

- [x] **Cours**
  - [x] Cours annulés (prof absent, sortie pédagogique...)
  - [x] Cours rétablis (un cours annulé qui est finalement maintenu)
  - [x] Cours modifiés (changement de professeur, de salle...)
- [ ] **Notifications**
  - [x] Support API Pushover
  - [ ] Support API Ntfy
  - [ ] Support API Discord
  - [ ] Support API Telegram

<h2 id="securite-et-confidentialite">🔒 Sécurité et confidentialité</h2>

- Les données d’authentification sont stockées **localement** sur votre machine
- Pour l’envoi des notifications, seules des informations liées aux cours (matière, heure, salle, professeur, etc.) sont transmises à Pushover
- La connexion s’effectue uniquement via les **serveurs officiels de Pronote**, de manière sécurisée

<h2>Remarques</h2>

Ce projet est un développement **indépendant** et n'est en aucun cas affilié, approuvé ou soutenu par la société Index Éducation.

Pronote est un logiciel et une marque déposée appartenant à Index Éducation.  
L'utilisation de ce nom dans ce projet est uniquement à titre de référence. Ce projet n'est pas officiel et l'usage du nom "Pronote" ou de toute inspiration visuelle ne constitue pas un partenariat ou une affiliation officielle.

Ce projet est fourni "en l'état" sans garantie.

<h2 id="credits">Crédits</h2>

- [LiterateInk/Pawnote.js](https://github.com/LiterateInk/Pawnote.js)
