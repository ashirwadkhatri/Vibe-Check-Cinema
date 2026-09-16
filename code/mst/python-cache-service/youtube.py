import httpx

from .config import settings

YOUTUBE_BASE = "https://www.googleapis.com/youtube/v3"


async def fetch_reviews(title: str) -> list[dict]:
    if not settings.youtube_api_key:
        raise RuntimeError("YOUTUBE_API_KEY is not configured on the server.")

    results: list[dict] = []
    async with httpx.AsyncClient(timeout=15) as client:
        search_response = await client.get(
            f"{YOUTUBE_BASE}/search",
            params={
                "part": "snippet",
                "q": f"{title} movie review",
                "type": "video",
                "maxResults": 5,
                "relevanceLanguage": "en",
                "order": "relevance",
                "key": settings.youtube_api_key,
            },
        )
        search_response.raise_for_status()
        items = search_response.json().get("items", [])

        for item in items:
            video_id = (item.get("id") or {}).get("videoId")
            if not video_id:
                continue

            comments_response = await client.get(
                f"{YOUTUBE_BASE}/commentThreads",
                params={
                    "part": "snippet",
                    "videoId": video_id,
                    "maxResults": 40,
                    "order": "relevance",
                    "textFormat": "plainText",
                    "key": settings.youtube_api_key,
                },
            )
            if comments_response.status_code != 200:
                continue

            for comment in comments_response.json().get("items", []):
                snippet = ((comment.get("snippet") or {}).get("topLevelComment") or {}).get("snippet") or {}
                text = snippet.get("textDisplay")
                if not text:
                    continue
                results.append(
                    {
                        "text": text,
                        "source": "YouTube",
                        "author": snippet.get("authorDisplayName"),
                        "url": f"https://www.youtube.com/watch?v={video_id}",
                    }
                )

    return results
