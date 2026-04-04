import io
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Request
from PIL import Image
import httpx
from app.core.config import settings
from app.core.deps import require_editor
from app.models.user import User

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
LOCAL_UPLOAD_DIR = Path("uploads")


def _supabase_configured() -> bool:
    url = settings.SUPABASE_URL or ""
    key = settings.SUPABASE_KEY or ""
    return bool(url and key and "your-project" not in url and "your-anon-key" not in key)


def _process_image(data: bytes, max_dim: int) -> bytes:
    img = Image.open(io.BytesIO(data))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGBA")
    else:
        img = img.convert("RGB")
    if img.width > max_dim or img.height > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="WEBP", quality=85)
    buf.seek(0)
    return buf.read()


@router.post("/upload/image")
async def upload_image(
    request: Request,
    file: UploadFile = File(...),
    folder: str = Form("logos"),
    max_dim: int = Form(800),
    _: User = Depends(require_editor),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Formato non supportato. Usa JPG, PNG o WebP.")

    data = await file.read()
    if len(data) > settings.MAX_IMAGE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File troppo grande (max {settings.MAX_IMAGE_SIZE_MB} MB)")

    processed = _process_image(data, max_dim)
    filename = f"{uuid.uuid4()}.webp"

    if _supabase_configured():
        # ── Supabase Storage ──────────────────────────────────────────────────
        url = settings.SUPABASE_URL
        path = f"{folder}/{filename}"
        storage_url = f"{url}/storage/v1/object/{settings.SUPABASE_BUCKET}/{path}"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    storage_url,
                    content=processed,
                    headers={
                        "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                        "Content-Type": "image/webp",
                        "x-upsert": "true",
                    },
                )
        except httpx.RequestError as e:
            raise HTTPException(status_code=502, detail=f"Impossibile raggiungere lo storage: {e}")

        if resp.status_code not in (200, 201):
            raise HTTPException(
                status_code=502,
                detail=f"Errore storage ({resp.status_code}): {resp.text[:200]}"
            )
        public_url = f"{url}/storage/v1/object/public/{settings.SUPABASE_BUCKET}/{path}"
    else:
        # ── Local fallback (development) ─────────────────────────────────────
        dest_dir = LOCAL_UPLOAD_DIR / folder
        dest_dir.mkdir(parents=True, exist_ok=True)
        (dest_dir / filename).write_bytes(processed)
        public_url = f"/uploads/{folder}/{filename}"

    return {"url": public_url}
