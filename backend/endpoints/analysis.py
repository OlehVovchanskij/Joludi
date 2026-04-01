from fastapi import APIRouter, File, HTTPException, UploadFile

from services.analyzer import analyze_log_bytes_async, parse_log_bytes_async


router = APIRouter(tags=["analysis"])


async def _read_upload(file: UploadFile) -> bytes:
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")
    return file_bytes


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
async def analyze(file: UploadFile = File(...)) -> dict:
    file_bytes = await _read_upload(file)
    return await analyze_log_bytes_async(file_bytes, filename=file.filename)


@router.post("/map/google")
async def google_map_trajectory(file: UploadFile = File(...)) -> dict:
    file_bytes = await _read_upload(file)
    analysis_result = await analyze_log_bytes_async(file_bytes, filename=file.filename)
    return analysis_result["google_maps"]
