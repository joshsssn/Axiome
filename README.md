# Axiome Professional

**Advanced Portfolio Management, Analytics & Optimization Platform**

Axiome is a professional-grade standalone application for investors. Build, analyze, optimize, and stress-test your portfolios with powerful data science tools, all running locally on your machine.

---

## 🚀 Quick Start (User)

To use Axiome immediately without installing additional dependencies:

1. Go to the **[Releases](https://github.com/joshsssn/Axiome-Exe/releases)** tab.
2. Download the `Axiome_2.0.0_x64-setup.exe` file (Windows).
3. Install and launch the application.  
   *Note: Profiles and portfolios are stored locally on your computer.*

---

## 📋 Features

### Portfolio Management
- Create multiple user profiles (Netflix-style).
- Manage multiple portfolios per profile with customizable benchmarks.
- Multi-currency support (USD, EUR).

### Advanced Analytics
- **Risk Indicators**: Sharpe, Sortino, Calmar ratios, Volatility, Beta, Alpha.
- **Value at Risk (VaR)**: 95% & 99% confidence levels and CVaR.
- **Visualizations**: Interactive charts, monthly return heatmaps, drawdown analysis.

### Optimization & Strategy
- **Efficient Frontier**: Markowitz optimization models.
- **Backtesting**: Validate strategies using real historical data.
- **Stress Testing**: Simulate crisis scenarios (2008 Crisis, COVID-2020, Rate Shocks).

---

## 🛠 Technical Architecture (Developer)

The application has been migrated from a Cloud architecture (FastAPI/Postgres/Docker/Redis) to a **standalone desktop architecture**:

- **Frontend**: React 19 + Vite + Tailwind CSS.
- **Desktop Wrapper**: [Tauri](https://tauri.app/) (Rust).
- **Backend (Sidecar)**: FastAPI encapsulated with **PyInstaller**.
- **Database**: Local SQLite (self-managed).
- **Data Science**: Pandas, NumPy, Scikit-learn, PyPortfolioOpt, yfinance.

### Local Build

If you want to build the project yourself:

1. **Backend**:
   ```powershell
   cd API
   python -m venv venv310
   .\venv310\Scripts\activate
   pip install -r requirements.txt
   ```
2. **Build Sidecar**:
   ```powershell
   .\scripts\build-sidecar.ps1
   ```
3. **Build Frontend & App**:
   ```powershell
   cd UI
   npm install
   npm run tauri:build
   ```

---

## 📄 License

This project is licensed under the Apache-2.0 license.
