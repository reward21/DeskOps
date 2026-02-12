from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "DeskOps-FastAPI"
    fastapi_port: int = 8090
    database_url: str = "postgres://postgres@127.0.0.1:5432/deskops?sslmode=disable"
    backtest_sqlite_path: str = "/data/backtests.sqlite"


settings = Settings()
