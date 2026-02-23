"""FastAPI application factory."""
from __future__ import annotations

import logging
import mimetypes
from pathlib import Path

# Ensure .js files have the correct MIME type for ES modules (Windows fix)
mimetypes.add_type("application/javascript", ".js")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .database import init_db
from .routers import books, translation

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    """Prevent browsers from caching frontend assets during development."""
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if request.url.path.endswith((".html", ".js", ".css")):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response


def create_app() -> FastAPI:
    init_db()

    app = FastAPI(title="BiTranslator", version="0.1.0")

    app.add_middleware(NoCacheStaticMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(books.router)
    app.include_router(translation.router)

    if FRONTEND_DIR.exists():
        app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")

    return app


app = create_app()
