# Fixture Generator

Fixture Generator is a standalone application foundation for creating darts fixtures. It is intentionally separate from any existing league-management application.

## Current stack

- Backend: Python 3.12, FastAPI, Uvicorn, pytest, and Ruff
- Frontend: React, TypeScript, and Vite, with ESLint
- Development: GitHub Codespaces dev container using Python 3.12 and Node.js 22

## Status

This repository is foundation-only. It does not yet contain fixture-generation logic, scheduling or league rules, database models, OR-Tools, CSV export, a user interface, or Chalkie integration.

## Run the backend

```bash
cd backend
python -m pip install -r requirements.lock
uvicorn app.main:app --reload
```

The health endpoint is available at `http://localhost:8000/health`.

## Run the frontend

```bash
cd frontend
npm ci
npm run dev
```

Vite serves the development application at `http://localhost:5173`.

## Run backend tests

```bash
cd backend
python -m pip install -r requirements.lock
pytest
```
