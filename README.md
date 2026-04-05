# 🚁 Joludi - Drone Flight Analysis & Visualization Platform

> **Intelligent Drone Telemetry Analysis Platform** — Transform raw flight logs into actionable insights with AI-powered summaries, interactive visualizations, and pilot coaching.

![Status](https://img.shields.io/badge/Status-Active%20Development-green)
![License](https://img.shields.io/badge/License-MIT-blue)
![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Node.js](https://img.shields.io/badge/Node.js-18+-green)

---

## 📖 Table of Contents

- [Project Overview](#-project-overview)
- [Key Features](#-key-features)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Architecture](#-architecture)
- [API Documentation](#-api-documentation)
- [Project Structure](#-project-structure)
- [Configuration](#-configuration)
- [Deployment](#-deployment)
- [Development Guide](#-development-guide)
- [Contributing](#-contributing)

---

## 🎯 Project Overview

### What is Joludi?

**Joludi** is a web-based platform for analyzing Ardupilot autonomous drone flight logs. It automates the parsing of binary flight telemetry, computes mission metrics, renders interactive 3D/2D trajectory visualizations, and generates AI-powered flight summaries with coaching feedback.

### Primary Use Cases

✅ **Autonomous Drone Flight Analysis** — Post-flight review and performance analysis  
✅ **Pilot Training & Coaching** — AI-powered recommendations for flight improvement  
✅ **Mission Metrics Computation** — Distance, speed, acceleration, altitude profiles  
✅ **Interactive Visualization** — 3D trajectory on maps with timeline playback  
✅ **Flight Performance Tracking** — History management and trend analysis  

### Problem Solved

Raw Ardupilot flight logs (binary `.bin` files) are difficult to interpret without specialized tools. Pilots, engineers, and trainers need:
- **Quick parsing** of flight data
- **Intuitive visualizations** showing flight paths and dynamics
- **Intelligent analysis** of flight performance
- **Context-aware coaching** for improvement

Joludi solves all of these in one integrated platform.

---

## ✨ Key Features

### 1. **Automatic Log Parsing**
- Reads binary Ardupilot `.bin` flight logs
- Extracts GPS positions and IMU acceleration data
- Auto-detects sampling rates and unit conversions
- Handles multi-format telemetry data

### 2. **Flight Metrics Computation**
- **Total Distance** — Haversine formula over GPS waypoints
- **Flight Duration** — Elapsed time between log start/end
- **Maximum Speeds** — Horizontal and vertical velocity peaks
- **Acceleration Analysis** — Max acceleration from IMU data
- **Altitude Profiles** — Height gain and distribution
- **Detailed Metadata** — Sampling rates, unit information, message counts

### 3. **Interactive 3D/2D Visualization**
- **3D Trajectory** — East-North-Up coordinate space visualization
- **2D Map** — OpenStreetMap-based flight path with animated playback
- **Timeline Scrubber** — Frame-by-frame analysis with variable playback speed
- **Multi-layer Visualization** — Altitude coloring, speed profiles, acceleration heatmaps
- **Exportable** — Google Maps compatible polyline encoding

### 4. **AI-Powered Analysis**
- **Flight Summaries** — LLM-generated text summaries of mission characteristics
- **Risk Assessment** — Automatic classification (Low/Medium/High risk)
- **Coaching Feedback** — AI pilot coach with actionable recommendations
- **Interactive Chat** — Real-time dialogue about flight performance
- **Flexible Providers** — Groq, OpenAI, or self-hosted LLM APIs
- **Fallback Mode** — Rule-based analysis when no API key present

### 5. **User Authentication & Multi-Tenancy**
- **Registration & Login** — Email-based user accounts with JWT tokens
- **Email Verification** — SMTP-based account activation
- **Session Management** — Access/refresh token system
- **User-Scoped Data** — Each user's flight history is private

### 6. **Flight History Management**
- **Browse Recent Flights** — Compact metadata view
- **Automatic Cleanup** — 30-day retention policy with configurable limits
- **Full Payload Storage** — Complete analysis saved for later retrieval
- **Query Optimization** — Efficient pagination and filtering

---

## 🛠 Technology Stack

### **Backend**
```
Framework: FastAPI (Async Python Web Framework)
Language: Python 3.9+
Database: PostgreSQL 16 (with JSON file fallback)

Core Libraries:
├── pymavlink          — Ardupilot log parsing
├── pandas/numpy/scipy — Data manipulation & calculations
├── plotly             — Interactive 3D visualizations
├── sqlalchemy         — ORM database management
├── pydantic           — Data validation
├── python-jose        — JWT token handling
└── aiofiles           — Async file operations

Optional Performance:
├── C Extension (flight_math)  — 50-100× speedup for math ops
└── haversine          — Great-circle distance calculations
```

### **Frontend**
```
Framework: Next.js 16.2 (React 19.2 + TypeScript)
Language: TypeScript
Styling: Tailwind CSS 4.0

Libraries:
├── plotly.js          — Interactive charts & 3D viz
├── react-leaflet      — Map integration
├── leaflet            — OpenStreetMap support
├── framer-motion      — Smooth animations
└── axios              — HTTP client
```

### **DevOps & Deployment**
```
Containerization: Docker & Docker Compose
Orchestration: Compatible with Kubernetes
Environment: Linux/macOS/Windows (via WSL)
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- Node.js 18+
- PostgreSQL 16 (or use Docker)
- Docker & Docker Compose (recommended)

### Option 1: Docker Compose (Recommended)

```bash
# Clone and navigate
git clone <repository-url>
cd Joludi

# Configure environment (copy template)
cp .env.example .env
# Edit .env with your API keys and SMTP config

# Start all services
docker-compose up -d

# Backend runs at: http://localhost:8501
# Frontend runs at: http://localhost:3000
# API Docs at: http://localhost:8501/docs
```

### Option 2: Local Development

#### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Configure environment
cp .env.example .env
nano .env  # Set DATABASE_URL, API keys, etc.

# Start server
uvicorn app:app --reload --host 0.0.0.0 --port 8501
```

#### Frontend Setup
```bash
cd frontend
npm install

# Set API endpoint
export NEXT_PUBLIC_API_BASE=http://localhost:8501

# Start dev server
npm run dev  # Runs on http://localhost:3000
```

### First Steps

1. **Register an Account** — Create user at `/auth/register`
2. **Verify Email** — Check inbox for verification link
3. **Upload Flight Log** — Drag `.bin` file to dashboard
4. **View Analysis** — Metrics, 3D visualization, AI summary appear automatically
5. **Interact with Coach** — Chat about flight performance
6. **Browse History** — Access previous flight analyses

---

## 🏗 Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Client Browser                        │
│  (Next.js Frontend @ http://localhost:3000)             │
└────────────┬────────────────────────────────────────────┘
             │ HTTP/WebSocket
             ▼
┌─────────────────────────────────────────────────────────┐
│              FastAPI Backend (Python)                    │
│  ├─ Endpoints                                           │
│  │  ├─ /api/parse      → Binary log parsing            │
│  │  ├─ /api/metrics    → Flight metrics computation    │
│  │  ├─ /api/trajectory → Coordinate transformation    │
│  │  ├─ /api/analyze    → Full pipeline                │
│  │  ├─ /api/ai/*       → LLM integration              │
│  │  └─ /api/auth/*     → User authentication          │
│  │                                                      │
│  ├─ Services                                           │
│  │  ├─ analyzer.py     → Log parsing & metrics        │
│  │  ├─ ai_summary.py   → LLM provider abstraction     │
│  │  ├─ coordinates.py  → WGS-84 → ENU conversion     │
│  │  └─ auth.py         → JWT & session management    │
│  │                                                      │
│  └─ Models (SQLAlchemy ORM)                           │
│     ├─ AuthUser                                        │
│     ├─ AuthSession                                     │
│     └─ ParseHistory                                    │
└────────────┬────────────────────────────────────────────┘
             │ SQL Protocol
             ▼
┌─────────────────────────────────────────────────────────┐
│         PostgreSQL 16 (Relational Database)             │
│  ├─ users          (authentication)                     │
│  ├─ sessions       (JWT tokens)                         │
│  └─ history        (flight analyses)                    │
└─────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────┐
│    External Services (Optional)                         │
│  ├─ Groq/OpenAI    ← AI Summaries & Coaching         │
│  └─ SMTP Server    ← Email Verification               │
└─────────────────────────────────────────────────────────┘
```

### Data Flow: Log Upload → Analysis

```
1. User uploads .bin file
                    │
                    ▼
2. FastAPI receives multipart/form-data
                    │
                    ▼
3. Binary log parsing
   ├─ Extract GPS messages (lat, lon, alt)
   ├─ Extract IMU messages (acceleration)
   └─ Auto-detect sampling rates
                    │
                    ▼
4. Metrics computation
   ├─ Haversine distance from GPS waypoints
   ├─ Trapezoidal integration of acceleration
   └─ Speed/altitude profiles
                    │
                    ▼
5. Coordinate transformation
   ├─ WGS-84 → Local tangent plane (ENU)
   └─ Generate Plotly 3D figure
                    │
                    ▼
6. AI analysis (parallel)
   ├─ Generate flight summary (LLM or rule-based)
   ├─ Classify risk level
   └─ Generate coaching recommendations
                    │
                    ▼
7. Save history to PostgreSQL (user-scoped)
                    │
                    ▼
8. Return complete analysis to frontend
   ├─ Metrics
   ├─ 3D visualization (Plotly JSON)
   ├─ 2D map data (polyline)
   ├─ AI summary & risk assessment
   └─ Timeline for playback
```

### Coordinate System: WGS-84 → ENU

The platform uses a local East-North-Up (ENU) coordinate system for visualization:

```
       North (Y)
          ▲
          │     East (X)
          │    /
          │   /
          └────────►
         /
        /
    Up (Z)

Origin: Drone's takeoff GPS point
Projection: Local Tangent Plane (LTP)
Accuracy: High precision for ranges < 100 km
```

**Formula:**
```
lat_rad = latitude / 10^7 * π/180
lon_rad = longitude / 10^7 * π/180
alt_m = altitude / 1000

East:  dE = R * (lon - lon0) * cos(lat0)
North: dN = R * (lat - lat0)
Up:    dU = (alt - alt0)

R ≈ 6,371 km (Earth radius)
```

### Performance Optimization: C Extension

The optional C extension (`flight_math`) provides **50-100× speedup** for:
- Haversine distance calculations
- Coordinate transformations
- Trapezoidal integration

Falls back to pure Python if unavailable (transparent to user).

---

## 📡 API Documentation

### REST Endpoints

#### **Analysis Endpoints**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/parse` | ❌ | Parse `.bin` file → telemetry data |
| `POST` | `/api/metrics` | ❌ | Parse → compute metrics only |
| `POST` | `/api/trajectory` | ❌ | Parse → ENU trajectory + maps |
| `POST` | `/api/analyze` | ✅* | Full analysis pipeline |
| `POST` | `/api/map/google` | ❌ | Generate Google Maps polyline |

*Optional auth (saves to history if authenticated)

#### **AI Endpoints**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `POST` | `/api/ai/summary` | ❌ | Generate flight summary |
| `POST` | `/api/ai/chat` | ❌ | Interactive pilot coach |
| `POST` | `/api/ai/chat/logs` | ❌ | Chat with debug logs |

#### **User Authentication**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login (returns JWT tokens) |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Revoke refresh token |
| `POST` | `/api/auth/verify-email` | Confirm email |
| `POST` | `/api/auth/resend-verification` | Request new verification email |
| `GET` | `/api/auth/me` | Get current user (auth required) |

#### **History Management**

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/history` | ✅ | List user's flight history |
| `GET` | `/api/history/{id}` | ✅ | Get single analysis |
| `POST` | `/api/history/prune` | ✅ | Manual cleanup |

#### **Health & Docs**

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (interactive docs) |
| `GET` | `/redoc` | ReDoc (alternative docs) |

### Example: Upload and Analyze Flight Log

```bash
# 1. Upload flight log (no auth required)
curl -X POST http://localhost:8501/api/analyze \
  -F "file=@flight.bin"

# Response:
{
  "metrics": {
    "distance_m": 1250.5,
    "duration_s": 450,
    "max_speed_h": 22.3,
    "max_speed_v": 5.8,
    "max_acceleration": 12.1,
    "max_altitude": 85.5
  },
  "trajectory": {
    "points": [...],
    "plotly_figure": {...}
  },
  "summary": {
    "text": "Flight was smooth with...",
    "risk_level": "low",
    "recommendations": [...]
  }
}
```

### Authentication Flow

```
1. Register
   POST /api/auth/register
   ├─ email: "pilot@example.com"
   ├─ password: "secure_password"
   └─ returns: user_id, verification_email sent

2. Verify Email
   POST /api/auth/verify-email
   ├─ token: (from email link)
   └─ status: Account activated

3. Login
   POST /api/auth/login
   ├─ email: "pilot@example.com"
   ├─ password: "secure_password"
   └─ returns: {access_token, refresh_token, expires_in}

4. Use Token
   GET /api/history
   ├─ Authorization: Bearer <access_token>
   └─ returns: [flight1, flight2, ...]

5. Refresh Token (when access expires)
   POST /api/auth/refresh
   ├─ refresh_token: <token>
   └─ returns: new {access_token, refresh_token}
```

---

## 📁 Project Structure

```
Joludi/
├── README.md                          ← You are here
├── docker-compose.yml                 ← Full stack deployment
├── .env.example                       ← Configuration template
│
├── backend/                           ← FastAPI Application
│   ├── app.py                         ← Main application entry
│   ├── requirements.txt                ← Python dependencies
│   ├── Dockerfile                     ← Backend container
│   ├── docker-compose.yml             ← Backend service config
│   ├── alembic.ini                    ← DB migration config
│   │
│   ├── alembic/                       ← Database migrations
│   │   └── versions/                  ← Migration scripts
│   │
│   ├── models/                        ← SQLAlchemy ORM Models
│   │   ├── __init__.py
│   │   ├── base.py                    ← Base model class
│   │   ├── auth.py                    ← AuthUser, AuthSession
│   │   └── history.py                 ← ParseHistory
│   │
│   ├── schemas/                       ← Pydantic Request/Response Models
│   │   ├── __init__.py
│   │   ├── auth.py                    ← Auth DTOs
│   │   ├── analysis.py                ← Analysis DTOs
│   │   └── history.py                 ← History DTOs
│   │
│   ├── services/                      ← Business Logic
│   │   ├── analyzer.py                ← Log parsing & metrics
│   │   ├── ai_summary.py              ← LLM integration
│   │   ├── coordinates.py             ← WGS-84 ↔ ENU conversion
│   │   ├── auth.py                    ← JWT & session logic
│   │   └── history_store.py           ← History DB operations
│   │
│   ├── endpoints/                     ← API Route Handlers
│   │   ├── analysis.py                ← /api/parse, /api/analyze
│   │   ├── auth.py                    ← /api/auth/*
│   │   └── v1/                        ← Versioned endpoints (future)
│   │
│   ├── native/                        ← Optional C Extension
│   │   ├── __init__.py
│   │   ├── fast_math.py               ← Python wrapper
│   │   ├── flight_math.c              ← C implementation
│   │   └── setup.py                   ← Build configuration
│   │
│   ├── data/                          ← Local data storage
│   │   └── auth_store.json            ← Fallback auth (no DB)
│   │
│   └── logs/                          ← Application logs
│
├── frontend/                          ← Next.js Application
│   ├── package.json                   ← Node.js dependencies
│   ├── tsconfig.json                  ← TypeScript config
│   ├── next.config.ts                 ← Next.js config
│   ├── tailwind.config.ts             ← Tailwind CSS config
│   ├── Dockerfile                     ← Frontend container
│   │
│   ├── public/                        ← Static assets
│   │   └── assets/
│   │
│   └── src/
│       ├── app/                       ← Pages & Layouts
│       │   ├── layout.tsx             ← Root layout
│       │   ├── page.tsx               ← Home page (dashboard)
│       │   ├── auth/
│       │   │   └── page.tsx           ← Auth pages
│       │   ├── history/
│       │   │   └── page.tsx           ← History browser
│       │   └── verify-email/
│       │       └── page.tsx           ← Email verification
│       │
│       ├── components/                ← Reusable UI Components
│       │   ├── Trajectory3D.tsx       ← 3D viz (Plotly)
│       │   └── TrajectoryMap.tsx      ← 2D map (Leaflet)
│       │
│       ├── entities/                  ← Domain Models & Types
│       │   ├── auth/
│       │   │   └── model/
│       │   │       ├── storage.ts     ← Token persistence
│       │   │       └── types.ts       ← Auth types
│       │   │
│       │   └── telemetry/
│       │       ├── lib/
│       │       │   └── analysis.ts    ← Flight analysis utilities
│       │       └── model/
│       │           └── types.ts       ← Telemetry data types
│       │
│       ├── features/                  ← Feature-Specific Logic
│       │   ├── analysis/
│       │   │   └── api/
│       │   │       └── analysis-api.ts  ← Analysis API client
│       │   ├── auth/
│       │   │   └── api/
│       │   │       └── auth-api.ts      ← Auth API client
│       │   └── history/
│       │       └── api/
│       │           └── history-api.ts   ← History API client
│       │
│       ├── shared/                    ← Shared Utilities
│       │   ├── config/
│       │   │   └── api.ts             ← API configuration
│       │   └── lib/
│       │       └── formatters.ts      ← UI formatters
│       │
│       ├── widgets/                   ← Page Widgets/Sections
│       │   └── dashboard/
│       │       ├── model/
│       │       │   └── use-dashboard-state.ts  ← State management
│       │       └── ui/
│       │           ├── DashboardHero.tsx
│       │           ├── DashboardUploadSection.tsx
│       │           ├── DashboardMetricsSection.tsx
│       │           ├── DashboardTrackSection.tsx
│       │           ├── DashboardAiSummarySection.tsx
│       │           ├── DashboardAiChatSection.tsx
│       │           ├── DashboardLoadingSection.tsx
│       │           └── DashboardEasterEgg.tsx
│       │
│       └── types/                    ← Global TypeScript Types
│           └── react-plotly.d.ts     ← Plotly type definitions
│
└── .gitignore

```

---

## ⚙ Configuration

### Environment Variables

Create a `.env` file in the project root:

```bash
# Database
DATABASE_URL=postgresql://joludi:password@postgres:5432/joludi_db

# History Settings
HISTORY_ENABLED=true
HISTORY_RETENTION_DAYS=30
HISTORY_MAX_ROWS=20000

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@joludi.io
SMTP_FROM_NAME=Joludi
SMTP_USE_TLS=true
SMTP_USE_SSL=false
EMAIL_VERIFICATION_TOKEN_TTL_MINUTES=1440

# App Configuration
APP_PUBLIC_URL=http://localhost:3000
APP_NAME=Joludi

# Frontend API
NEXT_PUBLIC_API_BASE=http://localhost:8501

# AI Provider (Groq)
AI_PROVIDER=groq
GROQ_API_KEY=gsk_***
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=mixtral-8x7b-32768

# Alternative: OpenAI
# AI_PROVIDER=openai
# OPENAI_API_KEY=sk-***
# OPENAI_BASE_URL=https://api.openai.com/v1
# OPENAI_MODEL=gpt-4-turbo

# Maps (Optional)
GOOGLE_MAPS_API_KEY=AIza***

# Logging
LOG_LEVEL=INFO
```

---

## 🚢 Deployment

### Docker Compose (Production)

```bash
# Build images
docker-compose build

# Start services
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Stop services
docker-compose down
```

### Kubernetes (Advanced)

The Docker images are Kubernetes-ready. Example manifests:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: joludi-backend
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: backend
        image: joludi-backend:latest
        ports:
        - containerPort: 8501
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: joludi-secrets
              key: database-url
        # ... more env vars
```

### Cloud Deployment

Joludi can be deployed to:
- **AWS (ECS, EKS)**
- **Google Cloud (Cloud Run, GKE)**
- **Azure (App Service, AKS)**
- **DigitalOcean (App Platform, Kubernetes)**
- **Heroku** (with Docker buildpack)

All services are stateless except PostgreSQL (which should be managed DBaaS).

---

## 👨‍💻 Development Guide

### Backend Development

```bash
cd backend
source venv/bin/activate

# Run with auto-reload
uvicorn app:app --reload --port 8501

# Run tests
pytest

# Generate migrations
alembic revision --autogenerate -m "Add new column"
alembic upgrade head

# View API docs
open http://localhost:8501/docs
```

### Frontend Development

```bash
cd frontend
npm install

# Dev server (with hot reload)
npm run dev

# Build for production
npm run build
npm run start

# Linting
npm run lint

# Type checking
npm run type-check
```

### Database Migrations

```bash
cd backend

# Create new migration
alembic revision --autogenerate -m "Describe change"

# Apply migrations
alembic upgrade head

# Rollback last migration
alembic downgrade -1

# View migration history
alembic current
alembic history
```

### Testing

```bash
cd backend
pip install pytest pytest-asyncio

# Run all tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test
pytest tests/test_analyzer.py::test_log_parsing
```

### C Extension Development

```bash
cd backend/native

# Build extension
python setup.py build_ext --inplace

# Test fallback behavior (rename .so/.pyd)
mv flight_math.*.so flight_math.*.so.bak

# Verify Python fallback works
python -c "from fast_math import haversine; print(haversine(...))"
```

---

## 🤝 Contributing

### Code Style

**Python:**
- PEP 8 compliant
- Use type hints (`from typing import ...`)
- Docstrings for public functions

**TypeScript/React:**
- ESLint configured (`npm run lint`)
- Prettier for formatting
- Functional components + hooks
- Props interfaces

### Commit Message Format

```
feat: Add new feature
fix: Fix a bug
docs: Update documentation
style: Format code
refactor: Restructure code
test: Add tests
```

### Pull Request Process

1. Create feature branch: `git checkout -b feat/description`
2. Implement changes with tests
3. Run linting: `npm run lint` (frontend), `pylint` (backend)
4. Update documentation
5. Submit PR with clear description
6. Request review from maintainers

---

## 📊 Real-World Example

### Analyzing a Competition Flight

1. **Export Flight Log** — Pilot exports `.bin` from Ardupilot
2. **Upload to Joludi** — Drag file to dashboard
3. **Instant Analysis** — Metrics appear in seconds
4. **Review Visualization** — 3D flight path with speed profiles
5. **AI Coaching** — Platform generates summary:
   > "Great smooth flying! Your flight was efficient with average
   > speed 15 m/s and good landing precision. Consider reducing
   > lateral acceleration in tight corners for improved efficiency."
6. **Share Results** — Export analysis for coaching session

---

## 🔧 Troubleshooting

### Backend Connection Errors
```bash
# Check if backend is running
curl http://localhost:8501/health

# Check logs
docker logs joludi_backend_1

# Verify environment variables
docker exec joludi_backend_1 env | grep DATABASE
```

### Database Connection Issues
```bash
# Check PostgreSQL
docker logs joludi_postgres_1

# Verify migrations
docker exec joludi_backend_1 alembic current

# Reset database (⚠️ data loss!)
docker-compose down -v
docker-compose up
```

### Frontend Build Issues
```bash
# Clear cache
rm -rf node_modules .next
npm install

# Check TypeScript errors
npm run type-check

# View build output
npm run build
```

---

## 📝 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) file for details.

---

## 🎓 Learning Resources

- **Ardupilot Docs:** https://ardupilot.org/
- **FastAPI Tutorial:** https://fastapi.tiangolo.com/
- **Next.js Docs:** https://nextjs.org/docs
- **Plotly.js:** https://plotly.com/javascript/
- **PostgreSQL Docs:** https://www.postgresql.org/docs/

---

## 📧 Contact & Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Email:** support@joludi.io

---

## 🙏 Acknowledgments

Built with ❤️ for drone pilots, engineers, and enthusiasts.

Thanks to:
- **Ardupilot Community** — Log format specifications
- **FastAPI** — Modern Python web framework
- **Next.js Team** — Excellent React framework
- **Plotly** — Interactive visualizations
- **Groq** — Fast LLM inference

---

**Happy Flying! 🚁**
