from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.database import create_tables
from app.routers import auth, leaderboard, game_session


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_tables()
    yield


app = FastAPI(
    title="Math Defense API",
    description="數學防線遊戲後端 API",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由
app.include_router(auth.router)
app.include_router(leaderboard.router)
app.include_router(game_session.router)


@app.get("/")
def root():
    return {"message": "Math Defense API is running", "docs": "/docs"}
