from fastapi import FastAPI, HTTPException, APIRouter, Request, Response
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

# Define a subclass of StaticFiles to create a custom static file handler
# that supports client-side routing in Single Page Applications (SPAs).
class SPAStaticFiles(StaticFiles):
    # Override the get_response method, which is responsible for retrieving
    # static file responses for given paths.
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except (HTTPException, StarletteHTTPException) as ex:
            if ex.status_code == 404:
                return await super().get_response("index.html", scope)
            else:
                raise ex


app = FastAPI()
api_router = APIRouter(prefix="/api")


import httpx
import datetime
import logging
import os
import time
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

app = FastAPI()


async def _fetch_data_gov_radar(
    client: httpx.AsyncClient,
) -> Optional[Tuple[str, bytes]]:
    """Try to fetch latest radar from data.gov.sg API. Returns (timestamp, image_bytes) or None."""
    try:
        data_gov_url = "https://api-open.gbbp.data.gov.sg/v2/real-time/api/rain-radar-images/240km"
        resp = await client.get(data_gov_url, timeout=5.0)
        
        if resp.status_code != 200:
            return None
        
        data = resp.json()
        records = data.get("data", {}).get("records", [])
        
        if not records:
            return None
        
        latest = records[0]
        timestamp = latest.get("timestamp")
        image_url = latest.get("image", {}).get("url")
        
        if not timestamp or not image_url:
            return None
        
        img_resp = await client.get(image_url, timeout=10.0)
        if img_resp.status_code == 200:
            return (timestamp, img_resp.content)
        
        return None
    except httpx.HTTPError as e:
        logger.debug(f"Failed to fetch radar from data.gov.sg: {e}")
        return None
    except ValueError as e:
        logger.debug(f"Failed to parse data.gov.sg response: {e}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error fetching from data.gov.sg: {e}")
        return None


async def _fetch_weather_gov_radar(
    client: httpx.AsyncClient,
) -> Optional[Tuple[str, bytes]]:
    """Try to fetch latest radar from weather.gov.sg. Returns (timestamp, image_bytes) or None."""
    try:
        now = datetime.datetime.now()
        # Clamp to 5-minute intervals (e.g., 2:13 -> 2:10)
        clamped_minute = (now.minute // 5) * 5
        clamped_time = now.replace(minute=clamped_minute, second=0, microsecond=0)
        
        filename = f"240/{clamped_time.strftime('%Y%m%d%H%M')}_240km.png"
        url = f"https://www.weather.gov.sg/files/rainarea/{filename}"
        
        img_resp = await client.get(url, timeout=10.0)
        if img_resp.status_code == 200:
            timestamp = clamped_time.strftime('%Y-%m-%dT%H:%M:%S+08:00')
            return (timestamp, img_resp.content)
        
        return None
    except httpx.HTTPError as e:
        logger.debug(f"Failed to fetch radar from weather.gov.sg: {e}")
        return None
    except Exception as e:
        logger.warning(f"Unexpected error fetching from weather.gov.sg: {e}")
        return None


@api_router.api_route("/weather-radar/240km/latest", methods=["GET"])
async def weather_radar_240km_latest(request: Request):
    """Fetch latest 240km radar image with fallback to weather.gov.sg."""
    async with httpx.AsyncClient() as client:
        # Try data.gov.sg first
        result = await _fetch_data_gov_radar(client)
        if result:
            timestamp, content = result
            return Response(
                content=content,
                status_code=200,
                media_type="image/png",
                headers={
                    "X-Radar-Timestamp": timestamp,
                    "X-Radar-Source": "data.gov.sg"
                }
            )
        
        # Fall back to weather.gov.sg
        result = await _fetch_weather_gov_radar(client)
        if result:
            timestamp, content = result
            return Response(
                content=content,
                status_code=200,
                media_type="image/png",
                headers={
                    "X-Radar-Timestamp": timestamp,
                    "X-Radar-Source": "weather.gov.sg"
                }
            )
    
    raise HTTPException(status_code=503, detail="Unable to fetch radar image from both data.gov.sg and weather.gov.sg")

@api_router.api_route("/weather-radar/img/{path:path}", methods=["GET"])
async def weather_radar(path: str, request: Request):
    url = f"https://www.weather.gov.sg/files/rainarea/240km/{path}"

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            url,
            params=request.query_params,
        )

    return Response(
        content=resp.content,
        status_code=resp.status_code,
        media_type=resp.headers.get("content-type"),
    )

LIGHTNING_URL = "https://api-open.data.gov.sg/v2/real-time/api/weather"
LIGHTNING_CACHE_SECONDS = 30
_lightning_cache: dict[str, tuple[float, int, bytes]] = {}


@api_router.api_route("/lightning", methods=["GET"])
async def lightning(date: str):
    """Proxy data.gov.sg lightning observations for one SGT day (YYYY-MM-DD), newest first.

    The first page covers about 50 minutes, which is all Live mode needs. Responses are
    cached briefly so every open tab shares one upstream request.
    """
    try:
        datetime.date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")

    now = time.monotonic()
    cached = _lightning_cache.get(date)
    if cached and now - cached[0] < LIGHTNING_CACHE_SECONDS:
        return Response(content=cached[2], status_code=cached[1], media_type="application/json")

    headers = {}
    if api_key := os.environ.get("DATA_GOV_API_KEY"):
        headers["x-api-key"] = api_key
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(
                LIGHTNING_URL,
                params={"api": "lightning", "date": date},
                headers=headers,
                timeout=10.0,
            )
        except httpx.HTTPError as e:
            logger.warning(f"Lightning feed request failed: {e}")
            raise HTTPException(status_code=502, detail="Lightning feed unavailable")

    if resp.status_code in (200, 404):
        _lightning_cache[date] = (now, resp.status_code, resp.content)
        for key in [key for key in _lightning_cache if key != date]:
            if now - _lightning_cache[key][0] > 3600:
                del _lightning_cache[key]
    return Response(content=resp.content, status_code=resp.status_code, media_type="application/json")


app.include_router(api_router)
app.mount("/", SPAStaticFiles(directory="dist", html=True), name="mappy-spa")
