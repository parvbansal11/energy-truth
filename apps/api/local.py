from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from .service import route
app = FastAPI(title="Energy Truth API", version="0.1.0")
@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def dispatch(path: str, request: Request):
    status, body = route(request.method, "/" + path)
    return JSONResponse(body, status_code=status, headers={"Cache-Control": "no-store"})
