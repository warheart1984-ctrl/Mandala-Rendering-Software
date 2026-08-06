"""
SME-TXT — Text Reasoning Core Package
"""
from .models.loader import (
    ModelLoader,
    ModelMetadata,
    ModelBudget,
    QuantizationFormat,
    ModelFormat,
    create_model_manifest,
)
from .models.quantization import (
    build_llama_cpp,
    download_model,
    quantize_all_models,
    validate_models,
)
from .models.gguf import LlamaCppModel, LlamaCppModelFactory, LlamaCppConfig
from .models.safetensors import OrtModel, OrtModelFactory, OrtConfig
from .tokenizer.hf_tokenizer import SmeTokenizer, TokenizerFactory
from .tokenizer.chat_template import (
    ChatTemplate,
    ChatMessage,
    format_messages,
    SMOLLM_TEMPLATE,
    QWEN_TEMPLATE,
    PHI3_TEMPLATE,
)
from .ifc.txt_ifc import (
    SmeTxtIFC,
    TxtPrompt,
    MmEmbeddings,
    TxtResponse,
    DecisionRecord,
    create_txt_ifc,
)

__all__ = [
    # Models
    "ModelLoader",
    "ModelMetadata",
    "ModelBudget",
    "QuantizationFormat",
    "ModelFormat",
    "create_model_manifest",
    # Quantization
    "build_llama_cpp",
    "download_model",
    "quantize_all_models",
    "validate_models",
    # Backends
    "LlamaCppModel",
    "LlamaCppModelFactory",
    "LlamaCppConfig",
    "OrtModel",
    "OrtModelFactory",
    "OrtConfig",
    # Tokenizer
    "SmeTokenizer",
    "TokenizerFactory",
    # Chat template
    "ChatTemplate",
    "ChatMessage",
    "format_messages",
    "SMOLLM_TEMPLATE",
    "QWEN_TEMPLATE",
    "PHI3_TEMPLATE",
    # IFC
    "SmeTxtIFC",
    "TxtPrompt",
    "MmEmbeddings",
    "TxtResponse",
    "DecisionRecord",
    "create_txt_ifc",
]

__version__ = "1.0.0"