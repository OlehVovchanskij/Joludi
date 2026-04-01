from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from endpoints.analysis import router as analysis_router


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


@app.get("/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
