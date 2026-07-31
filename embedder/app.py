import io
import logging

import torch
from fastapi import FastAPI, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image
from starlette.requests import Request
from transformers import AutoImageProcessor, AutoModel

import tagging_utils

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("embedder")

MODEL_NAME = "facebook/dinov2-base"
CACHE_DIR = "/root/.cache/huggingface"

logger.info("Loading model %s...", MODEL_NAME)
processor = AutoImageProcessor.from_pretrained(
    MODEL_NAME, cache_dir=CACHE_DIR
)
model = AutoModel.from_pretrained(MODEL_NAME, cache_dir=CACHE_DIR)
model.eval()
logger.info("Model loaded (hidden_size=%d)", model.config.hidden_size)

logger.info("Loading tagging model %s...", tagging_utils.TAGGER_REPO)
dgb_model = tagging_utils.load_dgb_model(
    tagging_utils.TAGGER_REPO,
    tagging_utils.TAGGER_FILENAME,
    local_dir=f"{CACHE_DIR}/deepgelbooru",
    cache_dir=CACHE_DIR,
)
logger.info("Tagging model loaded (%d tags)", len(dgb_model.tags))

app = FastAPI()


@app.post("/embed")
async def embed(request: Request):
    content = await request.body()
    try:
        image = Image.open(io.BytesIO(content)).convert("RGB")
    except Exception as ex:
        return JSONResponse(
            status_code=400,
            content={"error": f"Could not decode image: {ex}"},
        )

    inputs = processor(images=image, return_tensors="pt")
    with torch.no_grad():
        outputs = model(**inputs)
    vector = outputs.pooler_output.detach().numpy().tolist()[0]
    return {"vector": vector}


@app.post("/tagging")
async def tagging(file: UploadFile):
    content = await file.read()
    try:
        image = Image.open(io.BytesIO(content))
    except Exception as ex:
        return JSONResponse(
            status_code=400,
            content={"error": f"Could not decode image: {ex}"},
        )

    tags = tagging_utils.predict_tags_dgb(dgb_model, image)
    return {"tags": tags}
