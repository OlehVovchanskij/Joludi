from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from schemas.analysis import CoachChatRequest, SummaryRequest

from services.analyzer import analyze_log_bytes_async, parse_log_bytes_async
from services.ai_summary import generate_flight_summary, generate_pilot_coach_reply
from services.auth import get_current_user_from_token
from services.history_store import get_history_item, get_recent_history, prune_history, save_analysis_history


router = APIRouter(tags=["analysis"])
bearer_scheme = HTTPBearer(auto_error=False)


async def _read_upload(file: UploadFile) -> bytes:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return file_bytes


def _resolve_user_id(credentials: HTTPAuthorizationCredentials | None) -> str | None:
    if credentials is None or credentials.scheme.lower() != "bearer":
        return None
    user = get_current_user_from_token(credentials.credentials)
    if user is None:
        return None
    user_id = user.get("id")
    return str(user_id) if user_id is not None else None


def _require_user_id(credentials: HTTPAuthorizationCredentials | None) -> str:
    user_id = _resolve_user_id(credentials)
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user_id


@router.post("/parse")
async def parse_log(file: UploadFile = File(...)) -> dict:
    file_bytes = await _read_upload(file)
    parsed_data = await parse_log_bytes_async(file_bytes, filename=file.filename)
    return parsed_data.to_api_payload()


@router.post("/metrics")
async def analyze_metrics(file: UploadFile = File(...)) -> dict:
    file_bytes = await _read_upload(file)
    analysis_result = await analyze_log_bytes_async(file_bytes, filename=file.filename)
    return analysis_result["metrics"]


@router.post("/trajectory")
async def trajectory(file: UploadFile = File(...)) -> dict:
    file_bytes = await _read_upload(file)
    analysis_result = await analyze_log_bytes_async(file_bytes, filename=file.filename)
    return {
        "trajectory_enu": analysis_result["trajectory_enu"],
        "plotly_figure": analysis_result["plotly_figure"],
        "google_maps": analysis_result["google_maps"],
    }


@router.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    file_bytes = await _read_upload(file)
    analysis_result = await analyze_log_bytes_async(file_bytes, filename=file.filename)
    history_saved = save_analysis_history(
        analysis_result, user_id=_resolve_user_id(credentials))
    return {
        **analysis_result,
        "history_saved": history_saved,
    }


@router.post("/map/google")
async def google_map_trajectory(file: UploadFile = File(...)) -> dict:
    file_bytes = await _read_upload(file)
    analysis_result = await analyze_log_bytes_async(file_bytes, filename=file.filename)
    return analysis_result["google_maps"]


@router.post("/ai/summary")
async def ai_summary(payload: SummaryRequest) -> dict:
    return generate_flight_summary(payload.analysis)


@router.post("/ai/chat")
async def ai_chat(payload: CoachChatRequest) -> dict:
    messages = [message.model_dump() for message in payload.messages[-10:]]
    return generate_pilot_coach_reply(payload.analysis, messages)


@router.get("/history")
def history(
    limit: int = 30,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    safe_limit = max(1, min(limit, 200))
    user_id = _require_user_id(credentials)
    return {"items": get_recent_history(limit=safe_limit, user_id=user_id)}


@router.get("/history/{item_id}")
def history_item(
    item_id: str,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    user_id = _require_user_id(credentials)
    item = get_history_item(item_id, user_id=user_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND,
                            detail="History item not found")
    return item


@router.post("/history/prune")
def history_prune(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> dict[str, int]:
    user_id = _require_user_id(credentials)
    removed = prune_history(user_id=user_id)
    return {"removed": removed}
