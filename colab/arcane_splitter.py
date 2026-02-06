"""
Arcane Splitter - Python version for Google Colab

Slices grid images (3×4 = 12 cells), auto-crops white borders, optionally
analyzes slices with OpenAI Vision to generate Midjourney prompts.

Usage in Colab:
  from arcane_splitter import slice_grid_image, analyze_slice, fetch_etsy_listing_images
  slices = slice_grid_image("path/to/grid.png")
  for s in slices:
      result = analyze_slice(s["image_pil"], api_key="sk-...")
"""

from __future__ import annotations

import re
import base64
import io
import json
import zipfile
from pathlib import Path
from typing import List, Optional, Tuple, Union

import requests
from PIL import Image
import numpy as np

# Default grid: 3 rows × 4 cols = 12 images (matches web app)
DEFAULT_ROWS = 3
DEFAULT_COLS = 4
WHITE_THRESHOLD = 240
BORDER_WHITE_RATIO = 0.8


def _is_white_pixel(r: int, g: int, b: int, threshold: int = WHITE_THRESHOLD) -> bool:
    return r >= threshold and g >= threshold and b >= threshold


def _is_white_row(arr: np.ndarray, y: int, threshold: int = WHITE_THRESHOLD) -> bool:
    row = arr[y]
    if arr.ndim == 3:
        white = np.all(row[:, :3] >= threshold, axis=1)
    else:
        white = row >= threshold
    return np.mean(white) >= BORDER_WHITE_RATIO


def _is_white_column(arr: np.ndarray, x: int, threshold: int = WHITE_THRESHOLD) -> bool:
    col = arr[:, x]
    if arr.ndim == 3:
        white = np.all(col[:, :3] >= threshold, axis=1)
    else:
        white = col >= threshold
    return np.mean(white) >= BORDER_WHITE_RATIO


def _find_cell_boundaries(arr: np.ndarray, num_cells: int, is_vertical: bool) -> List[Tuple[int, int]]:
    """Find content regions (non-white) along one axis. Returns list of (start, end) inclusive."""
    h, w = arr.shape[:2]
    size = w if is_vertical else h
    perp = h if is_vertical else w
    white_line = np.zeros(size, dtype=bool)
    step = max(1, perp // 30)
    for pos in range(size):
        if is_vertical:
            strip = arr[:, pos]
            if arr.ndim == 3:
                strip = arr[:, pos, :3].reshape(-1, 3)
            sampled = strip[::step] if strip.ndim == 1 else strip[::step]
        else:
            strip = arr[pos, :]
            if arr.ndim == 3:
                strip = arr[pos, :, :3].reshape(-1, 3)
            sampled = strip[::step] if strip.ndim == 1 else strip[::step]
        if sampled.ndim == 2:
            white_ratio = np.mean(np.all(sampled >= 235, axis=1))
        else:
            white_ratio = np.mean(sampled >= 235)
        white_line[pos] = white_ratio >= 0.6
    boundaries = []
    in_content = False
    start = 0
    for pos in range(size):
        if not white_line[pos] and not in_content:
            in_content = True
            start = pos
        elif white_line[pos] and in_content:
            in_content = False
            boundaries.append((start, pos - 1))
    if in_content:
        boundaries.append((start, size - 1))
    if len(boundaries) != num_cells:
        cell_size = size // num_cells
        boundaries = [(i * cell_size, (i + 1) * cell_size - 1) for i in range(num_cells)]
    return boundaries


def _detect_content_bounds(arr: np.ndarray) -> Tuple[int, int, int, int]:
    """Returns (x, y, width, height) of content area after trimming white borders."""
    h, w = arr.shape[:2]
    top = 0
    for y in range(h):
        if not _is_white_row(arr, y):
            top = y
            break
    bottom = h - 1
    for y in range(h - 1, -1, -1):
        if not _is_white_row(arr, y):
            bottom = y
            break
    left = 0
    for x in range(w):
        if not _is_white_column(arr, x):
            left = x
            break
    right = w - 1
    for x in range(w - 1, -1, -1):
        if not _is_white_column(arr, x):
            right = x
            break
    if left >= right or top >= bottom:
        return 0, 0, w, h
    return left, top, right - left + 1, bottom - top + 1


def slice_grid_image(
    image_input,
    rows: int = DEFAULT_ROWS,
    cols: int = DEFAULT_COLS,
    auto_crop: bool = True,
) -> List[dict]:
    """
    Slice a grid image into cells.

    Args:
        image_input: Path (str), PIL Image, or numpy array (H,W,3) RGB.
        rows: Number of rows (default 3).
        cols: Number of columns (default 4).
        auto_crop: Trim white borders from each cell (default True).

    Returns:
        List of dicts: {"row", "col", "image_pil", "image_base64", "bounds", "cropped_bounds"}
    """
    if isinstance(image_input, (str, Path)):
        img = Image.open(image_input).convert("RGB")
    elif isinstance(image_input, Image.Image):
        img = image_input.convert("RGB")
    elif isinstance(image_input, np.ndarray):
        img = Image.fromarray(image_input.astype(np.uint8))
    else:
        raise TypeError("image_input must be path, PIL Image, or numpy array")

    arr = np.array(img)
    h, w = arr.shape[:2]
    slices_out = []

    col_bounds = _find_cell_boundaries(arr, cols, is_vertical=True)
    row_bounds = _find_cell_boundaries(arr, rows, is_vertical=False)

    for row in range(rows):
        for col in range(cols):
            x1, x2 = col_bounds[col]
            y1, y2 = row_bounds[row]
            cell = arr[y1 : y2 + 1, x1 : x2 + 1]
            cell_pil = Image.fromarray(cell)

            cropped_bounds = (0, 0, cell.shape[1], cell.shape[0])
            if auto_crop:
                cx, cy, cw, ch = _detect_content_bounds(cell)
                if cw > 0 and ch > 0:
                    cell = cell[cy : cy + ch, cx : cx + cw]
                    cell_pil = Image.fromarray(cell)
                    cropped_bounds = (cx, cy, cw, ch)

            buf = io.BytesIO()
            cell_pil.save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode("utf-8")

            slices_out.append({
                "row": row,
                "col": col,
                "image_pil": cell_pil,
                "image_base64": b64,
                "bounds": (x1, y1, x2 - x1 + 1, y2 - y1 + 1),
                "cropped_bounds": cropped_bounds,
            })
    return slices_out


def fetch_etsy_listing_images(listing_id: str, etsy_api_key: Optional[str] = None) -> list[bytes]:
    """
    Fetch full-size image URLs from an Etsy listing and download image bytes.

    Args:
        listing_id: Etsy listing ID (e.g. from URL .../listing/1206601867/...).
        etsy_api_key: Optional. If not set, tries ETSY_API_KEY env var.

    Returns:
        List of image bytes (PNG/JPEG).
    """
    import os
    api_key = etsy_api_key or os.environ.get("ETSY_API_KEY")
    if not api_key:
        raise ValueError("ETSY_API_KEY not set. Get one from https://www.etsy.com/developers/")

    url = "https://openapi.etsy.com/v3/application/listings/" + str(listing_id) + "/images"
    headers = {"x-api-key": api_key}
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    data = r.json()
    results = data.get("results", [])
    urls = []
    for img in results:
        u = img.get("url_fullxfull") or img.get("url_570xN") or img.get("url_170x135")
        if u:
            urls.append(u)

    images = []
    for u in urls:
        resp = requests.get(
            u,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; Etsy-Image-Proxy/1.0)",
                "Referer": "https://www.etsy.com/",
            },
            timeout=30,
        )
        resp.raise_for_status()
        images.append(resp.content)
    return images


def listing_id_from_url(etsy_url: str) -> Optional[str]:
    """Extract listing ID from Etsy listing URL."""
    m = re.search(r"listing/(\d+)", etsy_url)
    return m.group(1) if m else None


# --- OpenAI Oracle (Midjourney prompt generation) ---

ORACLE_SYSTEM_PROMPT = """You are the "Arcane Oracle," an expert AI art analyst. Analyze the image and extract details to recreate it in Midjourney.

Respond with ONLY a valid JSON object (no markdown, no code blocks) with exactly these fields:
{
  "name": "A short creative title (2-5 words)",
  "description": "A concise visual description (under 40 words)",
  "prompt": "A detailed Midjourney prompt that would recreate this image. Include: subject & composition, art style, colors, lighting, mood. End with: --ar 3:4 --v 6.1 --s 0"
}

Use specific color names (e.g. "dusty rose", "sage green"). The prompt must include --s 0. Be detailed (100-300 words for the prompt)."""


def analyze_slice(
    image_input,
    api_key: str,
    main_topic: Optional[str] = None,
    detail: str = "detailed",
) -> dict:
    """
    Analyze one image with OpenAI Vision and return name, description, prompt.

    Args:
        image_input: PIL Image, path, or base64 string.
        api_key: OpenAI API key.
        main_topic: Optional theme/topic context.
        detail: "normal" or "detailed".

    Returns:
        {"name", "description", "prompt"}
    """
    try:
        from openai import OpenAI
    except ImportError:
        raise ImportError("Install openai: pip install openai")

    if isinstance(image_input, Image.Image):
        buf = io.BytesIO()
        image_input.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
    elif isinstance(image_input, str):
        if image_input.startswith("data:"):
            b64 = image_input.split(",", 1)[1]
        elif Path(image_input).exists():
            with open(image_input, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
        else:
            b64 = image_input
    else:
        raise TypeError("image_input must be PIL Image, path, or base64 string")

    data_uri = f"data:image/png;base64,{b64}"
    user_content = "Analyze this image with extreme attention to detail. "
    if main_topic:
        user_content += f'The image is related to: "{main_topic}". '
    user_content += "Describe every visual element (colors, style, composition, lighting). Generate a detailed Midjourney prompt. Respond with JSON only: name, description, prompt (must end with --ar 3:4 --v 6.1 --s 0)."

    client = OpenAI(api_key=api_key)
    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": ORACLE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_uri, "detail": "high"}},
                    {"type": "text", "text": user_content},
                ],
            },
        ],
        max_tokens=2000,
        temperature=0.3,
    )
    text = response.choices[0].message.content
    if not text:
        raise ValueError("Empty response from OpenAI")

    text = text.strip()
    for prefix in ("```json", "```"):
        if text.startswith(prefix):
            text = text[len(prefix) :].strip()
    if text.endswith("```"):
        text = text[:-3].strip()
    result = json.loads(text)
    if "prompt" in result:
        result["prompt"] = re.sub(r"--s\s*\d+", "--s 0", result["prompt"])
    return result


def save_slices_as_zip(slices: List[dict], zip_path: str = "arcane_slices.zip") -> str:
    """Save list of slices (from slice_grid_image) to a ZIP file. Returns path."""
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for i, s in enumerate(slices):
            buf = io.BytesIO()
            s["image_pil"].save(buf, format="PNG")
            name = f"slice_{i + 1}_r{s['row'] + 1}c{s['col'] + 1}.png"
            zf.writestr(name, buf.getvalue())
    return zip_path


# --- WordPress upload (for style-ref URL + prompt format) ---


def upload_image_to_wordpress(
    wp_url: str,
    wp_username: str,
    wp_password: str,
    image_input,
    filename: Optional[str] = None,
) -> str:
    """
    Upload one image to WordPress Media Library via REST API.
    Returns the public URL of the uploaded image (source_url).

    Args:
        wp_url: WordPress site URL (e.g. https://gold-stingray-884517.hostingersite.com).
        wp_username: WordPress username.
        wp_password: WordPress Application Password.
        image_input: PIL Image, path, or base64 string.
        filename: Optional. Defaults to style-ref-{timestamp}.jpg.
    """
    if isinstance(image_input, Image.Image):
        buf = io.BytesIO()
        image_input.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        mime = "image/png"
    elif isinstance(image_input, str):
        if image_input.startswith("data:"):
            b64 = image_input.split(",", 1)[1]
            m = re.search(r"data:image/([^;]+)", image_input)
            mime = f"image/{m.group(1)}" if m else "image/png"
        elif Path(image_input).exists():
            with open(image_input, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")
            mime = "image/png"
        else:
            b64 = image_input
            mime = "image/png"
    else:
        raise TypeError("image_input must be PIL Image, path, or base64 string")

    raw = base64.b64decode(b64)
    final_filename = filename or f"style-ref-{int(__import__('time').time() * 1000)}.png"
    if not final_filename.lower().endswith((".png", ".jpg", ".jpeg")):
        final_filename += ".png"

    upload_url = wp_url.rstrip("/") + "/wp-json/wp/v2/media"
    boundary = f"----FormBoundary{int(__import__('time').time() * 1000)}"
    crlf = "\r\n"
    body = (
        f"--{boundary}{crlf}"
        f'Content-Disposition: form-data; name="file"; filename="{final_filename}"{crlf}'
        f"Content-Type: {mime}{crlf}{crlf}"
    ).encode("utf-8") + raw + f"{crlf}--{boundary}--{crlf}".encode("utf-8")

    auth = base64.b64encode(f"{wp_username}:{wp_password}".encode()).decode()
    r = requests.post(
        upload_url,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        data=body,
        timeout=60,
    )
    r.raise_for_status()
    data = r.json()
    if not data.get("source_url"):
        raise ValueError("WordPress response missing source_url")
    return data["source_url"]


def upload_slices_to_wordpress(
    slices: List[dict],
    wp_url: str,
    wp_username: str,
    wp_password: str,
) -> List[str]:
    """Upload each slice to WordPress; returns list of public URLs in same order as slices."""
    urls = []
    for i, s in enumerate(slices):
        url = upload_image_to_wordpress(
            wp_url, wp_username, wp_password,
            s["image_pil"],
            filename=f"style-ref-{int(__import__('time').time() * 1000)}.png",
        )
        urls.append(url)
    return urls


def format_prompts_with_urls(urls: List[str], results: List[dict]) -> List[str]:
    """
    Build prompts in the form: "https://...image.png Full prompt text --ar 3:4 --v 6.1 --s 0"
    One line per image. urls and results must be same length and aligned by index.
    """
    out = []
    for url, res in zip(urls, results):
        prompt = (res.get("prompt") or "").strip()
        if not prompt:
            out.append(url)
            continue
        out.append(f"{url} {prompt}")
    return out


# --- TTAPI (Midjourney) – for bulk prompt generation in Colab ---


def ttapi_imagine(prompt: str, api_key: str, domain: str = "https://api.ttapi.io") -> dict:
    """Submit one /imagine job. Returns API response (contains jobId etc.)."""
    r = requests.post(
        f"{domain.rstrip('/')}/midjourney/v1/imagine",
        headers={"TT-API-KEY": api_key, "Content-Type": "application/json"},
        json={"prompt": prompt},
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def ttapi_fetch(job_id: str, api_key: str, domain: str = "https://api.ttapi.io") -> dict:
    """Poll job status. Returns API response (status, imageUrl when complete, etc.)."""
    r = requests.get(
        f"{domain.rstrip('/')}/midjourney/v1/fetch",
        params={"jobId": job_id},
        headers={"TT-API-KEY": api_key, "Content-Type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def ttapi_imagine_bulk(
    prompts: List[str],
    api_key: str,
    domain: str = "https://api.ttapi.io",
    poll_interval: float = 5.0,
    max_wait_per_job: float = 300.0,
) -> List[dict]:
    """
    Submit each prompt to TTAPI /imagine, then poll until each job completes.
    Returns list of result dicts (one per prompt) with keys like status, imageUrl, jobId.
    """
    import time
    job_ids = []
    for p in prompts:
        p = (p or "").strip()
        if not p:
            job_ids.append(None)
            continue
        resp = ttapi_imagine(p, api_key, domain)
        job_ids.append(resp.get("jobId") or resp.get("id"))
    results = []
    for jid in job_ids:
        if jid is None:
            results.append({"status": "skipped", "imageUrl": None})
            continue
        start = time.time()
        while time.time() - start < max_wait_per_job:
            data = ttapi_fetch(jid, api_key, domain)
            status = (data.get("status") or data.get("state") or "").lower()
            if "complete" in status or "succeed" in status:
                results.append(data)
                break
            if "fail" in status or "error" in status:
                results.append(data)
                break
            time.sleep(poll_interval)
        else:
            results.append({"status": "timeout", "jobId": jid})
    return results


# --- Google Drive upload (for Colab) ---


def google_drive_refresh_token(client_id: str, client_secret: str, refresh_token: str) -> str:
    """Get a fresh access token from refresh token."""
    r = requests.post(
        "https://oauth2.googleapis.com/token",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
            "grant_type": "refresh_token",
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def google_drive_upload_file(
    access_token: str,
    folder_id: str,
    filename: str,
    file_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """Upload one file to a Drive folder. Returns dict with id, name, webViewLink."""
    boundary = "-------" + __import__("secrets").token_hex(8)
    metadata = {"name": filename, "parents": [folder_id]}
    parts = [
        f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n",
        json.dumps(metadata),
        f"\r\n--{boundary}\r\nContent-Type: {mime_type}\r\n\r\n",
    ]
    body = "".join(parts).encode("utf-8") + file_bytes + f"\r\n--{boundary}--".encode("utf-8")
    r = requests.post(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": f"multipart/related; boundary={boundary}",
        },
        data=body,
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    return {
        "id": data["id"],
        "name": data.get("name", filename),
        "webViewLink": f"https://drive.google.com/file/d/{data['id']}/view",
    }


def google_drive_upload_images(
    client_id: str,
    client_secret: str,
    refresh_token: str,
    parent_folder_id: str,
    images: List[Union[bytes, "Image.Image"]],
    filenames: Optional[List[str]] = None,
) -> List[dict]:
    """Upload multiple images to Google Drive. images: list of bytes or PIL Images. Returns list of {id, name, webViewLink}."""
    access_token = google_drive_refresh_token(client_id, client_secret, refresh_token)
    if filenames is None:
        filenames = [f"image_{i+1}.png" for i in range(len(images))]
    out = []
    for i, (img, name) in enumerate(zip(images, filenames)):
        if isinstance(img, Image.Image):
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            file_bytes = buf.getvalue()
            mime = "image/png"
        else:
            file_bytes = img
            mime = "image/png"
        if not name.lower().endswith((".png", ".jpg", ".jpeg")):
            name += ".png"
        out.append(google_drive_upload_file(access_token, parent_folder_id, name, file_bytes, mime))
    return out


def run_arcane_splitter(
    image_source: Union[str, Path, Image.Image, np.ndarray, List],
    rows: int = 3,
    cols: int = 4,
    auto_crop: bool = True,
    openai_api_key: Optional[str] = None,
    main_topic: Optional[str] = None,
    analyze: bool = True,
) -> Tuple[List[dict], List[dict]]:
    """
    One-shot: load image(s), slice, optionally analyze.

    Args:
        image_source: Path to one image, or list of paths/PIL images, or "etsy:LISTING_ID" (requires ETSY_API_KEY).
        rows, cols: Grid size (default 3×4).
        auto_crop: Trim white borders (default True).
        openai_api_key: If set and analyze=True, run Oracle on each slice.
        main_topic: Optional theme for Oracle.
        analyze: Whether to call OpenAI Vision on each slice (default True if openai_api_key set).

    Returns:
        (all_slices, analysis_results).
        all_slices: list of slice dicts (may be multiple grids concatenated).
        analysis_results: list of {"name","description","prompt"} per slice (empty if not analyzing).
    """
    all_slices = []
    if isinstance(image_source, str) and image_source.lower().startswith("etsy:"):
        listing_id = image_source.split(":", 1)[1].strip()
        if not listing_id.isdigit():
            listing_id = listing_id_from_url(listing_id) or listing_id
        images_bytes = fetch_etsy_listing_images(listing_id)
        for ib in images_bytes:
            img = Image.open(io.BytesIO(ib)).convert("RGB")
            all_slices.extend(
                slice_grid_image(img, rows=rows, cols=cols, auto_crop=auto_crop)
            )
    elif isinstance(image_source, (list, tuple)):
        for src in image_source:
            if isinstance(src, (str, Path)):
                img = Image.open(src).convert("RGB")
            else:
                img = src.convert("RGB") if hasattr(src, "convert") else Image.fromarray(src)
            all_slices.extend(
                slice_grid_image(img, rows=rows, cols=cols, auto_crop=auto_crop)
            )
    else:
        all_slices = slice_grid_image(image_source, rows=rows, cols=cols, auto_crop=auto_crop)

    results = []
    if analyze and openai_api_key:
        for s in all_slices:
            try:
                r = analyze_slice(s["image_pil"], openai_api_key, main_topic=main_topic)
                results.append(r)
            except Exception as e:
                results.append({"name": "Error", "description": str(e), "prompt": ""})
    return all_slices, results
