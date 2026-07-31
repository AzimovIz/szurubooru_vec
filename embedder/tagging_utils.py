from typing import List

import torch
import torchvision
from PIL import Image
from huggingface_hub import hf_hub_download

import deep_danbooru_model

device = "cpu"
torch.set_grad_enabled(False)
TORCH_DTYPE = torch.bfloat16

TAGGER_REPO = "desiartem17/deepgelbooru"
TAGGER_FILENAME = "model_epoch_2.bin"


def load_dgb_model(repo_id: str, filename: str, local_dir: str, cache_dir: str):
    hf_hub_download(
        repo_id=repo_id,
        filename=filename,
        local_dir=local_dir,
        cache_dir=cache_dir,
    )
    model_path = f"{local_dir}/{filename}"
    return deep_danbooru_model.DeepDanbooruModel.from_single_file(
        model_path, "cpu", TORCH_DTYPE
    )


def predict_tags_dgb(
    dgb_model, image: Image.Image, threshold: float = 0.3
) -> List[str]:
    if image.mode != "RGB":
        image = image.convert("RGB")
    pic = image.resize((512, 512))
    x = (
        torchvision.transforms.functional.pil_to_tensor(pic)
        .to(device, TORCH_DTYPE)
        .permute(1, 2, 0)
        .unsqueeze(0)
        / 255
    )

    y = dgb_model(x)[0]

    return [
        dgb_model.tags[i]
        for i, prob in enumerate(y)
        if float(prob) > threshold
    ]
