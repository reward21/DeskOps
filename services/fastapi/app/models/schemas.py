from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str = "ok"
    service: str


class ImportRequest(BaseModel):
    sqlite_path: str | None = None
    limit: int | None = None


class ImportResponse(BaseModel):
    ok: bool
    imported_tables: list[str]
    notes: list[str]
