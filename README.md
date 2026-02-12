# DeskOps
Console Dashboard application for the GulfChain Workspace

## Docker branch (deskops-docker)

This section applies only to the `deskops-docker` branch.

```bash
docker compose up --build
```

Ports:
- Web: http://localhost:8888
- Go API: http://localhost:9090
- FastAPI: http://localhost:8090
- Postgres: localhost:5432

Note: the Docker setup mounts the backtest SQLite file read-only into the FastAPI container.
