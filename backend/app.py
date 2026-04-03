from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from endpoints.auth import router as auth_router
from endpoints.analysis import router as analysis_router
from services.history_store import create_history_tables


app = FastAPI(
    title="Drone Analyzer API",
    version="1.0.0",
    description="API for parsing Ardupilot .bin logs, computing flight metrics, and building ENU trajectories.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(analysis_router, prefix="/api")
app.include_router(auth_router, prefix="/api")


@app.on_event("startup")
def on_startup() -> None:
    create_history_tables()


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
