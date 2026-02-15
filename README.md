# Axiome

**Advanced Portfolio Management, Analytics & Optimization Platform**

Axiome is a professional-grade financial portfolio management and analytics platform designed for investors, fund managers, and financial professionals. Build, analyze, optimize, and stress-test investment strategies with powerful data science tools, real-time market data, and intuitive visualizations.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Core Capabilities](#-core-capabilities)
- [API Documentation](#-api-documentation)
- [Development](#-development)
- [About](#-about)
- [License](#-license)

---

## 🚀 Features

### Portfolio Management
- Create and manage multiple portfolios with customizable benchmarks
- Real-time asset pricing and portfolio valuation
- Support for multiple asset classes and currencies (USD, EUR)
- Transaction history tracking and import capabilities

### Advanced Analytics
- **Performance Metrics**: Comprehensive Sharpe, Sortino, Calmar ratios
- **Risk Analysis**: Beta, Alpha, Value at Risk (VaR) at 95% & 99% confidence levels
- **Visual Insights**: Interactive charts, monthly returns heatmaps, drawdown analysis
- **Benchmarking**: Compare portfolio performance against market benchmarks

### Strategy Optimization
- **Efficient Frontier**: Markowitz optimization models
- **Optimization Strategies**: Min Volatility, Max Sharpe Ratio
- **Backtesting**: Validate strategies against historical data
- **Scenario Analysis**: Test strategy performance under various market conditions

### Risk Management
- **Stress Testing**: Simulate market scenarios (Crash, AI Boom, Inflation)
- **Correlation Analysis**: Understand asset relationships
- **Concentration Risk**: Monitor portfolio concentration and diversification

### Collaboration & Sharing
- Share portfolios with collaborators
- Granular permission controls (View/Edit)
- Real-time synchronization across users
- Audit trail of portfolio changes

### Data & Infrastructure
- **Market Data**: Automated real-time sync via yfinance
- **Caching**: Redis-backed performance optimization
- **Database**: PostgreSQL for reliability and scalability
- **Migrations**: Alembic for schema versioning

### Admin Panel
- User management and authentication
- Platform monitoring and health checks
- System configuration and settings

---

## 🛠 Tech Stack

### Backend
- **Framework**: FastAPI (async Python web framework)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Migrations**: Alembic for schema management
- **Caching**: Redis for performance optimization
- **Authentication**: JWT-based token security

### Data Science & Analytics
- **Data Processing**: Pandas, NumPy
- **Machine Learning**: Scikit-learn
- **Portfolio Optimization**: PyPortfolioOpt
- **Market Data**: yfinance

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Charts**: Recharts for financial visualization
- **State Management**: React Context API

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Development**: Hot module reloading, TypeScript compilation
- **Production**: Multi-stage builds, optimized images

---

## 🏁 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) (v20.10+)
- [Docker Compose](https://docs.docker.com/compose/install/) (v1.29+)
- Git

### Quick Start

#### 1. Clone the Repository

```bash
git clone https://github.com/your-username/Axiome.git
cd Axiome
```

#### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=portfolio
POSTGRES_SERVER=db
POSTGRES_PORT=5432

# API Configuration
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Redis Configuration
REDIS_URL=redis://redis:6379
```

#### 3. Start the Platform

```bash
docker-compose up --build
```

The system will:
- Initialize the PostgreSQL database with schema and migrations
- Start the Redis cache server
- Launch the FastAPI backend
- Serve the React frontend with hot reloading in development

#### 4. Access the Application

- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **API Documentation (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Alternative API Docs (ReDoc)**: [http://localhost:8000/redoc](http://localhost:8000/redoc)
- **Health Check**: [http://localhost:8000/health](http://localhost:8000/health)

#### 5. Default Credentials

```
Username: admin
Password: admin
```

> **⚠️ Important**: Change these credentials immediately after first login in a production environment.

---

## 📂 Project Structure

```
Axiome/
├── API/                          # FastAPI backend
│   ├── app/
│   │   ├── main.py              # Application entry point
│   │   ├── core/                # Configuration & security
│   │   │   ├── config.py        # Settings management
│   │   │   └── security.py      # Authentication logic
│   │   ├── api/                 # API routes
│   │   │   └── v1/
│   │   │       ├── api.py       # Route aggregation
│   │   │       └── endpoints/   # API endpoints
│   │   ├── models/              # SQLAlchemy ORM models
│   │   ├── schemas/             # Pydantic schemas
│   │   ├── services/            # Business logic
│   │   │   ├── analytics.py
│   │   │   ├── backtesting.py
│   │   │   ├── market_data.py
│   │   │   └── optimization.py
│   │   └── db/                  # Database configuration
│   ├── alembic/                 # Database migrations
│   ├── requirements.txt         # Python dependencies
│   └── Dockerfile
│
├── UI/                          # React frontend
│   ├── src/
│   │   ├── main.tsx            # Entry point
│   │   ├── App.tsx             # Root component
│   │   ├── components/         # Reusable components
│   │   │   ├── Sidebar.tsx
│   │   │   └── TopBar.tsx
│   │   ├── pages/              # Page components
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Analytics.tsx
│   │   │   ├── Portfolio.tsx
│   │   │   └── ...
│   │   ├── context/            # React Context
│   │   │   ├── AuthContext.tsx
│   │   │   └── PortfolioContext.tsx
│   │   ├── services/           # API client
│   │   │   └── api.ts
│   │   ├── utils/              # Utility functions
│   │   └── img/                # Assets & logos
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── docker-compose.yml          # Service orchestration
├── .env                        # Environment configuration
└── README.md                   # This file
```

---

## 💡 Core Capabilities

### Portfolio Management
- **Multi-Portfolio Support**: Manage unlimited portfolios simultaneously
- **Asset Diversification**: Support for stocks, ETFs, bonds, cryptocurrencies
- **Currency Support**: USD, EUR, and extensible to more currencies
- **Custom Benchmarks**: Set portfolio-specific benchmark indices

### Analytics Engine
- **Performance Attribution**: Break down returns by component
- **Risk Decomposition**: Understand portfolio risk sources
- **Rolling Metrics**: Track performance over time
- **Correlation Matrix**: Analyze asset relationships

### Optimization Toolkit
- **Efficient Frontier**: Visualize risk-return tradeoff
- **Portfolio Rebalancing**: Optimize asset allocation
- **Constraint Handling**: Define investment constraints and boundaries
- **Multi-Objective Optimization**: Balance multiple performance goals

### Backtesting
- **Historical Simulation**: Test strategies on past data
- **Performance Analysis**: Evaluate strategy effectiveness
- **Walk-Forward Testing**: Validate strategy robustness
- **Comparison**: Benchmark against buy-and-hold strategies

---

## 🔌 API Documentation

### Authentication
All endpoints require JWT authentication. Obtain a token via:

```bash
curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
```

Include the token in subsequent requests:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/portfolios
```

### Main Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/auth/login` | POST | User authentication |
| `/api/v1/portfolios` | GET/POST | List/create portfolios |
| `/api/v1/portfolios/{id}` | GET/PUT/DELETE | Portfolio details & management |
| `/api/v1/portfolios/{id}/analytics` | GET | Portfolio analytics |
| `/api/v1/portfolios/{id}/risk` | GET | Risk metrics |
| `/api/v1/market-data/sync` | POST | Sync market data |
| `/api/v1/optimization/efficient-frontier` | POST | Calculate efficient frontier |
| `/api/v1/backtesting/run` | POST | Run backtest |

Full API documentation available at [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🔨 Development

### Local Setup (Without Docker)

#### Backend
```bash
cd API
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

#### Frontend
```bash
cd UI
npm install
npm run dev
```

### Running Tests

```bash
# Backend tests
cd API
pytest

# Frontend tests
cd UI
npm run test
```

### Building for Production

```bash
# Build Docker images
docker-compose -f docker-compose.yml build

# Deploy
docker-compose -f docker-compose.yml up -d
```

---

## 👨‍💻 About

**Axiome** is built by **Josh E. SOUSSAN**, a passionate software engineer and financial technology enthusiast.

This platform combines advanced portfolio analytics with modern web technologies to empower investors with data-driven insights and powerful optimization tools. Whether you're a professional fund manager or an individual investor, Axiome provides the tools you need to make informed investment decisions.

### Key Principles
- **Accuracy**: Precise financial calculations and risk metrics
- **Usability**: Intuitive interface for complex financial concepts
- **Scalability**: Handle portfolios of any size
- **Transparency**: Open-source and community-driven

---

## 📄 License

**Axiome** is licensed under the **Apache License 2.0**.

You are free to use, modify, and distribute this software under the terms of the Apache License 2.0. See the LICENSE file for complete details.

### Summary
- ✅ Commercial use allowed
- ✅ Modification allowed
- ✅ Distribution allowed
- ✅ Private use allowed
- ⚠️ Liability limitation applies
- ⚠️ Trademark usage restricted
- 📋 License and copyright notice required

For full license text, visit: [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📞 Support & Contact

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing documentation at [http://localhost:8000/docs](http://localhost:8000/docs)
- Contact: Josh E. SOUSSAN

---

## 🎯 Roadmap

- [ ] Mobile app (iOS/Android)
- [ ] Advanced machine learning models
- [ ] Real-time websocket updates
- [ ] Multi-user real-time collaboration
- [ ] More market data sources
- [ ] Advanced tax optimization
- [ ] API webhooks and integrations

---

Built with ❤️ by **Josh E. SOUSSAN**

© 2026 Axiome. Licensed under Apache License 2.0.
