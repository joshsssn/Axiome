# Axiome Professional

**Advanced Portfolio Management, Analytics & Optimization Platform**

Axiome is a professional-grade standalone application for investors. Build, analyze, optimize, and stress-test your portfolios with powerful data science tools, all running locally on your machine.

---

## 🚀 Lancement Rapide (Utilisateur)

Pour utiliser Axiome immédiatement sans rien installer d'autre :

1. Allez dans l'onglet **[Releases](https://github.com/joshsssn/Axiome-Exe/releases)**.
2. Téléchargez le fichier Axiome-Setup-v2.0.0.exe (Windows).
3. Installez et lancez l'application. 
   *Note : Les profils et portefeuilles sont stockés localement sur votre ordinateur.*

---

## 📋 Fonctionnalités

### Gestion de Portefeuilles
- Créez plusieurs profils utilisateur (style Netflix).
- Gérez plusieurs portefeuilles par profil avec benchmarks personnalisables.
- Support multi-devises (USD, EUR).

### Analyses Avancées
- **Indicateurs de Risque**: Ratios de Sharpe, Sortino, Calmar, Volatilité, Beta, Alpha.
- **Value at Risk (VaR)**: Niveaux de confiance 95% & 99% et CVaR.
- **Visualisations**: Graphiques interactifs, heatmap de rendements mensuels, analyse de drawdown.

### Optimisation & Stratégie
- **Efficient Frontier**: Modèles d'optimisation de Markowitz.
- **Backtesting**: Validez vos stratégies sur des données historiques réelles.
- **Stress Test**: Simulez des scénarios de crise (Crise 2008, COVID 2020, Choc de taux).

---

## 🛠 Architecture Technique (Développeur)

L'application a été migrée d'une architecture Cloud (FastAPI/Postgres/Docker/Redis) vers une architecture **Desktop autonome** :

- **Frontend**: React 19 + Vite + Tailwind CSS.
- **Desktop Wrapper**: [Tauri](https://tauri.app/) (Rust).
- **Backend (Sidecar)**: FastAPI encapsulé avec **PyInstaller**.
- **Base de données**: SQLite local (auto-géré).
- **Data Science**: Pandas, NumPy, Scikit-learn, PyPortfolioOpt, yfinance.

### Compilation Locale

Si vous souhaitez build le projet vous-même :

1. **Backend** :
   `powershell
   cd API
   python -m venv venv310
   .\venv310\Scripts\activate
   pip install -r requirements.txt
   `
2. **Build Sidecar** :
   `powershell
   .\scripts\build-sidecar.ps1
   `
3. **Build Frontend & App** :
   `powershell
   cd UI
   npm install
   npm run tauri:build
   `

---

## 📄 License
Ce projet est sous licence MIT.
