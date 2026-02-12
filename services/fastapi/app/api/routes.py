from fastapi import APIRouter

from app.core.config import settings
from app.models.schemas import HealthResponse, ImportRequest, ImportResponse
from app.services.sqlite_importer import import_sqlite_to_postgres

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", service=settings.app_name)


@router.post("/v1/import/backtests", response_model=ImportResponse)
async def import_backtests(req: ImportRequest) -> ImportResponse:
    sqlite_path = req.sqlite_path or settings.backtest_sqlite_path
    imported = import_sqlite_to_postgres(sqlite_path, settings.database_url, limit=req.limit)
    return ImportResponse(ok=True, imported_tables=imported, notes=["SQLite read-only", "Market data untouched"])
