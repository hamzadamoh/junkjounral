# Arcane Splitter – Python / Google Colab

Python port of the Arcane Splitter for **Google Colab**: slice grid images (3×4), auto-crop white borders, generate Midjourney prompts (OpenAI Vision), **WordPress upload** (URL + prompt format), **bulk TTAPI** (Midjourney) generation, and **Google Drive** upload.

## Files

- **`arcane_splitter.py`** – Core module (slicing, Etsy, OpenAI, WordPress upload, TTAPI, Google Drive).
- **`Arcane_Splitter_Colab.ipynb`** – Colab notebook (install → slice → analyze → WordPress → bulk TTAPI → Drive).
- **`requirements.txt`** – Pip dependencies for Colab.

## Quick start in Colab

1. Open [Google Colab](https://colab.research.google.com).
2. **File → Upload notebook** and upload `Arcane_Splitter_Colab.ipynb`.
3. **Upload** the file `arcane_splitter.py` (e.g. via the notebook’s upload cell, or upload the whole `colab/` folder and `%cd colab`).
4. In the notebook, set **OPENAI_API_KEY** (and optionally **ETSY_API_KEY**, **WordPress**, **TTAPI**, **Google Drive**).
5. Run the cells: upload a grid image → slice + analyze → (optional) WordPress upload → (optional) bulk TTAPI → (optional) Google Drive upload.

## Use as a Python script (local or Colab)

```python
from arcane_splitter import slice_grid_image, analyze_slice, run_arcane_splitter, save_slices_as_zip

# Slice one grid image
slices = slice_grid_image("/path/to/grid.png", rows=3, cols=4, auto_crop=True)
save_slices_as_zip(slices, "slices.zip")

# Optional: analyze each slice with OpenAI Vision (Midjourney prompts)
for s in slices:
    result = analyze_slice(s["image_pil"], api_key="sk-...")
    print(result["name"], result["prompt"])

# One-shot: image path or "etsy:LISTING_ID" / "etsy:https://www.etsy.com/listing/..."
slices, results = run_arcane_splitter(
    "grid.png",  # or "etsy:1206601867" or "etsy:https://..."
    openai_api_key="sk-...",
    analyze=True,
)
```

## Etsy listings

To use an Etsy listing URL you need an **Etsy API key** ([get one here](https://www.etsy.com/developers/)). Set `ETSY_API_KEY` in the notebook or in `run_arcane_splitter(..., image_source="etsy:https://www.etsy.com/listing/1234567890/...")`. The script fetches all listing images and slices each one as a 3×4 grid.

## Dependencies

- **Pillow** – image load/save and cropping  
- **numpy** – grid detection  
- **requests** – Etsy API and image download  
- **openai** – GPT-4 Vision for prompt generation  

Install: `pip install -r requirements.txt`
